/* Report types (shared, not a server action file) */

import type { BudgetRow, FundRef } from '@/lib/budgets/types';

export interface SMonthCell {
  budget: number;
  actual: number;
  variance: number;
  variancePct: number | null;
}

export interface SBvaRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  months: Record<string, SMonthCell>;
  ytd: SMonthCell;
  annual: SMonthCell;
}

export interface SBvaTotals {
  months: Record<string, SMonthCell>;
  ytd: SMonthCell;
  annual: SMonthCell;
}

export interface BvaReportData {
  rows: SBvaRow[];
  totals: SBvaTotals;
  budgets: BudgetRow[];
  funds: FundRef[];
}

export interface SOverspendAlert {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  adverseVariancePence: number;
  adverseVariancePct: number | null;
  budgetPence: number;
  actualPence: number;
}

export interface MonthlyChartPoint {
  month: string;
  budget: number;
  actual: number;
}

export interface DashboardData {
  accountCount: number;
  budgetCount: number;
  bankAccountCount: number;
  alertCount: number;
  monthlyIncome: MonthlyChartPoint[];
  monthlyExpense: MonthlyChartPoint[];
  alerts: SOverspendAlert[];
  totalIncomeBudget: number;
  totalIncomeActual: number;
  totalExpenseBudget: number;
  totalExpenseActual: number;
  unpaidBillCount: number;
  giftAidClaimablePence: number;
}

export interface SForecastSummary {
  asOfMonthIndex: number;
  baseline: { forecastYearEndVarianceTotal: number; forecastYearEndActualTotal: number };
  trend: { forecastYearEndVarianceTotal: number; forecastYearEndActualTotal: number };
  riskDelta: number;
  riskLevel: 'ON_TRACK' | 'AT_RISK';
}

export interface SForecastReportRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  annualBudget: number;
  actualYTD: number;
  baselineYearEndActual: number;
  baselineVariance: number;
  trendYearEndActual: number;
  trendVariance: number;
  riskDelta: number;
  riskStatus: 'ON_TRACK' | 'AT_RISK';
}

export interface SForecastReportData {
  asOfMonthIndex: number;
  year: number;
  fundId: string | null;
  rows: SForecastReportRow[];
  totals: SForecastReportRow;
}

export interface SIEAccountRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  monthlyActual: number;
  ytdActual: number;
}

export interface SIECategory {
  categoryName: string;
  rows: SIEAccountRow[];
  totals: { monthlyActual: number; ytdActual: number };
}

export interface SIEReport {
  categories: SIECategory[];
  totals: { monthlyActual: number; ytdActual: number };
}

export interface SBSAccountRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  balance: number;
}

export interface SBSSection {
  rows: SBSAccountRow[];
  total: number;
}

export interface SBSReport {
  asOfDate: string;
  sections: {
    assets: SBSSection;
    liabilities: SBSSection;
    equity: SBSSection;
  };
  netAssets: number;
  check: {
    balances: boolean;
    difference: number;
  };
}

export interface SFMFundRow {
  fundId: string;
  fundName: string;
  fundType: string;
  openingBalancePence: number;
  incomePence: number;
  expenditurePence: number;
  netMovementPence: number;
  closingBalancePence: number;
}

export interface SFMReport {
  period: { year: number; month?: number; startDate: string; endDate: string };
  funds: SFMFundRow[];
  totals: Omit<SFMFundRow, 'fundId' | 'fundName' | 'fundType'>;
}

export interface STrusteeCashItem {
  accountId: string;
  accountName: string;
  balance: number;
}

export interface STrusteeCash {
  items: STrusteeCashItem[];
  total: number;
}

export interface STrusteeFunds {
  restrictedTotal: number;
  unrestrictedTotal: number;
  designatedTotal: number;
}

export interface STrusteeIEPeriod {
  income: number;
  expense: number;
  surplus: number;
}

export interface STrusteeIE {
  mtd: STrusteeIEPeriod;
  ytd: STrusteeIEPeriod;
}

export interface STrusteeVariance {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  adverseVariancePence: number;
  adverseVariancePct: number | null;
}

export interface STrusteeForecast {
  baselineYE: number;
  trendYE: number;
  riskLevel: 'ON_TRACK' | 'AT_RISK';
}

export interface STrusteeSnapshot {
  asOfDate: string;
  cash: STrusteeCash;
  funds: STrusteeFunds;
  incomeExpenditure: STrusteeIE;
  topVariances: STrusteeVariance[];
  forecast: STrusteeForecast;
}

/* ------------------------------------------------------------------ */
/*  Trial Balance                                                      */
/* ------------------------------------------------------------------ */

export interface STrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  debitPence: number;
  creditPence: number;
  netBalancePence: number;
}

export interface STrialBalanceReport {
  asOfDate: string;
  rows: STrialBalanceRow[];
  totalDebitPence: number;
  totalCreditPence: number;
  isBalanced: boolean;
}

/* ------------------------------------------------------------------ */
/*  SOFA (Statement of Financial Activities)                           */
/* ------------------------------------------------------------------ */

export interface SSOFARow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  unrestrictedPence: number;
  restrictedPence: number;
  designatedPence: number;
  totalPence: number;
}

