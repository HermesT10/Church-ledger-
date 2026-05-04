import { buildAnnualReturnAssistantSummary } from '@/lib/year-end-close/annual-return';
import type { AnnualAccountsPack } from '@/lib/annual-accounts/types';
import type {
  CharityAccountsAnnualReturnDataPack,
  CharityAccountsAssistantSnapshot,
  CharityAccountsChecklistItem,
  CharityAccountsFinalPackDocument,
  CharityAccountsReadinessSummary,
  CharityAccountsSupportingSchedule,
} from './types';

function sumRows(rows: { section?: string; totalCurrentYearPence?: number; currentYearPence?: number }[], section: string) {
  return rows
    .filter((row) => row.section === section)
    .reduce((total, row) => total + (row.totalCurrentYearPence ?? row.currentYearPence ?? 0), 0);
}

function sourceReport<T>(pack: AnnualAccountsPack, key: string): T | null {
  return (pack.sourceReports[key] as T | null | undefined) ?? null;
}

function item(input: CharityAccountsChecklistItem): CharityAccountsChecklistItem {
  return input;
}

export function calculateCharityAccountsReadiness(checklist: CharityAccountsChecklistItem[]): CharityAccountsReadinessSummary {
  const blockers = checklist.filter((entry) => entry.blocker || entry.status === 'blocked');
  const warnings = checklist.filter((entry) => entry.status === 'needs_review' || entry.status === 'missing');
  const readyCount = checklist.filter((entry) => entry.status === 'ready').length;
  const totalCount = checklist.length;
  const score = totalCount === 0 ? 0 : Math.round((readyCount / totalCount) * 100);

  return {
    score,
    status: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'needs_review' : 'ready',
    readyCount,
    totalCount,
    blockers,
    warnings,
  };
}

