import { MONTH_KEYS } from '@/lib/budgets/budgetMath';
import type { BvaRow } from '@/lib/reports/budgetVsActual';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ForecastRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  annualBudget: bigint;
  actualYTD: bigint;
  remainingBudget: bigint;
  forecastYearEndActual: bigint;
  forecastVariance: bigint; // forecastYearEndActual - annualBudget
}

export interface BaselineForecastResult {
  asOfMonthIndex: number;
  rows: ForecastRow[];
  totals: ForecastRow;
}

/* ------------------------------------------------------------------ */
/*  buildBaselineForecast                                              */
/* ------------------------------------------------------------------ */

/**
 * Build a baseline year-end forecast for each account.
 *
 * For each BvA row:
 *  - annualBudget        = sum of monthly budgets (all 12 months)
 *  - actualYTD           = sum of actuals for months 1..asOfMonthIndex
 *  - remainingBudget     = annualBudget - actualYTD
 *  - remainingMonths     = 12 - asOfMonthIndex
 *  - forecastRemaining   = remainingMonths > 0 ? remainingBudget : 0
 *  - forecastYearEndActual = actualYTD + forecastRemaining
 *  - forecastVariance    = forecastYearEndActual - annualBudget
 *
 * @param asOfMonthIndex 1-based month (1 = Jan, 12 = Dec)
 */
export function buildBaselineForecast(params: {
  budgetVsActualRows: BvaRow[];
  asOfMonthIndex: number; // 1..12
}): BaselineForecastResult {
  const { budgetVsActualRows, asOfMonthIndex } = params;

  const remainingMonths = 12 - asOfMonthIndex;

  const rows: ForecastRow[] = budgetVsActualRows.map((row) => {
    // Sum all 12 months of budget
    let annualBudget = 0n;
    for (const mk of MONTH_KEYS) {
      annualBudget += row.months[mk].budget;
    }

    // Sum actuals for months 1..asOfMonthIndex
    let actualYTD = 0n;
    for (let i = 0; i < asOfMonthIndex; i++) {
      actualYTD += row.months[MONTH_KEYS[i]].actual;
    }

    const remainingBudget = annualBudget - actualYTD;
    const forecastRemaining = remainingMonths > 0 ? remainingBudget : 0n;
    const forecastYearEndActual = actualYTD + forecastRemaining;
    const forecastVariance = forecastYearEndActual - annualBudget;

    return {
      accountId: row.accountId,
      accountCode: row.accountCode,
      accountName: row.accountName,
      accountType: row.accountType,
      annualBudget,
      actualYTD,
      remainingBudget: forecastRemaining,
      forecastYearEndActual,
      forecastVariance,
    };
  });

  const totals = computeForecastTotals(rows);

  return { asOfMonthIndex, rows, totals };
}

/* ------------------------------------------------------------------ */
/*  computeForecastTotals                                              */
/* ------------------------------------------------------------------ */

/**
 * Sum all numeric fields across forecast rows to produce a totals row.
 */
export function computeForecastTotals(rows: ForecastRow[]): ForecastRow {
  let annualBudget = 0n;
  let actualYTD = 0n;
  let remainingBudget = 0n;
  let forecastYearEndActual = 0n;
  let forecastVariance = 0n;

  for (const r of rows) {
    annualBudget += r.annualBudget;
    actualYTD += r.actualYTD;
    remainingBudget += r.remainingBudget;
    forecastYearEndActual += r.forecastYearEndActual;
    forecastVariance += r.forecastVariance;
  }

  return {
    accountId: '',
    accountCode: '',
    accountName: 'Totals',
    accountType: '',
    annualBudget,
    actualYTD,
    remainingBudget,
    forecastYearEndActual,
    forecastVariance,
  };
}
