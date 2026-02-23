import { describe, it, expect } from 'vitest';
import { MONTH_KEYS } from '@/lib/budgets/budgetMath';
import type { AccountRef, BudgetGridLine } from '@/lib/budgets/types';
import type { ActualsMap, MonthlyActuals } from '@/lib/reports/actuals';
import { buildBudgetVsActual } from '@/lib/reports/budgetVsActual';
import {
  buildBaselineForecast,
  computeForecastTotals,
} from '@/lib/forecast/baselineForecast';

/* ------------------------------------------------------------------ */
/*  Helpers (same factories as budgetVsActual tests)                   */
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

/** Build BvA rows from accounts, budget lines, and actuals. */
function buildRows(
  accounts: AccountRef[],
  budgetLines: BudgetGridLine[],
  actualsMap: ActualsMap,
) {
  return buildBudgetVsActual({
    accounts,
    budgetLines,
    actualsByAccountMonth: actualsMap,
  });
}

const INCOME = makeAccount('acc-inc', '1000', 'Donations', 'income');
const EXPENSE = makeAccount('acc-exp', '2000', 'Salaries', 'expense');
const EXPENSE2 = makeAccount('acc-exp2', '2100', 'Utilities', 'expense');

/* ------------------------------------------------------------------ */
/*  December (month 12) -- remainingBudget = 0, yearEnd = actualYTD    */
/* ------------------------------------------------------------------ */

describe('buildBaselineForecast - December', () => {
  it('remainingBudget is 0 at month 12; forecastYearEndActual = actualYTD', () => {
    const bvaRows = buildRows(
      [EXPENSE],
      [makeBudgetLine(EXPENSE.id, { m01_pence: 5000, m06_pence: 5000 })],
      { [EXPENSE.id]: makeActuals({ m01_pence: 4000n, m06_pence: 6000n, m12_pence: 1000n }) },
    );

    const result = buildBaselineForecast({
      budgetVsActualRows: bvaRows,
      asOfMonthIndex: 12,
    });

    expect(result.asOfMonthIndex).toBe(12);
    expect(result.rows).toHaveLength(1);

    const f = result.rows[0];
    expect(f.remainingBudget).toBe(0n);
    // actualYTD at month 12 = sum of all 12 months of actuals
    expect(f.forecastYearEndActual).toBe(f.actualYTD);
    // variance = actualYTD - annualBudget = 11000 - 10000 = 1000
    expect(f.forecastVariance).toBe(1000n);
  });
});

/* ------------------------------------------------------------------ */
/*  Negative remaining budget (actual exceeds budget)                  */
/* ------------------------------------------------------------------ */

describe('buildBaselineForecast - negative remaining budget', () => {
  it('handles actual exceeding annual budget gracefully', () => {
    // Annual budget: 6000. Actual by month 6: 8000 → remainingBudget = -2000
    const bvaRows = buildRows(
      [EXPENSE],
      [makeBudgetLine(EXPENSE.id, {
        m01_pence: 1000, m02_pence: 1000, m03_pence: 1000,
        m04_pence: 1000, m05_pence: 1000, m06_pence: 1000,
      })],
      { [EXPENSE.id]: makeActuals({
        m01_pence: 2000n, m02_pence: 2000n, m03_pence: 1000n,
        m04_pence: 1000n, m05_pence: 1000n, m06_pence: 1000n,
      }) },
    );

    const result = buildBaselineForecast({
      budgetVsActualRows: bvaRows,
      asOfMonthIndex: 6,
    });

    const f = result.rows[0];
    expect(f.annualBudget).toBe(6000n);
    expect(f.actualYTD).toBe(8000n);
    // remainingBudget = 6000 - 8000 = -2000
    expect(f.remainingBudget).toBe(-2000n);
    // forecastYearEndActual = 8000 + (-2000) = 6000
    expect(f.forecastYearEndActual).toBe(6000n);
    // forecastVariance = 6000 - 6000 = 0
    expect(f.forecastVariance).toBe(0n);
  });
});

/* ------------------------------------------------------------------ */
/*  Mid-year forecast                                                  */
/* ------------------------------------------------------------------ */

