import type {
  DashboardFinancialAlert,
  DashboardMonthlyIncomeExpense,
  DashboardRestrictedFundStatus,
  DashboardRestrictedFundTrackerRow,
  DashboardYearComparison,
} from './types';

export interface DashboardLedgerLineInput {
  accountId: string;
  accountType: string;
  fundId: string | null;
  journalDate: string;
  debitPence: number;
  creditPence: number;
}

export interface DashboardFundInput {
  id: string;
  name: string;
}

export interface DashboardAlertInput {
  restrictedFunds: DashboardRestrictedFundTrackerRow[];
  loansOutstandingPence: number;
  ytdIncomePence: number;
  ytdExpensePence: number;
  unallocatedBankLines: number;
  hasGiftAidOpportunity: boolean;
  uncategorisedExpenseCount: number;
}

export interface DashboardCashTotalInput {
  balancePence: number;
}

export interface DashboardLiabilityInput {
  code: string;
  name: string;
  netPence: number;
}

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function incomeNetPence(line: Pick<DashboardLedgerLineInput, 'creditPence' | 'debitPence'>): number {
  return line.creditPence - line.debitPence;
}

export function expenseNetPence(line: Pick<DashboardLedgerLineInput, 'debitPence' | 'creditPence'>): number {
  return line.debitPence - line.creditPence;
}

export function liabilityBalancePence(line: Pick<DashboardLedgerLineInput, 'creditPence' | 'debitPence'>): number {
  return line.creditPence - line.debitPence;
}

export function sumCashPositionRows(rows: DashboardCashTotalInput[]): number {
  return rows.reduce((sum, row) => sum + row.balancePence, 0);
}

export function calculateLoanAndLiabilityTotals(accounts: DashboardLiabilityInput[]): {
  loansOutstandingPence: number;
  otherLiabilitiesPence: number;
} {
  return accounts.reduce(
    (totals, account) => {
      const balancePence = Math.max(0, -account.netPence);
      const isLoan = /loan|mortgage|borrow/i.test(`${account.code} ${account.name}`);
      if (isLoan) {
        totals.loansOutstandingPence += balancePence;
      } else {
        totals.otherLiabilitiesPence += balancePence;
      }
      return totals;
    },
    { loansOutstandingPence: 0, otherLiabilitiesPence: 0 },
  );
}

export function restrictedFundStatus(
  donatedPence: number,
  usedPence: number,
  missingData = false,
): DashboardRestrictedFundStatus {
  if (missingData) return 'needs_review';

  const remainingPence = donatedPence - usedPence;
  if (remainingPence < 0) return 'overspent';
  if (remainingPence === 0 && donatedPence > 0) return 'fully_used';
  if (donatedPence <= 0) return 'needs_review';
  if (remainingPence <= donatedPence * 0.2) return 'low_remaining';
  return 'healthy';
}

export function buildRestrictedFundTracker(
  funds: DashboardFundInput[],
  lines: DashboardLedgerLineInput[],
): DashboardRestrictedFundTrackerRow[] {
  return funds.map((fund) => {
    const fundLines = lines.filter((line) => line.fundId === fund.id);
    const donatedPence = fundLines
      .filter((line) => line.accountType === 'income')
      .reduce((sum, line) => sum + incomeNetPence(line), 0);
    const usedPence = fundLines
      .filter((line) => line.accountType === 'expense')
      .reduce((sum, line) => sum + expenseNetPence(line), 0);
    const remainingPence = donatedPence - usedPence;

    return {
      fundId: fund.id,
      fundName: fund.name,
      donatedPence,
      usedPence,
      remainingPence,
      status: restrictedFundStatus(donatedPence, usedPence, fundLines.length === 0),
      href: `/funds/${fund.id}`,
    };
  });
}

export function buildMonthlyIncomeExpense(
  selectedYear: number,
  lines: DashboardLedgerLineInput[],
): DashboardMonthlyIncomeExpense[] {
  return MONTH_NAMES.map((month, index) => {
    const monthNumber = index + 1;
    const monthLines = lines.filter((line) => {
      const date = new Date(line.journalDate);
      return date.getFullYear() === selectedYear && date.getMonth() === index;
    });
    const incomePence = monthLines
      .filter((line) => line.accountType === 'income')
      .reduce((sum, line) => sum + incomeNetPence(line), 0);
    const expensePence = monthLines
      .filter((line) => line.accountType === 'expense')
      .reduce((sum, line) => sum + expenseNetPence(line), 0);

    const monthParam = String(monthNumber).padStart(2, '0');
    return {
      month,
      monthNumber,
      incomePence,
      expensePence,
      netPence: incomePence - expensePence,
      incomeHref: `/income/register?year=${selectedYear}&month=${monthParam}`,
      expenseHref: `/expenses/register?year=${selectedYear}&month=${monthParam}`,
    };
  });
}

