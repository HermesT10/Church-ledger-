import { describe, it, expect } from 'vitest';
import { MONTH_KEYS } from '@/lib/budgets/budgetMath';
import type { AccountRef, BudgetGridLine } from '@/lib/budgets/types';
import type { ActualsMap, MonthlyActuals } from '@/lib/reports/actuals';
import { buildBudgetVsActual } from '@/lib/reports/budgetVsActual';
import {
  buildForecastReport,
  computeForecastReportTotals,
  type ForecastReportRow,
} from '@/lib/forecast/forecastReport';
import type { AccountMeta } from '@/lib/forecast/trendForecast';

/* ------------------------------------------------------------------ */
/*  Factory helpers                                                    */
/* ------------------------------------------------------------------ */

function makeAccount(id: string, code: string, name: string, type: string): AccountRef {
  return { id, code, name, type };
}

function makeBudgetLine(
  accountId: string,
  months: Partial<Record<string, number>> = {},
): BudgetGridLine {
  const base: Record<string, unknown> = {
    id: `bl-${accountId}`,
    budget_id: 'budget-1',
    organisation_id: 'org-1',
    account_id: accountId,
    fund_id: null,
    created_at: '2026-01-01',
  };
  for (const k of MONTH_KEYS) {
    base[k] = 0;
  }
  for (const [k, v] of Object.entries(months)) {
    base[k] = v;
  }
  return base as unknown as BudgetGridLine;
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

function toMeta(acc: AccountRef): AccountMeta {
  return { id: acc.id, name: acc.name, type: acc.type };
}

function annualBudgetMap(lines: BudgetGridLine[]): Record<string, bigint> {
  const map: Record<string, bigint> = {};
  for (const line of lines) {
    let total = 0n;
    for (const k of MONTH_KEYS) {
      total += BigInt((line as unknown as Record<string, number>)[k] ?? 0);
    }
    map[line.account_id] = (map[line.account_id] ?? 0n) + total;
  }
  return map;
}

/** Build all inputs for buildForecastReport in one call. */
function buildInputs(
  accountRefs: AccountRef[],
  budgetLines: BudgetGridLine[],
  actualsMap: ActualsMap,
  asOfMonthIndex: number,
  tolerancePence?: bigint,
) {
  const bvaRows = buildBudgetVsActual({
    accounts: accountRefs,
    budgetLines,
    actualsByAccountMonth: actualsMap,
  });

  return {
    bvaRows,
    actualsMap,
    accounts: accountRefs.map(toMeta),
    annualBudgetsByAccount: annualBudgetMap(budgetLines),
    asOfMonthIndex,
    tolerancePence,
  };
}

const INCOME = makeAccount('acc-inc', '1000', 'Donations', 'income');
const EXPENSE = makeAccount('acc-exp', '2000', 'Salaries', 'expense');
const EXPENSE2 = makeAccount('acc-exp2', '2100', 'Utilities', 'expense');

/* ------------------------------------------------------------------ */
/*  1. Expense AT_RISK                                                 */
/* ------------------------------------------------------------------ */

describe('buildForecastReport - expense AT_RISK', () => {
  it('flags expense as AT_RISK when trend projects overspend', () => {
    // Budget: 1000/month * 12 = 12000
    const expBudget: Record<string, number> = {};
    for (const k of MONTH_KEYS) expBudget[k] = 1000;

    // Actual: 1500/month for first 6 months (overspending)
    const expActual: Record<string, bigint> = {};
    for (let i = 0; i < 6; i++) expActual[MONTH_KEYS[i]] = 1500n;

    const result = buildForecastReport(
      buildInputs(
        [EXPENSE],
        [makeBudgetLine(EXPENSE.id, expBudget)],
        { [EXPENSE.id]: makeActuals(expActual) },
        6,
      ),
    );

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];

    // Trend: avgRunRate=1500, yearEnd=9000+9000=18000, budget=12000
    expect(row.trendYearEndActual).toBe(18000n);
    expect(row.trendVariance).toBe(6000n);
    // 18000 > 12000 + 0 => AT_RISK
    expect(row.riskStatus).toBe('AT_RISK');
  });
});

/* ------------------------------------------------------------------ */
/*  2. Expense ON_TRACK                                                */
/* ------------------------------------------------------------------ */