export interface SSOFAReport {
  year: number;
  incomeRows: SSOFARow[];
  expenditureRows: SSOFARow[];
  incomeTotals: { unrestrictedPence: number; restrictedPence: number; designatedPence: number; totalPence: number };
  expenditureTotals: { unrestrictedPence: number; restrictedPence: number; designatedPence: number; totalPence: number };
  netTotals: { unrestrictedPence: number; restrictedPence: number; designatedPence: number; totalPence: number };
}

/* ------------------------------------------------------------------ */
/*  Supplier Spend                                                     */
/* ------------------------------------------------------------------ */

export interface SSupplierSpendRow {
  supplierId: string;
  supplierName: string;
  totalPence: number;
  transactionCount: number;
}

export interface SSupplierSpendReport {
  year: number;
  rows: SSupplierSpendRow[];
  grandTotalPence: number;
}

/* ------------------------------------------------------------------ */
/*  Cash Position                                                      */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Cash Flow Statement                                                */
/* ------------------------------------------------------------------ */

export interface SCashFlowLineItem {
  label: string;
  amountPence: number;
}

export interface SCashFlowSection {
  label: string;
  items: SCashFlowLineItem[];
  totalPence: number;
}

export interface SCashFlowReport {
  periodStart: string;
  periodEnd: string;
  openingBalancePence: number;
  sections: SCashFlowSection[];
  netChangePence: number;
  closingBalancePence: number;
}

/* ------------------------------------------------------------------ */
/*  Quarterly Report                                                   */
/* ------------------------------------------------------------------ */

export interface SQuarterSummary {
  quarter: string;
  incomeTotal: number;
  expenseTotal: number;
  surplus: number;
}

export interface SQuarterlyReport {
  year: number;
  quarters: SQuarterSummary[];
  annualTotal: SQuarterSummary;
  fundBalances: { fundId: string; fundName: string; fundType: string; balancePence: number }[];
}

/* ------------------------------------------------------------------ */
/*  Annual / AGM Report types                                          */
/* ------------------------------------------------------------------ */

export interface SAnnualReport {
  year: number;
  incomeStatement: SIEReport | null;
  balanceSheet: SBSReport | null;
  fundMovements: SFMReport | null;
  budgetVsActual: { totalBudgetPence: number; totalActualPence: number; variancePence: number } | null;
  priorYear: { incomeStatement: SIEReport | null; balanceSheet: SBSReport | null } | null;
}

export interface SAGMReport {
  year: number;
  totalIncomePence: number;
  totalExpensePence: number;
  netResultPence: number;
  restrictedFunds: { fundName: string; balancePence: number }[];
  unrestrictedBalancePence: number;
  designatedBalancePence: number;
  commentary: string;
}

export interface SCashPositionRow {
  bankAccountId: string;
  bankAccountName: string;
  bankStatementBalancePence: number | null;
  glBalancePence: number;
  differencePence: number;
}

export interface SCashPositionReport {
  asOfDate: string;
  rows: SCashPositionRow[];
  totalStatementPence: number;
  totalGLPence: number;
  totalDifferencePence: number;
}

/* ------------------------------------------------------------------ */
/*  Dashboard Overview (new soft-card layout)                          */
/* ------------------------------------------------------------------ */

export interface DashboardOverviewSeries {
  dateLabel: string;
  income: number;
  expense: number;
}

export interface CategoryBreakdown {
  name: string;
  amountPence: number;
  pct: number;
}

export interface TodoItem {
  label: string;
  href: string;
  type: 'warning' | 'info' | 'action';
}

export interface DashboardOverview {
  orgName: string;
  periodLabel: string;
  series: DashboardOverviewSeries[];
  totals: {
    incomePence: number;
    expensePence: number;
    netPence: number;
  };
  priorPeriodTotals: {
    incomePence: number;
    expensePence: number;
  } | null;
  peakDate: string | null;
  peakIncome: number;
  incomeBreakdown: CategoryBreakdown[];
  expenseBreakdown: CategoryBreakdown[];
  todoItems: TodoItem[];

  /* Optional widget data — only populated when the widget is visible */
  cashPosition?: DashboardCashPosition[];
  fundBalances?: DashboardFundBalance[];
  budgetVsActual?: DashboardBudgetVsActual;
  giftAidSummary?: DashboardGiftAidSummary;
  recentTransactions?: DashboardRecentTxn[];
  supplierSpend?: DashboardSupplierSpend[];
  payrollSummary?: DashboardPayrollSummary | null;
}

/* ---- Optional widget sub-types ---- */

export interface DashboardCashPosition {
  bankAccountId: string;
  bankAccountName: string;
  glBalancePence: number;
}

export interface DashboardFundBalance {
  fundId: string;
  fundName: string;
  fundType: string;
  balancePence: number;
  isOverspent: boolean;
}

export interface DashboardBudgetVsActual {
  totalBudgetPence: number;
  totalActualPence: number;
  variancePence: number;
  variancePct: number;
}

export interface DashboardGiftAidSummary {
  estimatedReclaimPence: number;
  claimedPence: number;
  outstandingPence: number;
  donorsMissingDeclarations: number;
}

export interface DashboardRecentTxn {
  id: string;
  date: string;
  description: string;
  amountPence: number;
  type: string;
}

export interface DashboardSupplierSpend {
  supplierName: string;
  totalPence: number;
}

export interface DashboardPayrollSummary {
  periodLabel: string;
  grossPence: number;
  netPence: number;
  status: string;
}