export function buildYearComparison(
  currentYear: number,
  currentLines: DashboardLedgerLineInput[],
  previousLines: DashboardLedgerLineInput[],
): DashboardYearComparison {
  const currentIncomePence = currentLines
    .filter((line) => line.accountType === 'income')
    .reduce((sum, line) => sum + incomeNetPence(line), 0);
  const currentExpensePence = currentLines
    .filter((line) => line.accountType === 'expense')
    .reduce((sum, line) => sum + expenseNetPence(line), 0);
  const previousIncomePence = previousLines
    .filter((line) => line.accountType === 'income')
    .reduce((sum, line) => sum + incomeNetPence(line), 0);
  const previousExpensePence = previousLines
    .filter((line) => line.accountType === 'expense')
    .reduce((sum, line) => sum + expenseNetPence(line), 0);

  return {
    currentYear,
    previousYear: currentYear - 1,
    currentIncomePence,
    currentExpensePence,
    previousIncomePence,
    previousExpensePence,
    incomeVariancePence: currentIncomePence - previousIncomePence,
    expenseVariancePence: currentExpensePence - previousExpensePence,
    incomeVariancePct: previousIncomePence === 0
      ? null
      : Math.round(((currentIncomePence - previousIncomePence) / Math.abs(previousIncomePence)) * 1000) / 10,
    expenseVariancePct: previousExpensePence === 0
      ? null
      : Math.round(((currentExpensePence - previousExpensePence) / Math.abs(previousExpensePence)) * 1000) / 10,
  };
}

export function buildFinancialAlerts(input: DashboardAlertInput): DashboardFinancialAlert[] {
  const alerts: DashboardFinancialAlert[] = [];
  const overspentFunds = input.restrictedFunds.filter((fund) => fund.status === 'overspent');
  const lowFunds = input.restrictedFunds.filter((fund) => fund.status === 'low_remaining');

  if (overspentFunds.length > 0) {
    alerts.push({
      id: 'restricted-fund-overspent',
      severity: 'critical',
      message: `${overspentFunds.length} restricted fund${overspentFunds.length === 1 ? '' : 's'} overspent.`,
      recommendedAction: `Review ${overspentFunds[0].fundName} and correct postings or trustee approvals.`,
      href: overspentFunds[0].href,
    });
  }

  if (lowFunds.length > 0) {
    alerts.push({
      id: 'restricted-fund-low',
      severity: 'warning',
      message: `${lowFunds.length} restricted fund${lowFunds.length === 1 ? '' : 's'} nearly used.`,
      recommendedAction: 'Check whether remaining restricted balances still cover planned activity.',
      href: lowFunds[0].href,
    });
  }

  if (input.loansOutstandingPence > 0) {
    alerts.push({
      id: 'loan-balance-exists',
      severity: 'info',
      message: 'Loan or liability balance exists.',
      recommendedAction: 'Review repayment schedule and ensure liabilities agree to statements.',
      href: '/accounts?type=liability',
    });
  }

  if (input.ytdExpensePence > input.ytdIncomePence) {
    alerts.push({
      id: 'expenses-exceed-income',
      severity: 'warning',
      message: 'Expenses exceed income for the selected year.',
      recommendedAction: 'Review expense register and cashflow before approving new commitments.',
      href: '/expenses/register',
    });
  }

  if (input.unallocatedBankLines > 0) {
    alerts.push({
      id: 'unallocated-bank-lines',
      severity: 'warning',
      message: `${input.unallocatedBankLines} bank transaction${input.unallocatedBankLines === 1 ? '' : 's'} need allocation.`,
      recommendedAction: 'Allocate imported bank lines so reports stay complete.',
      href: '/banking',
    });
  }

  if (input.hasGiftAidOpportunity) {
    alerts.push({
      id: 'gift-aid-opportunity',
      severity: 'info',
      message: 'Gift Aid claims are available to prepare.',
      recommendedAction: 'Review eligible donations and submit a claim batch.',
      href: '/gift-aid/new',
    });
  }

  if (input.uncategorisedExpenseCount > 0) {
    alerts.push({
      id: 'uncategorised-expenses',
      severity: 'info',
      message: `${input.uncategorisedExpenseCount} expense account${input.uncategorisedExpenseCount === 1 ? '' : 's'} need register mapping.`,
      recommendedAction: 'Review uncategorised expenses and save category mappings.',
      href: '/expenses/register',
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: 'all-clear',
      severity: 'success',
      message: 'No urgent dashboard alerts.',
      recommendedAction: 'Continue monthly review and reconciliation cadence.',
      href: '/month-end',
    });
  }

  return alerts;
}
