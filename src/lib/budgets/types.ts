/* ------------------------------------------------------------------ */
/*  Budget types (shared, not a server action file)                     */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Core rows                                                          */
/* ------------------------------------------------------------------ */

export interface BudgetRow {
  id: string;
  organisation_id: string;
  year: number;
  name: string;
  status: 'draft' | 'approved' | 'archived';
  version_number: number;
  created_by: string | null;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
}

export interface BudgetGridLine {
  id: string;
  budget_id: string;
  organisation_id: string;
  account_id: string;
  fund_id: string | null;
  m01_pence: number;
  m02_pence: number;
  m03_pence: number;
  m04_pence: number;
  m05_pence: number;
  m06_pence: number;
  m07_pence: number;
  m08_pence: number;
  m09_pence: number;
  m10_pence: number;
  m11_pence: number;
  m12_pence: number;
  created_at: string;
}

export interface AccountRef {
  id: string;
  code: string;
  name: string;
  type: string;
}

export interface FundRef {
  id: string;
  name: string;
  type?: string;
}

/* ------------------------------------------------------------------ */
/*  Grid (existing editor)                                             */
/* ------------------------------------------------------------------ */

export interface BudgetGrid {
  budget: BudgetRow;
  accounts: AccountRef[];
  funds: FundRef[];
  lines: BudgetGridLine[];
  lineIndex: Record<string, BudgetGridLine>;
}

export interface GridUpdate {
  accountId: string;
  fundId: string | null;
  monthIndex: number;    // 1..12
  amountPence: number;   // integer pence
}

/* ------------------------------------------------------------------ */
/*  Variance                                                           */
/* ------------------------------------------------------------------ */

export type VarianceStatus = 'on_track' | 'near' | 'overspent';

export function getVarianceStatus(
  accountType: string,
  plannedPence: number,
  actualPence: number,
  nearThresholdPct: number = 0.9,
): VarianceStatus {
  if (plannedPence === 0) {
    return actualPence === 0 ? 'on_track' : 'overspent';
  }

  if (accountType === 'income') {
    // Income: good if actual >= planned
    const ratio = actualPence / plannedPence;
    if (ratio >= 1) return 'on_track';
    if (ratio >= nearThresholdPct) return 'near';
    return 'overspent';
  } else {
    // Expense: good if actual <= planned
    const ratio = actualPence / plannedPence;
    if (ratio <= 1) return 'on_track';
    if (ratio <= 1 + (1 - nearThresholdPct)) return 'near';
    return 'overspent';
  }
}

export const VARIANCE_COLORS: Record<VarianceStatus, string> = {
  on_track: 'bg-emerald-100 text-emerald-700',
  near: 'bg-amber-100 text-amber-700',
  overspent: 'bg-red-100 text-red-700',
};

export const VARIANCE_LABELS: Record<VarianceStatus, string> = {
  on_track: 'On Track',
  near: 'Near Limit',
  overspent: 'Overspent',
};

/* ------------------------------------------------------------------ */
/*  Monthly Planning View                                              */
/* ------------------------------------------------------------------ */

export interface MonthlyPlanningRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: 'income' | 'expense';
  fundId: string | null;
  plannedPence: number;
  actualPence: number;
  variancePence: number;
  status: VarianceStatus;
}

export interface MonthlyPlanningSection {
  label: string;
  type: 'income' | 'expense';
  rows: MonthlyPlanningRow[];
  totalPlanned: number;
  totalActual: number;
  totalVariance: number;
}

export interface MonthlyPlanningData {
  income: MonthlyPlanningSection;
  expense: MonthlyPlanningSection;
  netPlanned: number;
  netActual: number;
  netVariance: number;
}

/* ------------------------------------------------------------------ */
/*  Annual View                                                        */
/* ------------------------------------------------------------------ */

export interface AnnualAccountRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: 'income' | 'expense';
  annualPlannedPence: number;
  ytdActualPence: number;
  forecastPence: number;
  variancePence: number;
  status: VarianceStatus;
}

export interface AnnualViewData {
  incomeRows: AnnualAccountRow[];
  expenseRows: AnnualAccountRow[];
  totalIncomePlanned: number;
  totalIncomeActual: number;
  totalIncomeForecast: number;
  totalExpensePlanned: number;
  totalExpenseActual: number;
  totalExpenseForecast: number;
  netPlanned: number;
  netActual: number;
  netForecast: number;
}

/* ------------------------------------------------------------------ */
/*  Fund Summary                                                       */
/* ------------------------------------------------------------------ */

export interface BudgetFundSummary {
  fundId: string;
  fundName: string;
  fundType: string;
  plannedIncomePence: number;
  plannedExpensePence: number;
  actualIncomePence: number;
  actualExpensePence: number;
  forecastIncomePence: number;
  forecastExpensePence: number;
  projectedBalancePence: number;
  restrictedOverspendRisk: boolean;
}

/* ------------------------------------------------------------------ */
/*  Drill-down                                                         */
/* ------------------------------------------------------------------ */

export interface DrillDownTransaction {
  journalId: string;
  journalDate: string;
  memo: string | null;
  description: string | null;
  debitPence: number;
  creditPence: number;
  fundId: string | null;
}

/* ------------------------------------------------------------------ */
/*  Month labels                                                       */
/* ------------------------------------------------------------------ */

export const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;
