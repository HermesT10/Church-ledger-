import { MONTH_KEYS } from '@/lib/budgets/budgetMath';
import type { ActualsMap } from '@/lib/reports/actuals';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TrendForecastRow {
  accountId: string;
  accountName: string;
  accountType: string;
  annualBudget: bigint;
  actualYTD: bigint;
  avgRunRate: bigint;        // average pence per month over lookback window
  forecastRemaining: bigint;
  forecastYearEndActual: bigint;
  forecastVariance: bigint;  // forecastYearEndActual - annualBudget
}

export interface TrendForecastResult {
  asOfMonthIndex: number;
  lookbackMonths: number;
  rows: TrendForecastRow[];
  totals: TrendForecastRow;
}

/** Minimal account metadata needed by the forecast. */
export interface AccountMeta {
  id: string;
  name: string;
  type: string;
}

/* ------------------------------------------------------------------ */
/*  buildTrendForecast                                                 */
/* ------------------------------------------------------------------ */

/**
 * Build a trend-based (run-rate) year-end forecast for each account.
 *
 * For each account the function:
 *  1. Looks at the last N months (lookback window) of actuals.
 *  2. Computes an average monthly run-rate from non-zero months.
 *  3. Projects remaining months at that rate.
 *  4. Falls back to baseline (remaining budget) if all lookback months
 *     are zero.
 *
 * @param asOfMonthIndex  1-based month (1 = Jan, 12 = Dec).
 * @param lookbackMonths  Number of recent months to average (default 3).
 */
export function buildTrendForecast(params: {
  actualsByAccountMonth: ActualsMap;
  annualBudgetsByAccount: Record<string, bigint>;
  accounts: AccountMeta[];
  asOfMonthIndex: number;  // 1..12
  lookbackMonths?: number; // default 3
}): TrendForecastResult {
  const {
    actualsByAccountMonth,
    annualBudgetsByAccount,
    accounts,
    asOfMonthIndex,
    lookbackMonths = 3,
  } = params;

  const remainingMonths = 12 - asOfMonthIndex;

  const rows: TrendForecastRow[] = accounts.map((account) => {
    const actuals = actualsByAccountMonth[account.id];
    const annualBudget = annualBudgetsByAccount[account.id] ?? 0n;

    // --- Compute actualYTD (sum of m01..m{asOfMonthIndex}) ---
    let actualYTD = 0n;
    for (let i = 0; i < asOfMonthIndex; i++) {
      actualYTD += actuals ? actuals[MONTH_KEYS[i]] : 0n;
    }

    // --- Lookback window ---
    const startMonth = Math.max(1, asOfMonthIndex - lookbackMonths + 1);
    let lookbackSum = 0n;
    let nonZeroCount = 0;

    for (let m = startMonth; m <= asOfMonthIndex; m++) {
      const val = actuals ? actuals[MONTH_KEYS[m - 1]] : 0n;
      lookbackSum += val;
      if (val !== 0n) {
        nonZeroCount++;
      }
    }

    // --- Compute avgRunRate and forecastRemaining ---
    let avgRunRate: bigint;
    let forecastRemaining: bigint;

    if (nonZeroCount > 0) {
      // BigInt division truncates towards zero
      avgRunRate = lookbackSum / BigInt(nonZeroCount);
      forecastRemaining = remainingMonths > 0
        ? avgRunRate * BigInt(remainingMonths)
        : 0n;
    } else {
      // Fallback: all lookback months are zero -> use baseline logic
      avgRunRate = 0n;
      forecastRemaining = remainingMonths > 0
        ? annualBudget - actualYTD
        : 0n;
    }

    const forecastYearEndActual = actualYTD + forecastRemaining;
    const forecastVariance = forecastYearEndActual - annualBudget;

    return {
      accountId: account.id,
      accountName: account.name,
      accountType: account.type,
      annualBudget,
      actualYTD,
      avgRunRate,
      forecastRemaining,
      forecastYearEndActual,
      forecastVariance,
    };
  });

  const totals = computeTrendForecastTotals(rows);

  return { asOfMonthIndex, lookbackMonths, rows, totals };
}

/* ------------------------------------------------------------------ */
/*  computeTrendForecastTotals                                         */
/* ------------------------------------------------------------------ */

/**
 * Sum all numeric fields across trend forecast rows to produce a totals row.
 */
export function computeTrendForecastTotals(rows: TrendForecastRow[]): TrendForecastRow {
  let annualBudget = 0n;
  let actualYTD = 0n;
  let avgRunRate = 0n;
  let forecastRemaining = 0n;
  let forecastYearEndActual = 0n;
  let forecastVariance = 0n;

  for (const r of rows) {
    annualBudget += r.annualBudget;
    actualYTD += r.actualYTD;
    avgRunRate += r.avgRunRate;
    forecastRemaining += r.forecastRemaining;
    forecastYearEndActual += r.forecastYearEndActual;
    forecastVariance += r.forecastVariance;
  }

  return {
    accountId: '',
    accountName: 'Totals',
    accountType: '',
    annualBudget,
    actualYTD,
    avgRunRate,
    forecastRemaining,
    forecastYearEndActual,
    forecastVariance,
  };
}