describe('buildBaselineForecast - mid-year', () => {
  it('computes correct forecast at month 6', () => {
    // Budget: 1000/month * 12 = 12000
    // Actual months 1-6: 800 each = 4800
    const months: Record<string, number> = {};
    for (const k of MONTH_KEYS) months[k] = 1000;

    const actMonths: Record<string, bigint> = {};
    for (let i = 0; i < 6; i++) actMonths[MONTH_KEYS[i]] = 800n;

    const bvaRows = buildRows(
      [EXPENSE],
      [makeBudgetLine(EXPENSE.id, months)],
      { [EXPENSE.id]: makeActuals(actMonths) },
    );

    const result = buildBaselineForecast({
      budgetVsActualRows: bvaRows,
      asOfMonthIndex: 6,
    });

    const f = result.rows[0];
    expect(f.annualBudget).toBe(12000n);
    expect(f.actualYTD).toBe(4800n);
    // remainingBudget = 12000 - 4800 = 7200
    expect(f.remainingBudget).toBe(7200n);
    // forecastYearEndActual = 4800 + 7200 = 12000
    expect(f.forecastYearEndActual).toBe(12000n);
    // forecastVariance = 12000 - 12000 = 0
    expect(f.forecastVariance).toBe(0n);
  });
});

/* ------------------------------------------------------------------ */
/*  Budget = 0                                                         */
/* ------------------------------------------------------------------ */

describe('buildBaselineForecast - budget=0', () => {
  it('handles zero annual budget with actuals', () => {
    // No budget lines → annualBudget = 0. Actual: 3000 in m01
    const bvaRows = buildRows(
      [EXPENSE],
      [], // no budget lines
      { [EXPENSE.id]: makeActuals({ m01_pence: 3000n }) },
    );

    const result = buildBaselineForecast({
      budgetVsActualRows: bvaRows,
      asOfMonthIndex: 3,
    });

    const f = result.rows[0];
    expect(f.annualBudget).toBe(0n);
    expect(f.actualYTD).toBe(3000n);
    // remainingBudget = 0 - 3000 = -3000
    expect(f.remainingBudget).toBe(-3000n);
    // forecastYearEndActual = 3000 + (-3000) = 0
    expect(f.forecastYearEndActual).toBe(0n);
    // forecastVariance = 0 - 0 = 0
    expect(f.forecastVariance).toBe(0n);
  });

  it('handles zero budget and zero actuals', () => {
    const bvaRows = buildRows(
      [EXPENSE],
      [],
      {},
    );

    const result = buildBaselineForecast({
      budgetVsActualRows: bvaRows,
      asOfMonthIndex: 6,
    });

    const f = result.rows[0];
    expect(f.annualBudget).toBe(0n);
    expect(f.actualYTD).toBe(0n);
    expect(f.remainingBudget).toBe(0n);
    expect(f.forecastYearEndActual).toBe(0n);
    expect(f.forecastVariance).toBe(0n);
  });
});

/* ------------------------------------------------------------------ */
/*  Totals match sum of rows                                           */
/* ------------------------------------------------------------------ */

describe('buildBaselineForecast - totals', () => {
  it('totals equal sum of individual rows', () => {
    const bvaRows = buildRows(
      [INCOME, EXPENSE, EXPENSE2],
      [
        makeBudgetLine(INCOME.id, { m01_pence: 5000, m02_pence: 5000 }),
        makeBudgetLine(EXPENSE.id, { m01_pence: 3000, m02_pence: 3000 }),
        makeBudgetLine(EXPENSE2.id, { m01_pence: 1000, m02_pence: 1000 }),
      ],
      {
        [INCOME.id]: makeActuals({ m01_pence: 4000n, m02_pence: 6000n }),
        [EXPENSE.id]: makeActuals({ m01_pence: 3500n, m02_pence: 2500n }),
        [EXPENSE2.id]: makeActuals({ m01_pence: 800n, m02_pence: 1200n }),
      },
    );

    const result = buildBaselineForecast({
      budgetVsActualRows: bvaRows,
      asOfMonthIndex: 2,
    });

    const { rows, totals } = result;

    // Verify totals = sum of all rows
    let sumBudget = 0n;
    let sumYTD = 0n;
    let sumRemaining = 0n;
    let sumYearEnd = 0n;
    let sumVariance = 0n;
    for (const f of rows) {
      sumBudget += f.annualBudget;
      sumYTD += f.actualYTD;
      sumRemaining += f.remainingBudget;
      sumYearEnd += f.forecastYearEndActual;
      sumVariance += f.forecastVariance;
    }

    expect(totals.annualBudget).toBe(sumBudget);
    expect(totals.actualYTD).toBe(sumYTD);
    expect(totals.remainingBudget).toBe(sumRemaining);
    expect(totals.forecastYearEndActual).toBe(sumYearEnd);
    expect(totals.forecastVariance).toBe(sumVariance);
    expect(totals.accountName).toBe('Totals');
  });

  it('computeForecastTotals works standalone', () => {
    const bvaRows = buildRows(
      [INCOME, EXPENSE],
      [
        makeBudgetLine(INCOME.id, { m01_pence: 1000 }),
        makeBudgetLine(EXPENSE.id, { m01_pence: 500 }),
      ],
      {
        [INCOME.id]: makeActuals({ m01_pence: 1200n }),
        [EXPENSE.id]: makeActuals({ m01_pence: 400n }),
      },
    );

    const result = buildBaselineForecast({
      budgetVsActualRows: bvaRows,
      asOfMonthIndex: 1,
    });

    const standalone = computeForecastTotals(result.rows);
    expect(standalone.annualBudget).toBe(result.totals.annualBudget);
    expect(standalone.actualYTD).toBe(result.totals.actualYTD);
    expect(standalone.remainingBudget).toBe(result.totals.remainingBudget);
  });
});