export function buildCharityAccountsChecklist(pack: AnnualAccountsPack): CharityAccountsChecklistItem[] {
  const trialBalance = sourceReport<{ isBalanced?: boolean }>(pack, 'trialBalance');
  const bankReconciliation = sourceReport<{ totals?: { differencePence?: number; unreconciledLines?: number } }>(pack, 'bankReconciliation');
  const giftAid = sourceReport<{ dashboard?: { recentBatchCount?: number; eligibleDonationsCount?: number; unclaimedAmountPence?: number } }>(pack, 'giftAid');
  const fundMovements = sourceReport<{ funds?: Array<{ fundType?: string; closingBalancePence?: number }> }>(pack, 'fundMovements');
  const bankDifferencePence = bankReconciliation?.totals?.differencePence ?? 0;
  const unreconciledLines = bankReconciliation?.totals?.unreconciledLines ?? 0;
  const hasPayroll = Number(pack.sourceReports.payrollRunCount ?? 0) > 0;
  const hasGiftAidActivity = Boolean((giftAid?.dashboard?.recentBatchCount ?? 0) + (giftAid?.dashboard?.eligibleDonationsCount ?? 0));
  const incomePence = sumRows(pack.sofaRows, 'income');
  const expenditurePence = Math.abs(sumRows(pack.sofaRows, 'expenditure'));
  const netAssets = pack.balanceSheetRows.find((row) => row.id === 'net-assets')?.currentYearPence ?? 0;
  const totalFunds = pack.balanceSheetRows.find((row) => row.id === 'total-charity-funds')?.currentYearPence ?? netAssets;
  const restrictedFundsNegative = (fundMovements?.funds ?? []).some((row) => row.fundType === 'restricted' && (row.closingBalancePence ?? 0) < 0);
  const annualAccountsBlockers = pack.validationResults.filter((result) => result.severity === 'blocker' && result.status === 'failed');

  return [
    item({
      id: 'charity-details-present',
      stepKey: 'charity-details',
      title: 'Charity details are present',
      description: 'Charity name, financial year, address, trustees, and contact details are available for the accounts pack.',
      status: pack.charityDetails.charityName && pack.periodEnd ? 'ready' : 'missing',
      source: 'annual_accounts.charity_details',
      href: '/reports/annual/accounts-builder',
    }),
    item({
      id: 'trustees-listed',
      stepKey: 'charity-details',
      title: 'Trustees and officers are listed',
      description: 'Trustees, treasurer, and signatories should be checked before filing.',
      status: pack.trusteesAndOfficers.length > 0 ? 'ready' : 'missing',
      source: 'annual_accounts.trustees_and_officers',
    }),
    item({
      id: 'bank-reconciliations-clear',
      stepKey: 'financial-records',
      title: 'Bank accounts reconciled',
      description: 'All bank accounts should agree to the ledger, or have an explicit explanation before final approval.',
      status: bankDifferencePence === 0 && unreconciledLines === 0 ? 'ready' : 'blocked',
      source: 'bank_reconciliation_summary',
      href: '/reports/bank-reconciliation-summary',
      blocker: bankDifferencePence !== 0 || unreconciledLines > 0,
    }),
    item({
      id: 'income-records-complete',
      stepKey: 'financial-records',
      title: 'Income records complete',
      description: 'Income totals should be generated from posted ledger data and reviewed by type.',
      status: incomePence > 0 ? 'ready' : 'needs_review',
      source: 'sofa.income',
      href: '/reports/sofa',
    }),
    item({
      id: 'expenses-reviewed',
      stepKey: 'financial-records',
      title: 'Expenses reviewed',
      description: 'Expense totals should be reviewed by category, fund, and supplier evidence.',
      status: expenditurePence > 0 ? 'ready' : 'needs_review',
      source: 'sofa.expenditure',
      href: '/reports/sofa',
    }),
    item({
      id: 'gift-aid-reviewed',
      stepKey: 'financial-records',
      title: 'Gift Aid reviewed',
      description: 'Gift Aid claims, declaration coverage, and unclaimed balances should be checked.',
      status: hasGiftAidActivity && (giftAid?.dashboard?.unclaimedAmountPence ?? 0) > 0 ? 'needs_review' : 'ready',
      source: 'gift_aid_summary',
      href: '/reports/gift-aid-summary',
    }),
    item({
      id: 'payroll-reviewed',
      stepKey: 'financial-records',
      title: 'Payroll reviewed',
      description: 'Payroll runs, employer costs, pension, and PAYE/NIC liabilities are included where payroll exists.',
      status: hasPayroll ? 'needs_review' : 'ready',
      source: 'payroll_runs',
      href: '/payroll',
    }),
    item({
      id: 'supporting-evidence-index',
      stepKey: 'independent-examination',
      title: 'Evidence index prepared',
      description: 'Receipts, invoices, payroll records, Gift Aid, bank evidence, and schedules should be available to the examiner.',
      status: pack.evidenceIndex.length > 0 ? 'ready' : 'missing',
      source: 'annual_accounts.evidence_index',
    }),
    item({
      id: 'trial-balance-balanced',
      stepKey: 'accounts-production',
      title: 'Trial balance balances',
      description: 'Total debits and credits must agree before final accounts approval.',
      status: trialBalance?.isBalanced ? 'ready' : 'blocked',
      source: 'trial_balance',
      href: '/reports/trial-balance',
      blocker: !trialBalance?.isBalanced,
    }),
    item({
      id: 'balance-sheet-balances',
      stepKey: 'accounts-production',
      title: 'Balance sheet balances',
      description: 'Net assets must agree to total charity funds.',
      status: netAssets === totalFunds ? 'ready' : 'blocked',
      source: 'balance_sheet',
      href: '/reports/balance-sheet',
      blocker: netAssets !== totalFunds,
    }),
    item({
      id: 'restricted-funds-reviewed',
      stepKey: 'supporting-schedules',
      title: 'Restricted funds reviewed',
      description: 'Restricted funds should not be negative without trustee explanation.',
      status: restrictedFundsNegative ? 'blocked' : 'ready',
      source: 'fund_movements',
      href: '/reports/fund-movements',
      blocker: restrictedFundsNegative,
    }),
    item({
      id: 'trustee-report-narrative',
      stepKey: 'trustee-report',
      title: 'Trustee report narrative complete',
      description: 'Objectives, activities, public benefit, financial review, reserves, risks, and future plans need trustee review.',
      status: pack.narrativeSections.publicBenefit && pack.narrativeSections.objectivesActivities ? 'ready' : 'needs_review',
      source: 'annual_accounts.narrative_sections',
    }),
    item({
      id: 'annual-return-data-pack',
      stepKey: 'annual-return-data-pack',
      title: 'Annual Return data pack generated',
      description: 'Gross income, expenditure, trustees, payroll indicators, activities, grants, and public benefit data are summarised.',
      status: 'ready',
      source: 'annual_return_assistant',
    }),
    item({
      id: 'annual-accounts-approved',
      stepKey: 'final-pack',
      title: 'Annual accounts approved',
      description: 'Final pack approval is blocked until annual accounts have trustee approval.',
      status: pack.approval.final && annualAccountsBlockers.length === 0 ? 'ready' : 'blocked',
      source: 'annual_accounts.approval',
      href: '/reports/annual/accounts-builder',
      blocker: !pack.approval.final || annualAccountsBlockers.length > 0,
    }),
  ];
}

