import { describe, it, expect } from 'vitest';
import { MONTH_KEYS } from '@/lib/budgets/budgetMath';
import type { ActualsMap, MonthlyActuals } from '@/lib/reports/actuals';
import {
  buildTrendForecast,
  computeTrendForecastTotals,
  type AccountMeta,
} from '@/lib/forecast/trendForecast';

/* ------------------------------------------------------------------ */
/*  Factory helpers                                                    */
/* ------------------------------------------------------------------ */

function makeAccount(id: string, name: string, type: string): AccountMeta {
  return { id, name, type };
}

function makeActuals(
  months: Partial<Record<string, bigint>> = {},
): MonthlyActuals {
  const base: Record<string, bigint> = { ytd_pence: 0n };
  for (const k of MONTH_KEYS) {
    base[k] = 0n;
  }
  let ytd = 0n;
  for (const [k, v] of Object.entries(months)) {
    base[k] = v!;
    ytd += v!;
  }
  base.ytd_pence = ytd;
  return base as unknown as MonthlyActuals;
}

const INCOME = makeAccount('acc-inc', 'Donations', 'income');
const EXPENSE = makeAccount('acc-exp', 'Salaries', 'expense');
const EXPENSE2 = makeAccount('acc-exp2', 'Utilities', 'expense');

/* ------------------------------------------------------------------ */
/*  1. Early year (Jan, lookback=3) -- only 1 month available          */
/* ------------------------------------------------------------------ */

describe('buildTrendForecast - early year (Jan)', () => {
  it('uses single month when lookback=3 but only Jan data exists', () => {
    const actuals: ActualsMap = {
      [EXPENSE.id]: makeActuals({ m01_pence: 3000n }),
    };

    const result = buildTrendForecast({
      actualsByAccountMonth: actuals,
      annualBudgetsByAccount: { [EXPENSE.id]: 12000n },
      accounts: [EXPENSE],
      asOfMonthIndex: 1,
      lookbackMonths: 3,
    });

    expect(result.asOfMonthIndex).toBe(1);
    expect(result.lookbackMonths).toBe(3);
    expect(result.rows).toHaveLength(1);

    const f = result.rows[0];
    // Only Jan available, so avgRunRate = 3000 / 1 = 3000
    expect(f.avgRunRate).toBe(3000n);
    expect(f.actualYTD).toBe(3000n);
    // remainingMonths = 11, forecastRemaining = 3000 * 11 = 33000
    expect(f.forecastRemaining).toBe(33000n);
    // forecastYearEndActual = 3000 + 33000 = 36000
    expect(f.forecastYearEndActual).toBe(36000n);
    // forecastVariance = 36000 - 12000 = 24000
    expect(f.forecastVariance).toBe(24000n);
  });
});

/* ------------------------------------------------------------------ */
/*  2. Early year (Feb, lookback=3) -- only 2 months available         */
/* ------------------------------------------------------------------ */

describe('buildTrendForecast - early year (Feb)', () => {
  it('averages 2 months when lookback=3 but only Jan+Feb exist', () => {
    const actuals: ActualsMap = {
      [EXPENSE.id]: makeActuals({ m01_pence: 2000n, m02_pence: 4000n }),
    };

    const result = buildTrendForecast({
      actualsByAccountMonth: actuals,
      annualBudgetsByAccount: { [EXPENSE.id]: 36000n },
      accounts: [EXPENSE],
      asOfMonthIndex: 2,
      lookbackMonths: 3,
    });

    const f = result.rows[0];
    // avgRunRate = (2000 + 4000) / 2 = 3000
    expect(f.avgRunRate).toBe(3000n);
    expect(f.actualYTD).toBe(6000n);
    // remainingMonths = 10, forecastRemaining = 3000 * 10 = 30000
    expect(f.forecastRemaining).toBe(30000n);
    // forecastYearEndActual = 6000 + 30000 = 36000
    expect(f.forecastYearEndActual).toBe(36000n);
    // forecastVariance = 36000 - 36000 = 0
    expect(f.forecastVariance).toBe(0n);
  });
});

/* ------------------------------------------------------------------ */
/*  3. Zero actuals fallback                                           */
/* ------------------------------------------------------------------ */

