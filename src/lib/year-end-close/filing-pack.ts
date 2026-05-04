import {
  buildAnnualAccountsDocxExport,
  buildAnnualAccountsEvidenceIndexExport,
  buildAnnualAccountsExcelExport,
  buildAnnualAccountsPdfExport,
} from '@/lib/annual-accounts/exports';
import { loadAnnualAccountsPack } from '@/lib/annual-accounts/data';
import { getFundMovementsReport } from '@/lib/reports/actions';
import { getSOFAReport, getTrialBalance } from '@/lib/reports/glReports';
import { getBankReconciliationSummaryReport, getGiftAidSummaryReport } from '@/lib/reports/summaryReports';
import { buildAnnualReturnAssistantSummary } from './annual-return';
import type { FilingPackPayload, YearEndCloseRun } from './types';

export async function composeYearEndFilingPack(run: YearEndCloseRun): Promise<{
  data: FilingPackPayload | null;
  error: string | null;
}> {
  const annualAccounts = await loadAnnualAccountsPack({ financialYear: run.financialYear, basis: run.basis });
  if (!annualAccounts.data) {
    return { data: null, error: annualAccounts.error ?? 'Annual accounts could not be generated.' };
  }

  const [trialBalance, sofa, fundMovements, bankReconciliation, giftAid] = await Promise.all([
    getTrialBalance({ asOfDate: run.periodEnd }),
    getSOFAReport({ year: run.financialYear }),
    getFundMovementsReport({ organisationId: run.workspaceId, year: run.financialYear, mode: 'YTD' }),
    getBankReconciliationSummaryReport({ organisationId: run.workspaceId }),
    getGiftAidSummaryReport({ organisationId: run.workspaceId }),
  ]);

  const annualReturnSummary = buildAnnualReturnAssistantSummary(annualAccounts.data);
  const pdf = buildAnnualAccountsPdfExport(annualAccounts.data);
  const docx = buildAnnualAccountsDocxExport(annualAccounts.data);
  const excel = buildAnnualAccountsExcelExport(annualAccounts.data);
  const evidence = buildAnnualAccountsEvidenceIndexExport(annualAccounts.data);

  return {
    data: {
      runId: run.id,
      financialYear: run.financialYear,
      generatedAt: new Date().toISOString(),
      annualAccounts: annualAccounts.data,
      annualReturnSummary,
      documents: [
        {
          id: 'annual-accounts-pdf',
          title: 'Annual accounts PDF',
          description: 'Stored document-production PDF export with cover, contents, statements, notes, approval page, evidence index, footer, and draft/final watermark.',
          format: 'pdf',
          source: pdf.filename,
          required: true,
        },
        {
          id: 'trustee-report-docx',
          title: 'Trustee annual report DOCX',
          description: 'Editable document-production DOCX export for trustee and examiner comments.',
          format: 'docx',
          source: docx.filename,
          required: true,
        },
        {
          id: 'accounts-schedules-excel',
          title: 'Accounts schedules workbook',
          description: 'ExcelJS workbook export with SOFA, balance sheet, notes, and supporting schedules.',
          format: 'excel',
          source: excel.filename,
          required: true,
        },
        {
          id: 'evidence-index',
          title: 'Evidence index',
          description: 'CSV evidence index export linked to the annual accounts pack.',
          format: 'csv',
          source: evidence.filename,
          required: true,
        },
        {
          id: 'annual-return-assistant',
          title: 'Annual Return Assistant summary',
          description: 'Structured Charity Commission Annual Return data pack for manual review and filing.',
          format: 'json',
          source: 'annual_return_summary',
          required: true,
        },
      ],
      schedules: {
        trialBalance: trialBalance.data,
        sofa: sofa.data,
        fundMovements: fundMovements.data,
        bankReconciliation: bankReconciliation.data,
        giftAid: giftAid.data,
        payrollSummary: {
          runCount: annualAccounts.data.sourceReports.payrollRunCount ?? 0,
          ...(annualAccounts.data.sourceReports.payrollSummary as Record<string, unknown> | undefined),
        },
        auditLogExtract: {
          source: 'audit_log',
          description: 'Lifecycle actions are logged by year-end close server actions.',
        },
      },
      examinerChecklist: [
        {
          id: 'bank-reconciliation',
          title: 'Bank reconciliation summary agrees at year end',
          source: 'bank_reconciliation_summary',
          status: bankReconciliation.data?.totals.differencePence === 0 ? 'ready' : 'needs_review',
        },
        {
          id: 'trial-balance',
          title: 'Trial balance balances',
          source: 'trial_balance',
          status: trialBalance.data?.isBalanced ? 'ready' : 'needs_review',
        },
        {
          id: 'sofa',
          title: 'SOFA generated for filing year',
          source: 'sofa',
          status: sofa.data ? 'ready' : 'missing',
        },
        {
          id: 'evidence-index',
          title: 'Evidence index prepared',
          source: evidence.filename,
          status: annualAccounts.data.evidenceIndex.length > 0 ? 'ready' : 'needs_review',
        },
      ],
    },
    error: null,
  };
}