describe('buildForecastReport - expense ON_TRACK', () => {
  it('expense is ON_TRACK when trend projects within budget', () => {
    const expBudget: Record<string, number> = {};
    for (const k of MONTH_KEYS) expBudget[k] = 1000;

    // Actual: 800/month (under budget)
    const expActual: Record<string, bigint> = {};
    for (let i = 0; i < 6; i++) expActual[MONTH_KEYS[i]] = 800n;

    const result = buildForecastReport(
      buildInputs(
        [EXPENSE],
        [makeBudgetLine(EXPENSE.id, expBudget)],
        { [EXPENSE.id]: makeActuals(expActual) },
        6,
      ),
    );

    const row = result.rows[0];
    // Trend: avgRunRate=800, yearEnd=4800+4800=9600, budget=12000
    expect(row.trendYearEndActual).toBe(9600n);
    // 9600 > 12000? No => ON_TRACK
    expect(row.riskStatus).toBe('ON_TRACK');
  });
});

/* ------------------------------------------------------------------ */
/*  3. Income AT_RISK                                                  */
/* ------------------------------------------------------------------ */

describe('buildForecastReport - income AT_RISK', () => {
  it('flags income as AT_RISK when trend projects under budget', () => {
    const incBudget: Record<string, number> = {};
    for (const k of MONTH_KEYS) incBudget[k] = 3000;

    // Actual: 1000/month (severe shortfall)
    const incActual: Record<string, bigint> = {};
    for (let i = 0; i < 6; i++) incActual[MONTH_KEYS[i]] = 1000n;

    const result = buildForecastReport(
      buildInputs(
        [INCOME],
        [makeBudgetLine(INCOME.id, incBudget)],
        { [INCOME.id]: makeActuals(incActual) },
        6,
      ),
    );

    const row = result.rows[0];
    // Trend: avgRunRate=1000, yearEnd=6000+6000=12000, budget=36000
    expect(row.trendYearEndActual).toBe(12000n);
    // 12000 < 36000 - 0 => AT_RISK
    expect(row.riskStatus).toBe('AT_RISK');
  });
});

/* ------------------------------------------------------------------ */
/*  4. Income ON_TRACK                                                 */
/* ------------------------------------------------------------------ */

describe('buildForecastReport - income ON_TRACK', () => {
  it('income is ON_TRACK when trend meets budget', () => {
    const incBudget: Record<string, number> = {};
    for (const k of MONTH_KEYS) incBudget[k] = 1000;

    // Actual: 1000/month (exactly on budget)
    const incActual: Record<string, bigint> = {};
    for (let i = 0; i < 6; i++) incActual[MONTH_KEYS[i]] = 1000n;

    const result = buildForecastReport(
      buildInputs(
        [INCOME],
        [makeBudgetLine(INCOME.id, incBudget)],
        { [INCOME.id]: makeActuals(incActual) },
        6,
      ),
    );

    const row = result.rows[0];
    // Trend: avgRunRate=1000, yearEnd=6000+6000=12000, budget=12000
    expect(row.trendYearEndActual).toBe(12000n);
    // 12000 < 12000 - 0? No => ON_TRACK
    expect(row.riskStatus).toBe('ON_TRACK');
  });
});

/* ------------------------------------------------------------------ */
/*  5. riskDelta                                                       */
/* ------------------------------------------------------------------ */

describe('buildForecastReport - riskDelta', () => {
  it('riskDelta equals trendVariance minus baselineVariance for each row', () => {
    const incBudget: Record<string, number> = {};
    const expBudget: Record<string, number> = {};
    for (const k of MONTH_KEYS) {
      incBudget[k] = 2000;
      expBudget[k] = 1000;
    }

    const incActual: Record<string, bigint> = {};
    const expActual: Record<string, bigint> = {};
    for (let i = 0; i < 3; i++) {
      incActual[MONTH_KEYS[i]] = 1500n;
      expActual[MONTH_KEYS[i]] = 1200n;
    }

    const result = buildForecastReport(
      buildInputs(
        [INCOME, EXPENSE],
        [
          makeBudgetLine(INCOME.id, incBudget),
          makeBudgetLine(EXPENSE.id, expBudget),
        ],
        {
          [INCOME.id]: makeActuals(incActual),
          [EXPENSE.id]: makeActuals(expActual),
        },
        3,
      ),
    );

    for (const row of result.rows) {
      expect(row.riskDelta).toBe(row.trendVariance - row.baselineVariance);
    }

    // Also verify asOfMonthIndex is passed through
    expect(result.asOfMonthIndex).toBe(3);
  });
});