describe('buildTrendForecast - zero actuals fallback', () => {
  it('falls back to baseline remaining budget when all lookback months are zero', () => {
    const actuals: ActualsMap = {
      // All months zero
      [EXPENSE.id]: makeActuals({}),
    };

    const result = buildTrendForecast({
      actualsByAccountMonth: actuals,
      annualBudgetsByAccount: { [EXPENSE.id]: 12000n },
      accounts: [EXPENSE],
      asOfMonthIndex: 6,
      lookbackMonths: 3,
    });

    const f = result.rows[0];
    expect(f.avgRunRate).toBe(0n);
    expect(f.actualYTD).toBe(0n);
    // Fallback: forecastRemaining = annualBudget - actualYTD = 12000 - 0 = 12000
    expect(f.forecastRemaining).toBe(12000n);
    expect(f.forecastYearEndActual).toBe(12000n);
    expect(f.forecastVariance).toBe(0n);
  });

  it('falls back correctly when account has no actuals entry at all', () => {
    const result = buildTrendForecast({
      actualsByAccountMonth: {},
      annualBudgetsByAccount: { [EXPENSE.id]: 6000n },
      accounts: [EXPENSE],
      asOfMonthIndex: 3,
      lookbackMonths: 3,
    });

    const f = result.rows[0];
    expect(f.avgRunRate).toBe(0n);
    expect(f.actualYTD).toBe(0n);
    expect(f.forecastRemaining).toBe(6000n);
    expect(f.forecastYearEndActual).toBe(6000n);
    expect(f.forecastVariance).toBe(0n);
  });
});

/* ------------------------------------------------------------------ */
/*  4. Totals equal sum of rows                                        */
/* ------------------------------------------------------------------ */

describe('buildTrendForecast - totals', () => {
  it('totals equal sum of individual rows', () => {
    const actuals: ActualsMap = {
      [INCOME.id]: makeActuals({ m01_pence: 5000n, m02_pence: 6000n, m03_pence: 4000n }),
      [EXPENSE.id]: makeActuals({ m01_pence: 2000n, m02_pence: 3000n, m03_pence: 2500n }),
      [EXPENSE2.id]: makeActuals({ m01_pence: 500n, m02_pence: 700n, m03_pence: 800n }),
    };

    const budgets: Record<string, bigint> = {
      [INCOME.id]: 60000n,
      [EXPENSE.id]: 30000n,
      [EXPENSE2.id]: 10000n,
    };

    const result = buildTrendForecast({
      actualsByAccountMonth: actuals,
      annualBudgetsByAccount: budgets,
      accounts: [INCOME, EXPENSE, EXPENSE2],
      asOfMonthIndex: 3,
      lookbackMonths: 3,
    });

    const { rows, totals } = result;

    let sumBudget = 0n;
    let sumYTD = 0n;
    let sumRunRate = 0n;
    let sumRemaining = 0n;
    let sumYearEnd = 0n;
    let sumVariance = 0n;

    for (const r of rows) {
      sumBudget += r.annualBudget;
      sumYTD += r.actualYTD;
      sumRunRate += r.avgRunRate;
      sumRemaining += r.forecastRemaining;
      sumYearEnd += r.forecastYearEndActual;
      sumVariance += r.forecastVariance;
    }

    expect(totals.annualBudget).toBe(sumBudget);
    expect(totals.actualYTD).toBe(sumYTD);
    expect(totals.avgRunRate).toBe(sumRunRate);
    expect(totals.forecastRemaining).toBe(sumRemaining);
    expect(totals.forecastYearEndActual).toBe(sumYearEnd);
    expect(totals.forecastVariance).toBe(sumVariance);
    expect(totals.accountName).toBe('Totals');
  });

  it('computeTrendForecastTotals works standalone', () => {
    const actuals: ActualsMap = {
      [INCOME.id]: makeActuals({ m01_pence: 1000n }),
      [EXPENSE.id]: makeActuals({ m01_pence: 500n }),
    };

    const result = buildTrendForecast({
      actualsByAccountMonth: actuals,
      annualBudgetsByAccount: { [INCOME.id]: 12000n, [EXPENSE.id]: 6000n },
      accounts: [INCOME, EXPENSE],
      asOfMonthIndex: 1,
    });

    const standalone = computeTrendForecastTotals(result.rows);
    expect(standalone.annualBudget).toBe(result.totals.annualBudget);
    expect(standalone.actualYTD).toBe(result.totals.actualYTD);
    expect(standalone.forecastRemaining).toBe(result.totals.forecastRemaining);
  });
});

/* ------------------------------------------------------------------ */
/*  5. Income vs expense sign conventions                              */
/* ------------------------------------------------------------------ */