/* ------------------------------------------------------------------ */
/*  Income vs expense sign conventions                                 */
/* ------------------------------------------------------------------ */

describe('buildBaselineForecast - sign conventions', () => {
  it('income account: positive actuals produce sensible forecast', () => {
    const bvaRows = buildRows(
      [INCOME],
      [makeBudgetLine(INCOME.id, {
        m01_pence: 2000, m02_pence: 2000, m03_pence: 1000,
        m04_pence: 1000, m05_pence: 2000, m06_pence: 2000,
      })],
      { [INCOME.id]: makeActuals({
        m01_pence: 1500n, m02_pence: 1500n, m03_pence: 1000n,
        m04_pence: 1000n, m05_pence: 1500n, m06_pence: 1500n,
      }) },
    );

    const result = buildBaselineForecast({
      budgetVsActualRows: bvaRows,
      asOfMonthIndex: 6,
    });

    const f = result.rows[0];
    expect(f.annualBudget).toBe(10000n);
    expect(f.actualYTD).toBe(8000n);
    expect(f.remainingBudget).toBe(2000n); // 10000 - 8000
    expect(f.forecastYearEndActual).toBe(10000n); // 8000 + 2000
    expect(f.forecastVariance).toBe(0n);
  });

  it('expense account: positive actuals produce sensible forecast', () => {
    const bvaRows = buildRows(
      [EXPENSE],
      [makeBudgetLine(EXPENSE.id, {
        m01_pence: 500, m02_pence: 500, m03_pence: 500,
        m04_pence: 500, m05_pence: 500, m06_pence: 500,
        m07_pence: 500, m08_pence: 500, m09_pence: 500,
        m10_pence: 500, m11_pence: 500, m12_pence: 500,
      })],
      { [EXPENSE.id]: makeActuals({
        m01_pence: 1500n, m02_pence: 1500n, m03_pence: 1500n,
      }) },
    );

    const result = buildBaselineForecast({
      budgetVsActualRows: bvaRows,
      asOfMonthIndex: 3,
    });

    const f = result.rows[0];
    expect(f.annualBudget).toBe(6000n);
    expect(f.actualYTD).toBe(4500n);
    expect(f.remainingBudget).toBe(1500n);
    expect(f.forecastYearEndActual).toBe(6000n);
    expect(f.forecastVariance).toBe(0n);
  });
});

/* ------------------------------------------------------------------ */
/*  Edge cases                                                         */
/* ------------------------------------------------------------------ */

describe('buildBaselineForecast - edge cases', () => {
  it('empty rows produce empty output', () => {
    const result = buildBaselineForecast({
      budgetVsActualRows: [],
      asOfMonthIndex: 6,
    });

    expect(result.rows).toHaveLength(0);
    expect(result.totals.annualBudget).toBe(0n);
    expect(result.totals.actualYTD).toBe(0n);
  });

  it('month 1 uses only January actuals for YTD', () => {
    const bvaRows = buildRows(
      [EXPENSE],
      [makeBudgetLine(EXPENSE.id, { m01_pence: 1000, m02_pence: 1000 })],
      { [EXPENSE.id]: makeActuals({ m01_pence: 900n, m02_pence: 500n }) },
    );

    const result = buildBaselineForecast({
      budgetVsActualRows: bvaRows,
      asOfMonthIndex: 1,
    });

    const f = result.rows[0];
    expect(f.actualYTD).toBe(900n); // only m01
    expect(f.annualBudget).toBe(2000n);
    // remainingBudget = 2000 - 900 = 1100
    expect(f.remainingBudget).toBe(1100n);
    expect(f.forecastYearEndActual).toBe(2000n); // 900 + 1100
    expect(f.forecastVariance).toBe(0n);
  });
});
