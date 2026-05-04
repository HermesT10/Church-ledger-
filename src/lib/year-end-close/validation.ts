import { getTrialBalance } from '@/lib/reports/glReports';
import { getBankReconciliationSummaryReport } from '@/lib/reports/summaryReports';
import { loadAnnualAccountsPack } from '@/lib/annual-accounts/data';
import type { YearEndCloseBlocker, YearEndCloseRun, YearEndCloseStepKey, YearEndCloseValidationSummary } from './types';

type LooseQuery = PromiseLike<{ count: number | null }> & {
  select: (columns: string, options?: { count?: 'exact'; head?: boolean }) => LooseQuery;
  eq: (column: string, value: unknown) => LooseQuery;
  in: (column: string, values: string[]) => PromiseLike<{ count: number | null }>;
};

type LooseClient = {
  from: (table: string) => LooseQuery;
};

function blocker(input: Omit<YearEndCloseBlocker, 'id'>): YearEndCloseBlocker {
  return {
    id: `${input.stepKey}-${input.source}`.replaceAll('_', '-'),
    ...input,
  };
}

function isComplete(run: YearEndCloseRun, stepKey: YearEndCloseStepKey) {
  const step = run.steps.find((item) => item.stepKey === stepKey);
  return step?.status === 'complete' || step?.status === 'waived';
}

async function safeCount(
  client: unknown,
  table: string,
  orgId: string,
  column = 'organisation_id',
  statuses?: string[],
) {
  try {
    const looseClient = client as LooseClient;
    const query = looseClient.from(table).select('id', { count: 'exact', head: true }).eq(column, orgId);

    if (statuses) {
      return (await query.in('status', statuses)).count ?? 0;
    }

    return (await query).count ?? 0;
  } catch {
    return 0;
  }
}

export async function validateYearEndCloseReadiness(params: {
  run: YearEndCloseRun;
  workspaceId: string;
  supabase: unknown;
}): Promise<YearEndCloseValidationSummary> {
  const { run, workspaceId, supabase } = params;
  const blockers: YearEndCloseBlocker[] = [];

  if (!run.periodStart || !run.periodEnd || run.periodEnd < run.periodStart) {
    blockers.push(blocker({
      stepKey: 'confirm-financial-year-dates',
      severity: 'blocker',
      title: 'Financial year dates are invalid',
      message: 'The close run needs a valid start and end date before year-end can proceed.',
      source: 'financial_periods',
      recommendedAction: 'Correct the financial year dates and link or create a matching financial period.',
      waivable: false,
    }));
  }

  const bankSummary = await getBankReconciliationSummaryReport({ organisationId: workspaceId });
  const bankDifferencePence = bankSummary.data?.totals.differencePence ?? 0;
  if (Math.abs(bankDifferencePence) > 0) {
    blockers.push(blocker({
      stepKey: 'reconcile-bank-accounts',
      severity: 'blocker',
      title: 'Bank reconciliation difference remains',
      message: `The reconciliation summary has a difference of ${bankDifferencePence} pence.`,
      source: 'bank_reconciliation_summary',
      count: Math.abs(bankDifferencePence),
      href: '/reports/bank-reconciliation-summary',
      recommendedAction: 'Complete reconciliation until cash book and bank statement balances agree.',
      waivable: false,
    }));
  }

  const [
    draftJournals,
    draftBills,
    draftPayrollRuns,
    portalInvoices,
    portalExpenses,
    portalCashCollections,
  ] = await Promise.all([
    safeCount(supabase, 'journals', workspaceId, 'organisation_id', ['draft']),
    safeCount(supabase, 'bills', workspaceId, 'organisation_id', ['draft', 'pending_approval']),
    safeCount(supabase, 'payroll_runs', workspaceId, 'organisation_id', ['draft', 'pending_approval']),
    safeCount(supabase, 'portal_invoice_submissions', workspaceId, 'workspace_id', ['draft', 'submitted']),
    safeCount(supabase, 'portal_expense_submissions', workspaceId, 'workspace_id', ['draft', 'submitted']),
    safeCount(supabase, 'portal_cash_collection_submissions', workspaceId, 'workspace_id', ['draft', 'submitted']),
  ]);
  const unpostedDrafts = draftJournals + draftBills + draftPayrollRuns + portalInvoices + portalExpenses + portalCashCollections;
  if (unpostedDrafts > 0) {
    blockers.push(blocker({
      stepKey: 'review-unposted-drafts',
      severity: 'warning',
      title: 'Unposted or unapproved drafts need review',
      message: `${unpostedDrafts} draft or submitted items may affect the year-end accounts.`,
      source: 'draft_registers',
      count: unpostedDrafts,
      recommendedAction: 'Approve, post, reject, or explicitly waive draft items before final approval.',
      waivable: true,
    }));
  }

  const annualAccounts = await loadAnnualAccountsPack({ financialYear: run.financialYear, basis: run.basis });
  const packBlockers = annualAccounts.data?.validationResults.filter((item) => item.severity === 'blocker' && item.status === 'failed') ?? [];
  if (packBlockers.length > 0) {
    blockers.push(blocker({
      stepKey: 'generate-annual-accounts',
      severity: 'blocker',
      title: 'Annual accounts have blocking validation issues',
      message: `${packBlockers.length} annual accounts checks need to be resolved before approval.`,
      source: 'annual_accounts_validation',
      count: packBlockers.length,
      href: `/reports/annual/accounts-builder?year=${run.financialYear}&basis=${run.basis}`,
      recommendedAction: 'Open the annual accounts builder and resolve blocking validation checks.',
      waivable: false,
    }));
  }

  const trialBalance = await getTrialBalance({ asOfDate: run.periodEnd });
  if (trialBalance.data && !trialBalance.data.isBalanced) {
    blockers.push(blocker({
      stepKey: 'generate-trial-balance',
      severity: 'blocker',
      title: 'Trial balance is not balanced',
      message: 'Total debits do not equal total credits at the financial year end.',
      source: 'trial_balance',
      recommendedAction: 'Investigate journal postings and balancing entries.',
      waivable: false,
    }));
  }

  if (!isComplete(run, 'trustee-review')) {
    blockers.push(blocker({
      stepKey: 'trustee-review',
      severity: 'blocker',
      title: 'Trustee review is not complete',
      message: 'Trustee review must be completed before final approval.',
      source: 'report_approvals',
      recommendedAction: 'Submit the pack to trustees and record their review.',
      waivable: false,
    }));
  }

  if (!isComplete(run, 'final-approval') && run.status !== 'approved') {
    blockers.push(blocker({
      stepKey: 'final-approval',
      severity: 'blocker',
      title: 'Final approval is required',
      message: 'Final approval must be recorded before locking the financial year.',
      source: 'report_approvals',
      recommendedAction: 'Record final approval once trustee and examiner review are complete.',
      waivable: false,
    }));
  }

  const stepStatuses = blockers.reduce<YearEndCloseValidationSummary['stepStatuses']>((acc, item) => {
    acc[item.stepKey] = item.severity === 'blocker' ? 'blocked' : 'in_progress';
    return acc;
  }, {});

  return {
    runId: run.id,
    generatedAt: new Date().toISOString(),
    status: blockers.some((item) => item.severity === 'blocker') ? 'blocked' : blockers.length > 0 ? 'needs_review' : 'passed',
    blockers,
    stepStatuses,
    sourceCounts: {
      bankDifferencePence,
      unpostedDrafts,
      annualAccountsBlockers: packBlockers.length,
      trialBalanceRows: trialBalance.data?.rows.length ?? 0,
    },
  };
}