/* ------------------------------------------------------------------ */
/*  6. Totals                                                          */
/* ------------------------------------------------------------------ */

describe('buildForecastReport - totals', () => {
  it('totals equal sum of individual rows for all bigint fields', () => {
    const incBudget: Record<string, number> = {};
    const expBudget: Record<string, number> = {};
    const exp2Budget: Record<string, number> = {};
    for (const k of MONTH_KEYS) {
      incBudget[k] = 5000;
      expBudget[k] = 2000;
      exp2Budget[k] = 1000;
    }

    const result = buildForecastReport(
      buildInputs(
        [INCOME, EXPENSE, EXPENSE2],
        [
          makeBudgetLine(INCOME.id, incBudget),
          makeBudgetLine(EXPENSE.id, expBudget),
          makeBudgetLine(EXPENSE2.id, exp2Budget),
        ],
        {
          [INCOME.id]: makeActuals({ m01_pence: 4000n, m02_pence: 6000n, m03_pence: 5000n }),
          [EXPENSE.id]: makeActuals({ m01_pence: 2500n, m02_pence: 1500n, m03_pence: 2000n }),
          [EXPENSE2.id]: makeActuals({ m01_pence: 800n, m02_pence: 1200n, m03_pence: 1000n }),
        },
        3,
      ),
    );

    const { rows, totals } = result;

    let sumBudget = 0n;
    let sumYTD = 0n;
    let sumBaselineActual = 0n;
    let sumBaselineVar = 0n;
    let sumTrendActual = 0n;
    let sumTrendVar = 0n;
    let sumRiskDelta = 0n;

    for (const r of rows) {
      sumBudget += r.annualBudget;
      sumYTD += r.actualYTD;
      sumBaselineActual += r.baselineYearEndActual;
      sumBaselineVar += r.baselineVariance;
      sumTrendActual += r.trendYearEndActual;
      sumTrendVar += r.trendVariance;
      sumRiskDelta += r.riskDelta;
    }

    expect(totals.annualBudget).toBe(sumBudget);
    expect(totals.actualYTD).toBe(sumYTD);
    expect(totals.baselineYearEndActual).toBe(sumBaselineActual);
    expect(totals.baselineVariance).toBe(sumBaselineVar);
    expect(totals.trendYearEndActual).toBe(sumTrendActual);
    expect(totals.trendVariance).toBe(sumTrendVar);
    expect(totals.riskDelta).toBe(sumRiskDelta);
    expect(totals.accountName).toBe('Totals');
  });

  it('totals riskStatus is AT_RISK if any row is AT_RISK', () => {
    const incBudget: Record<string, number> = {};
    const expBudget: Record<string, number> = {};
    for (const k of MONTH_KEYS) {
      incBudget[k] = 1000;
      expBudget[k] = 1000;
    }

    // Income on track, expense overspending
    const result = buildForecastReport(
      buildInputs(
        [INCOME, EXPENSE],
        [
          makeBudgetLine(INCOME.id, incBudget),
          makeBudgetLine(EXPENSE.id, expBudget),
        ],
        {
          [INCOME.id]: makeActuals({ m01_pence: 1000n, m02_pence: 1000n, m03_pence: 1000n }),
          [EXPENSE.id]: makeActuals({ m01_pence: 2000n, m02_pence: 2000n, m03_pence: 2000n }),
        },
        3,
      ),
    );

    // Expense is AT_RISK (2000/month trend > 12000 budget)
    expect(result.rows.find((r) => r.accountType === 'expense')?.riskStatus).toBe('AT_RISK');
    // Income is ON_TRACK (1000/month trend = 12000 budget)
    expect(result.rows.find((r) => r.accountType === 'income')?.riskStatus).toBe('ON_TRACK');
    // Totals should be AT_RISK because at least one row is AT_RISK
    expect(result.totals.riskStatus).toBe('AT_RISK');
  });

  it('computeForecastReportTotals works standalone', () => {
    const result = buildForecastReport(
      buildInputs(
        [INCOME, EXPENSE],
        [
          makeBudgetLine(INCOME.id, { m01_pence: 1000 }),
          makeBudgetLine(EXPENSE.id, { m01_pence: 500 }),
        ],
        {
          [INCOME.id]: makeActuals({ m01_pence: 1200n }),
          [EXPENSE.id]: makeActuals({ m01_pence: 400n }),
        },
        1,
      ),
    );

    const standalone = computeForecastReportTotals(result.rows);
    expect(standalone.annualBudget).toBe(result.totals.annualBudget);
    expect(standalone.actualYTD).toBe(result.totals.actualYTD);
    expect(standalone.trendYearEndActual).toBe(result.totals.trendYearEndActual);
  });
});

