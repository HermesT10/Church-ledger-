import type { AnnualAccountsPack, AnnualAccountsValidationResult } from './types';

function result(
  id: string,
  title: string,
  passed: boolean,
  failedMessage: string,
  source: string,
  severity: AnnualAccountsValidationResult['severity'] = 'blocker',
): AnnualAccountsValidationResult {
  return {
    id,
    title,
    severity: passed ? 'info' : severity,
    message: passed ? `${title} passed.` : failedMessage,
    status: passed ? 'passed' : severity === 'warning' ? 'needs_review' : 'failed',
    source,
  };
}

export function validateAnnualAccountsPack(pack: Omit<AnnualAccountsPack, 'validationResults' | 'exports'>): AnnualAccountsValidationResult[] {
  const rows = pack.balanceSheetRows;
  const notes = pack.notes;
  const hasPriorYearData = pack.sourceReports.priorYear !== null && pack.sourceReports.priorYear !== undefined;
  const trialBalance = pack.sourceReports.trialBalance as { isBalanced?: boolean } | null | undefined;
  const bankReconciliation = pack.sourceReports.bankReconciliation as { totals?: { differencePence?: number } } | null | undefined;
  const closeStatus = pack.sourceReports.yearEndClose as { complete?: boolean } | null | undefined;
  const giftAid = pack.sourceReports.giftAid as { dashboard?: { recentBatchCount?: number; eligibleDonationsCount?: number } } | null | undefined;
  const payrollRunCount = Number((pack.sourceReports.payrollRunCount as number | undefined) ?? 0);

  const netAssets = rows.find((row) => row.id === 'net-assets')?.currentYearPence ?? 0;
  const totalFunds = rows.find((row) => row.id === 'total-charity-funds')?.currentYearPence ?? netAssets;
  const fundMovementClosing = pack.sofaRows.find((row) => row.id === 'closing-fund-balances')?.totalCurrentYearPence ?? totalFunds;
  const restrictedPurposeNote = notes.find((note) => note.id === 'restricted-fund-purposes');
  const giftAidNote = notes.find((note) => note.id === 'gift-aid');
  const payrollNote = notes.find((note) => note.id === 'payroll-staff-costs');

  return [
    result('year-end-close-complete', 'Year-end close complete', Boolean(closeStatus?.complete), 'Year-end close has not been marked complete.', 'year_end_close', 'warning'),
    result('bank-accounts-reconciled', 'Bank accounts reconciled', (bankReconciliation?.totals?.differencePence ?? 0) === 0, 'Bank reconciliation differences remain.', 'bank_reconciliation', 'warning'),
    result('trial-balance-balanced', 'Trial balance balanced', Boolean(trialBalance?.isBalanced), 'Trial balance is not balanced.', 'trial_balance'),
    result('sofa-agrees-to-ledger', 'SOFA agrees to ledger', pack.sofaRows.length > 0, 'SOFA rows could not be generated from ledger data.', 'sofa'),
    result('balance-sheet-balances', 'Balance sheet balances', netAssets === totalFunds, 'Net assets do not agree to total charity funds.', 'balance_sheet'),
    result('fund-balances-agree', 'Fund balances agree to fund movement note', totalFunds === fundMovementClosing, 'Total charity funds do not agree to fund movement closing balances.', 'fund_movements'),
    result('restricted-funds-have-purposes', 'Restricted funds have purposes', !restrictedPurposeNote?.missingReason, 'Restricted fund purposes need trustee confirmation.', 'funds', 'warning'),
    result(
      'gift-aid-summary-included',
      'Gift Aid summary included when claims exist',
      ((giftAid?.dashboard?.recentBatchCount ?? 0) + (giftAid?.dashboard?.eligibleDonationsCount ?? 0) === 0) || Boolean(giftAidNote),
      'Gift Aid activity exists but no Gift Aid note was generated.',
      'gift_aid',
      'warning',
    ),
    result('payroll-note-included', 'Payroll note included when payroll exists', payrollRunCount === 0 || Boolean(payrollNote), 'Payroll exists but the staff costs note is missing.', 'payroll_runs', 'warning'),
    result('prior-year-comparatives', 'Prior-year comparatives included or explained', hasPriorYearData || notes.some((note) => note.id === 'comparatives'), 'Prior-year comparatives need to be included or explained.', 'prior_year', 'warning'),
    result('trustee-approval-present', 'Trustee approval present before final export', pack.approval.final, 'Trustee approval is required before final export.', 'approval'),
  ];
}

export function hasAnnualAccountsBlockers(results: AnnualAccountsValidationResult[]) {
  return results.some((item) => item.severity === 'blocker' && item.status === 'failed');
}
