import type { BvaRow } from '@/lib/reports/budgetVsActual';
import type { ActualsMap } from '@/lib/reports/actuals';
import { buildBaselineForecast } from '@/lib/forecast/baselineForecast';
import {
  buildTrendForecast,
  type AccountMeta,
} from '@/lib/forecast/trendForecast';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type RiskLevel = 'ON_TRACK' | 'AT_RISK';

export interface ForecastSummary {
  asOfMonthIndex: number;
  baseline: {
    forecastYearEndVarianceTotal: bigint;
    forecastYearEndActualTotal: bigint;
  };
  trend: {
    forecastYearEndVarianceTotal: bigint;
    forecastYearEndActualTotal: bigint;
  };
  riskDelta: bigint;   // trend variance - baseline variance
  riskLevel: RiskLevel;
}

/* ------------------------------------------------------------------ */
/*  computeForecastSummary                                             */
/* ------------------------------------------------------------------ */

/**
 * Combine baseline and trend forecasts into a single risk-level summary.
 *
 * @param bvaRows                BvA rows (bigint) from buildBudgetVsActual.
 * @param actualsMap             Actuals map from getActualsByMonth.
 * @param accounts               Account metadata for the trend forecast.
 * @param annualBudgetsByAccount Map accountId -> annual budget (bigint pence).
 * @param asOfMonthIndex         1-based month (1 = Jan, 12 = Dec).
 * @param tolerancePence         Deficit tolerance: trend variance >= -tolerance
 *                               is considered ON_TRACK. Defaults to 0n.
 */
export function computeForecastSummary(params: {
  bvaRows: BvaRow[];
  actualsMap: ActualsMap;
  accounts: AccountMeta[];
  annualBudgetsByAccount: Record<string, bigint>;
  asOfMonthIndex: number;
  tolerancePence?: bigint;
}): ForecastSummary {
  const {
    bvaRows,
    actualsMap,
    accounts,
    annualBudgetsByAccount,
    asOfMonthIndex,
    tolerancePence = 0n,
  } = params;

  // 1. Baseline forecast
  const baselineResult = buildBaselineForecast({
    budgetVsActualRows: bvaRows,
    asOfMonthIndex,
  });

  // 2. Trend forecast
  const trendResult = buildTrendForecast({
    actualsByAccountMonth: actualsMap,
    annualBudgetsByAccount,
    accounts,
    asOfMonthIndex,
  });

  // 3. Extract totals
  const baselineVariance = baselineResult.totals.forecastVariance;
  const baselineActual = baselineResult.totals.forecastYearEndActual;
  const trendVariance = trendResult.totals.forecastVariance;
  const trendActual = trendResult.totals.forecastYearEndActual;

  // 4. Risk delta & level
  const riskDelta = trendVariance - baselineVariance;
  const riskLevel: RiskLevel =
    trendVariance >= -tolerancePence ? 'ON_TRACK' : 'AT_RISK';

  return {
    asOfMonthIndex,
    baseline: {
      forecastYearEndVarianceTotal: baselineVariance,
      forecastYearEndActualTotal: baselineActual,
    },
    trend: {
      forecastYearEndVarianceTotal: trendVariance,
      forecastYearEndActualTotal: trendActual,
    },
    riskDelta,
    riskLevel,
  };
}