export function buildCharityAccountsSupportingSchedules(pack: AnnualAccountsPack): CharityAccountsSupportingSchedule[] {
  const payrollRunCount = Number(pack.sourceReports.payrollRunCount ?? 0);
  const fundMovements = sourceReport<{ funds?: unknown[] }>(pack, 'fundMovements');

  return [
    { id: 'income-breakdown', title: 'Income breakdown by type', description: 'SOFA income rows grouped for Annual Return review.', status: pack.sofaRows.some((row) => row.section === 'income') ? 'ready' : 'needs_review', source: 'sofa', href: '/reports/sofa' },
    { id: 'expense-breakdown', title: 'Expense breakdown by category', description: 'SOFA expenditure rows grouped for trustee and examiner review.', status: pack.sofaRows.some((row) => row.section === 'expenditure') ? 'ready' : 'needs_review', source: 'sofa', href: '/reports/sofa' },
    { id: 'restricted-unrestricted-funds', title: 'Restricted and unrestricted funds', description: 'Fund movements and closing fund balances.', status: (fundMovements?.funds?.length ?? 0) > 0 ? 'ready' : 'needs_review', source: 'fund_movements', href: '/reports/fund-movements' },
    { id: 'debtors-creditors', title: 'Debtors and creditors', description: 'Balance sheet current asset and liability schedules.', status: pack.balanceSheetRows.length > 0 ? 'ready' : 'needs_review', source: 'balance_sheet', href: '/reports/balance-sheet' },
    { id: 'assets', title: 'Assets', description: 'Balance sheet asset rows and related notes.', status: pack.balanceSheetRows.some((row) => row.id.includes('asset')) ? 'ready' : 'needs_review', source: 'balance_sheet', href: '/reports/balance-sheet' },
    { id: 'payroll', title: 'Payroll', description: 'Payroll run totals, employer costs, pension, and payroll notes.', status: payrollRunCount > 0 ? 'needs_review' : 'ready', source: 'payroll_runs', href: '/payroll' },
    { id: 'gift-aid', title: 'Gift Aid', description: 'Gift Aid claim status and declaration coverage.', status: 'ready', source: 'gift_aid_summary', href: '/reports/gift-aid-summary' },
    { id: 'fund-movement', title: 'Fund movement', description: 'Opening, income, expenditure, transfers, and closing fund balances.', status: (fundMovements?.funds?.length ?? 0) > 0 ? 'ready' : 'needs_review', source: 'fund_movements', href: '/reports/fund-movements' },
    { id: 'trial-balance', title: 'Trial Balance', description: 'Year-end trial balance supporting the accounts.', status: sourceReport<{ isBalanced?: boolean }>(pack, 'trialBalance')?.isBalanced ? 'ready' : 'blocked', source: 'trial_balance', href: '/reports/trial-balance' },
  ];
}