/* ------------------------------------------------------------------ */
/*  7. Tolerance edge                                                  */
/* ------------------------------------------------------------------ */

describe('buildForecastReport - tolerance edge', () => {
  it('expense exactly at tolerance boundary is ON_TRACK', () => {
    const expBudget: Record<string, number> = {};
    for (const k of MONTH_KEYS) expBudget[k] = 1000;

    // Actual: 1000/month exactly on budget
    // Trend yearEnd = 12000, budget = 12000, tolerance = 1000
    // 12000 > 12000 + 1000? No => ON_TRACK
    const expActual: Record<string, bigint> = {};
    for (let i = 0; i < 6; i++) expActual[MONTH_KEYS[i]] = 1000n;

    const result = buildForecastReport(
      buildInputs(
        [EXPENSE],
        [makeBudgetLine(EXPENSE.id, expBudget)],
        { [EXPENSE.id]: makeActuals(expActual) },
        6,
        1000n, // tolerance
      ),
    );

    expect(result.rows[0].riskStatus).toBe('ON_TRACK');
  });

  it('expense one pence past tolerance is AT_RISK', () => {
    const expBudget: Record<string, number> = {};
    for (const k of MONTH_KEYS) expBudget[k] = 1000;

    // We need trendYearEndActual > annualBudget + 500
    // Budget = 12000, tolerance = 500 => threshold = 12500
    // If actual = 1100/month => trend yearEnd = 6*1100 + 6*1100 = 13200
    // 13200 > 12500 => AT_RISK
    const expActual: Record<string, bigint> = {};
    for (let i = 0; i < 6; i++) expActual[MONTH_KEYS[i]] = 1100n;

    const result = buildForecastReport(
      buildInputs(
        [EXPENSE],
        [makeBudgetLine(EXPENSE.id, expBudget)],
        { [EXPENSE.id]: makeActuals(expActual) },
        6,
        500n, // tolerance
      ),
    );

    // trendYearEndActual = 13200, budget + tolerance = 12500
    expect(result.rows[0].trendYearEndActual).toBe(13200n);
    expect(result.rows[0].riskStatus).toBe('AT_RISK');
  });

  it('income exactly at tolerance boundary is ON_TRACK', () => {
    const incBudget: Record<string, number> = {};
    for (const k of MONTH_KEYS) incBudget[k] = 1000;

    // Budget = 12000, tolerance = 1000 => threshold = 11000
    // Actual 1000/month => trend yearEnd = 12000
    // 12000 < 11000? No => ON_TRACK
    const incActual: Record<string, bigint> = {};
    for (let i = 0; i < 6; i++) incActual[MONTH_KEYS[i]] = 1000n;

    const result = buildForecastReport(
      buildInputs(
        [INCOME],
        [makeBudgetLine(INCOME.id, incBudget)],
        { [INCOME.id]: makeActuals(incActual) },
        6,
        1000n,
      ),
    );

    expect(result.rows[0].riskStatus).toBe('ON_TRACK');
  });

  it('income one pence past tolerance is AT_RISK', () => {
    const incBudget: Record<string, number> = {};
    for (const k of MONTH_KEYS) incBudget[k] = 1000;

    // Budget = 12000, tolerance = 500 => threshold = 11500
    // Actual 900/month => trend yearEnd = 5400 + 5400 = 10800
    // 10800 < 11500 => AT_RISK
    const incActual: Record<string, bigint> = {};
    for (let i = 0; i < 6; i++) incActual[MONTH_KEYS[i]] = 900n;

    const result = buildForecastReport(
      buildInputs(
        [INCOME],
        [makeBudgetLine(INCOME.id, incBudget)],
        { [INCOME.id]: makeActuals(incActual) },
        6,
        500n,
      ),
    );

    expect(result.rows[0].trendYearEndActual).toBe(10800n);
    expect(result.rows[0].riskStatus).toBe('AT_RISK');
  });
});
