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

export type RiskStatus = 'ON_TRACK' | 'AT_RISK';

export interface ForecastReportRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  annualBudget: bigint;
  actualYTD: bigint;
  baselineYearEndActual: bigint;
  baselineVariance: bigint;
  trendYearEndActual: bigint;
  trendVariance: bigint;
  riskDelta: bigint;       // trendVariance - baselineVariance
  riskStatus: RiskStatus;
}

export interface ForecastReportResult {
  asOfMonthIndex: number;
  rows: ForecastReportRow[];
  totals: ForecastReportRow;
}

/* ------------------------------------------------------------------ */
/*  buildForecastReport                                                */
/* ------------------------------------------------------------------ */

/**
 * Merge baseline and trend forecasts into a single per-account report
 * with risk status.
 *
 * Risk rules:
 *  - Expense: AT_RISK when trendYearEndActual > annualBudget + tolerance
 *  - Income:  AT_RISK when trendYearEndActual < annualBudget - tolerance
 *  - Other:   ON_TRACK
 */
export function buildForecastReport(params: {
  bvaRows: BvaRow[];
  actualsMap: ActualsMap;
  accounts: AccountMeta[];
  annualBudgetsByAccount: Record<string, bigint>;
  asOfMonthIndex: number;
  tolerancePence?: bigint;
}): ForecastReportResult {
  const {
    bvaRows,
    actualsMap,
    accounts,
    annualBudgetsByAccount,
    asOfMonthIndex,
    tolerancePence = 0n,
  } = params;

  // 1. Build both forecasts
  const baselineResult = buildBaselineForecast({
    budgetVsActualRows: bvaRows,
    asOfMonthIndex,
  });

  const trendResult = buildTrendForecast({
    actualsByAccountMonth: actualsMap,
    annualBudgetsByAccount,
    accounts,
    asOfMonthIndex,
  });

  // 2. Index rows by accountId
  const baselineByAccount = new Map(
    baselineResult.rows.map((r) => [r.accountId, r]),
  );
  const trendByAccount = new Map(
    trendResult.rows.map((r) => [r.accountId, r]),
  );

  // 3. Merge into ForecastReportRow per account
  const rows: ForecastReportRow[] = accounts.map((account) => {
    const bl = baselineByAccount.get(account.id);
    const tr = trendByAccount.get(account.id);

    const annualBudget = bl?.annualBudget ?? tr?.annualBudget ?? 0n;
    const actualYTD = bl?.actualYTD ?? tr?.actualYTD ?? 0n;
    const baselineYearEndActual = bl?.forecastYearEndActual ?? 0n;
    const baselineVariance = bl?.forecastVariance ?? 0n;
    const trendYearEndActual = tr?.forecastYearEndActual ?? 0n;
    const trendVariance = tr?.forecastVariance ?? 0n;
    const riskDelta = trendVariance - baselineVariance;

    // Determine per-account risk status
    let riskStatus: RiskStatus = 'ON_TRACK';
    if (account.type === 'expense') {
      // Overspend: trend projects spending above budget + tolerance
      if (trendYearEndActual > annualBudget + tolerancePence) {
        riskStatus = 'AT_RISK';
      }
    } else if (account.type === 'income') {
      // Under-income: trend projects income below budget - tolerance
      if (trendYearEndActual < annualBudget - tolerancePence) {
        riskStatus = 'AT_RISK';
      }
    }

    return {
      accountId: account.id,
      accountCode: bl?.accountCode ?? '',
      accountName: account.name,
      accountType: account.type,
      annualBudget,
      actualYTD,
      baselineYearEndActual,
      baselineVariance,
      trendYearEndActual,
      trendVariance,
      riskDelta,
      riskStatus,
    };
  });

  const totals = computeForecastReportTotals(rows);

  return { asOfMonthIndex, rows, totals };
}

/* ------------------------------------------------------------------ */
/*  computeForecastReportTotals                                        */
/* ------------------------------------------------------------------ */

/**
 * Sum all bigint fields across forecast report rows.
 * The totals riskStatus is AT_RISK if any row is AT_RISK.
 */
export function computeForecastReportTotals(
  rows: ForecastReportRow[],
): ForecastReportRow {
  let annualBudget = 0n;
  let actualYTD = 0n;
  let baselineYearEndActual = 0n;
  let baselineVariance = 0n;
  let trendYearEndActual = 0n;
  let trendVariance = 0n;
  let riskDelta = 0n;
  let hasAtRisk = false;

  for (const r of rows) {
    annualBudget += r.annualBudget;
    actualYTD += r.actualYTD;
    baselineYearEndActual += r.baselineYearEndActual;
    baselineVariance += r.baselineVariance;
    trendYearEndActual += r.trendYearEndActual;
    trendVariance += r.trendVariance;
    riskDelta += r.riskDelta;
    if (r.riskStatus === 'AT_RISK') hasAtRisk = true;
  }

  return {
    accountId: '',
    accountCode: '',
    accountName: 'Totals',
    accountType: '',
    annualBudget,
    actualYTD,
    baselineYearEndActual,
    baselineVariance,
    trendYearEndActual,
    trendVariance,
    riskDelta,
    riskStatus: hasAtRisk ? 'AT_RISK' : 'ON_TRACK',
  };
}