export function buildCharityAccountsAnnualReturnDataPack(pack: AnnualAccountsPack): CharityAccountsAnnualReturnDataPack {
  const grossIncomePence = sumRows(pack.sofaRows, 'income');
  const grossExpenditurePence = Math.abs(sumRows(pack.sofaRows, 'expenditure'));
  const payrollRunCount = Number(pack.sourceReports.payrollRunCount ?? 0);
  const assistantSummary = buildAnnualReturnAssistantSummary(pack);

  return {
    generatedAt: new Date().toISOString(),
    financialYear: pack.financialYear,
    grossIncomePence,
    grossExpenditurePence,
    trusteeCount: pack.trusteesAndOfficers.length,
    trustees: pack.trusteesAndOfficers.map((trustee) => trustee.name),
    hasStaffOrPayroll: payrollRunCount > 0,
    activities: pack.narrativeSections.achievementsPerformance || pack.narrativeSections.objectivesActivities || null,
    grants: 'Review grant income in SOFA income notes and restricted fund movements.',
    publicBenefitNarrative: pack.narrativeSections.publicBenefit || pack.charityDetails.publicBenefitStatement || null,
    reservesPolicy: pack.narrativeSections.reservesPolicy || null,
    riskNotes: pack.narrativeSections.principalRisks || null,
    keyFinancialFigures: [
      { label: 'Gross income', amountPence: grossIncomePence },
      { label: 'Gross expenditure', amountPence: grossExpenditurePence },
      { label: 'Net movement in funds', amountPence: grossIncomePence - grossExpenditurePence },
    ],
    assistantSummary,
  };
}

export function buildCharityAccountsFinalPackDocuments(pack: AnnualAccountsPack): CharityAccountsFinalPackDocument[] {
  return [
    { id: 'annual-accounts', title: 'Annual accounts', description: 'SOFA, balance sheet, notes, fund movement, and approval page.', format: 'pdf', source: 'annual_accounts_pdf', required: true, href: '/reports/annual/accounts-builder' },
    { id: 'trustees-report', title: 'Trustee report', description: 'Editable trustee report narrative for trustee review and examiner comments.', format: 'docx', source: 'annual_accounts_docx', required: true, href: '/reports/annual/accounts-builder' },
    { id: 'examiner-pack', title: 'Independent examiner pack', description: 'Evidence index, schedules, validation checks, and audit trail references.', format: 'pack', source: 'evidence_index_and_schedules', required: true },
    { id: 'annual-return-data-pack', title: 'Annual Return data pack', description: 'Charity Commission filing values and narrative prompts for manual submission.', format: 'json', source: 'annual_return_data_pack', required: true },
    { id: 'agm-pack', title: 'AGM pack', description: 'Member-ready accounts summary and supporting schedules.', format: 'pdf', source: 'agm_pack', required: false, href: '/reports/agm' },
    { id: 'supporting-schedules', title: 'Supporting schedules workbook', description: 'Excel schedules for SOFA, balance sheet, notes, payroll, Gift Aid, and fund movement review.', format: 'excel', source: 'annual_accounts_excel', required: true, href: '/reports/annual/accounts-builder' },
    { id: 'evidence-index', title: 'Evidence index', description: 'CSV evidence index for receipts, invoices, bank records, Gift Aid, payroll, and approvals.', format: 'csv', source: pack.evidenceIndex.length > 0 ? 'annual_accounts_evidence_index' : 'missing_evidence_index', required: true },
  ];
}

export function buildCharityAccountsAssistantSnapshot(params: {
  pack: AnnualAccountsPack;
  basis: CharityAccountsAssistantSnapshot['basis'];
}): CharityAccountsAssistantSnapshot {
  const checklist = buildCharityAccountsChecklist(params.pack);

  return {
    financialYear: params.pack.financialYear,
    basis: params.basis,
    generatedAt: new Date().toISOString(),
    annualAccounts: params.pack,
    charityDetails: params.pack.charityDetails,
    trusteesAndOfficers: params.pack.trusteesAndOfficers,
    narrativeSections: params.pack.narrativeSections,
    checklist,
    readiness: calculateCharityAccountsReadiness(checklist),
    supportingSchedules: buildCharityAccountsSupportingSchedules(params.pack),
    annualReturnDataPack: buildCharityAccountsAnnualReturnDataPack(params.pack),
    finalPackDocuments: buildCharityAccountsFinalPackDocuments(params.pack),
  };
}
