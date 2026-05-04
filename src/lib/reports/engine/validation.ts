import type { ReportSnapshot, ReportValidationResult } from './types';

function validationResult(params: ReportValidationResult): ReportValidationResult {
  return params;
}

export function hasBlockingValidations(results: ReportValidationResult[]): boolean {
  return results.some((result) => result.severity === 'blocker');
}

export function validateTrialBalance(data: unknown): ReportValidationResult[] {
  const report = data as { isBalanced?: boolean; totalDebitPence?: number; totalCreditPence?: number } | null;
  if (!report || report.isBalanced !== false) return [];
  return [
    validationResult({
      id: 'trial-balance-imbalance',
      severity: 'blocker',
      rule: 'trial_balance_balances',
      title: 'Trial balance does not balance',
      message: `Debits (${report.totalDebitPence ?? 0}) and credits (${report.totalCreditPence ?? 0}) do not match.`,
    }),
  ];
}

export function validateBalanceSheet(data: unknown): ReportValidationResult[] {
  const report = data as { check?: { balances?: boolean; difference?: number } } | null;
  if (!report?.check || report.check.balances !== false) return [];
  return [
    validationResult({
      id: 'balance-sheet-imbalance',
      severity: 'blocker',
      rule: 'balance_sheet_balances',
      title: 'Balance sheet does not balance',
      message: `Assets do not equal liabilities plus funds. Difference: ${report.check.difference ?? 0} pence.`,
      amountPence: report.check.difference ?? 0,
    }),
  ];
}

export function validatePriorYearData(data: unknown): ReportValidationResult[] {
  const report = data as { priorYear?: unknown } | null;
  if (!report || !('priorYear' in report) || report.priorYear) return [];
  return [
    validationResult({
      id: 'missing-prior-year-data',
      severity: 'warning',
      rule: 'missing_prior_year_data',
      title: 'Prior year data is missing',
      message: 'Prior year comparison data is not available for this report.',
    }),
  ];
}

export function validateNegativeRestrictedFunds(data: unknown): ReportValidationResult[] {
  const text = JSON.stringify(data ?? {});
  if (!text.includes('"fundType":"restricted"') && !text.includes('"fund_type":"restricted"')) return [];
  if (!text.match(/"balancePence":-\d+|"closingBalancePence":-\d+|"remainingPence":-\d+/)) return [];
  return [
    validationResult({
      id: 'restricted-fund-negative-balance',
      severity: 'warning',
      rule: 'restricted_fund_negative_balance',
      title: 'Restricted fund may be overspent',
      message: 'A restricted fund appears to have a negative balance and should be reviewed before approval.',
    }),
  ];
}

export function validateReportPayload(snapshot: Pick<ReportSnapshot, 'metadata' | 'data' | 'definition' | 'traceability'>): ReportValidationResult[] {
  const results: ReportValidationResult[] = [];
  if (snapshot.definition.validationRules.includes('trial_balance_balances')) {
    results.push(...validateTrialBalance(snapshot.data));
  }
  if (snapshot.definition.validationRules.includes('balance_sheet_balances')) {
    results.push(...validateBalanceSheet(snapshot.data));
  }
  if (snapshot.definition.validationRules.includes('missing_prior_year_data')) {
    results.push(...validatePriorYearData(snapshot.data));
  }
  if (snapshot.definition.validationRules.includes('restricted_fund_negative_balance')) {
    results.push(...validateNegativeRestrictedFunds(snapshot.data));
  }
  if (snapshot.traceability.length === 0) {
    results.push({
      id: 'missing-report-traceability',
      severity: 'warning',
      rule: 'missing_report_traceability',
      title: 'Traceability summary is limited',
      message: 'No material line traceability was attached to this snapshot yet.',
    });
  }
  return results;
}

export function buildOperationalValidationWarnings(params: {
  draftJournalCount: number;
  unreconciledBankLineCount: number;
  missingFundMappingCount: number;
}): ReportValidationResult[] {
  const results: ReportValidationResult[] = [];
  if (params.draftJournalCount > 0) {
    results.push({
      id: 'draft-journals-excluded',
      severity: 'info',
      rule: 'drafts_excluded',
      title: 'Draft journals excluded',
      message: `${params.draftJournalCount} draft journal(s) exist in the workspace and are excluded from posted reports.`,
    });
  }
  if (params.unreconciledBankLineCount > 0) {
    results.push({
      id: 'unreconciled-bank-transactions',
      severity: 'warning',
      rule: 'unreconciled_bank_transactions',
      title: 'Unreconciled bank transactions',
      message: `${params.unreconciledBankLineCount} bank transaction(s) are unreconciled and may affect cash confidence.`,
    });
  }
  if (params.missingFundMappingCount > 0) {
    results.push({
      id: 'missing-fund-mapping',
      severity: 'warning',
      rule: 'missing_fund_or_category_mapping',
      title: 'Missing fund mappings',
      message: `${params.missingFundMappingCount} journal line(s) have no fund mapping.`,
    });
  }
  return results;
}