describe('buildTrendForecast - sign conventions', () => {
  it('income account: positive actuals project sensibly', () => {
    // Budget: 12000, Actual: 1000/month for 6 months, lookback=3
    const actMonths: Record<string, bigint> = {};
    for (let i = 0; i < 6; i++) actMonths[MONTH_KEYS[i]] = 1000n;

    const result = buildTrendForecast({
      actualsByAccountMonth: { [INCOME.id]: makeActuals(actMonths) },
      annualBudgetsByAccount: { [INCOME.id]: 12000n },
      accounts: [INCOME],
      asOfMonthIndex: 6,
      lookbackMonths: 3,
    });

    const f = result.rows[0];
    expect(f.actualYTD).toBe(6000n);
    // avgRunRate from months 4,5,6 = (1000+1000+1000) / 3 = 1000
    expect(f.avgRunRate).toBe(1000n);
    // forecastRemaining = 1000 * 6 = 6000
    expect(f.forecastRemaining).toBe(6000n);
    expect(f.forecastYearEndActual).toBe(12000n);
    expect(f.forecastVariance).toBe(0n);
  });

  it('expense account: positive actuals project sensibly', () => {
    // Budget: 6000, Actual: 500/month for 3 months, lookback=3
    const actMonths: Record<string, bigint> = {};
    for (let i = 0; i < 3; i++) actMonths[MONTH_KEYS[i]] = 500n;

    const result = buildTrendForecast({
      actualsByAccountMonth: { [EXPENSE.id]: makeActuals(actMonths) },
      annualBudgetsByAccount: { [EXPENSE.id]: 6000n },
      accounts: [EXPENSE],
      asOfMonthIndex: 3,
      lookbackMonths: 3,
    });

    const f = result.rows[0];
    expect(f.actualYTD).toBe(1500n);
    expect(f.avgRunRate).toBe(500n);
    // forecastRemaining = 500 * 9 = 4500
    expect(f.forecastRemaining).toBe(4500n);
    expect(f.forecastYearEndActual).toBe(6000n);
    expect(f.forecastVariance).toBe(0n);
  });
});

/* ------------------------------------------------------------------ */
/*  6. December (month 12) -- remainingMonths = 0                      */
/* ------------------------------------------------------------------ */

describe('buildTrendForecast - December', () => {
  it('at month 12, forecastRemaining=0 and forecastYearEndActual=actualYTD', () => {
    const actMonths: Record<string, bigint> = {};
    for (let i = 0; i < 12; i++) actMonths[MONTH_KEYS[i]] = 1000n;

    const result = buildTrendForecast({
      actualsByAccountMonth: { [EXPENSE.id]: makeActuals(actMonths) },
      annualBudgetsByAccount: { [EXPENSE.id]: 10000n },
      accounts: [EXPENSE],
      asOfMonthIndex: 12,
      lookbackMonths: 3,
    });

    const f = result.rows[0];
    expect(f.actualYTD).toBe(12000n);
    expect(f.forecastRemaining).toBe(0n);
    expect(f.forecastYearEndActual).toBe(12000n);
    // variance = 12000 - 10000 = 2000
    expect(f.forecastVariance).toBe(2000n);
  });
});

/* ------------------------------------------------------------------ */
/*  7. Mixed: some lookback months zero, some non-zero                 */
/* ------------------------------------------------------------------ */

describe('buildTrendForecast - mixed lookback months', () => {
  it('avgRunRate divides only by non-zero months', () => {
    // Month 4 = 0, Month 5 = 3000, Month 6 = 6000, lookback=3
    const actuals: ActualsMap = {
      [EXPENSE.id]: makeActuals({
        m01_pence: 1000n,
        m02_pence: 1000n,
        m03_pence: 1000n,
        m04_pence: 0n,   // zero in lookback window
        m05_pence: 3000n,
        m06_pence: 6000n,
      }),
    };

    const result = buildTrendForecast({
      actualsByAccountMonth: actuals,
      annualBudgetsByAccount: { [EXPENSE.id]: 24000n },
      accounts: [EXPENSE],
      asOfMonthIndex: 6,
      lookbackMonths: 3,
    });

    const f = result.rows[0];
    // Lookback window: m04=0, m05=3000, m06=6000
    // Non-zero count = 2, sum = 9000
    // avgRunRate = 9000 / 2 = 4500
    expect(f.avgRunRate).toBe(4500n);
    expect(f.actualYTD).toBe(12000n);
    // forecastRemaining = 4500 * 6 = 27000
    expect(f.forecastRemaining).toBe(27000n);
    expect(f.forecastYearEndActual).toBe(39000n);
    // variance = 39000 - 24000 = 15000
    expect(f.forecastVariance).toBe(15000n);
  });

  it('handles empty rows gracefully', () => {
    const result = buildTrendForecast({
      actualsByAccountMonth: {},
      annualBudgetsByAccount: {},
      accounts: [],
      asOfMonthIndex: 6,
    });

    expect(result.rows).toHaveLength(0);
    expect(result.totals.annualBudget).toBe(0n);
    expect(result.totals.actualYTD).toBe(0n);
    expect(result.totals.avgRunRate).toBe(0n);
  });
});
