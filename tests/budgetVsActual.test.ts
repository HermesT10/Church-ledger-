import { describe, it, expect } from 'vitest';
import { MONTH_KEYS } from '@/lib/budgets/budgetMath';
import type { AccountRef, BudgetGridLine } from '@/lib/budgets/types';
import type { ActualsMap, MonthlyActuals } from '@/lib/reports/actuals';
import {
  buildBudgetVsActual,
  computeBvaTotals,
  type BvaRow,
} from '@/lib/reports/budgetVsActual';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
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

const INCOME = makeAccount('acc-inc', '1000', 'Donations', 'income');
const EXPENSE = makeAccount('acc-exp', '2000', 'Salaries', 'expense');

/* ------------------------------------------------------------------ */
/*  Variance percentage                                                */
/* ------------------------------------------------------------------ */

describe('buildBudgetVsActual - variancePct', () => {
  it('returns null when budget is 0', () => {
    const rows = buildBudgetVsActual({
      accounts: [INCOME],
      budgetLines: [], // no budget → 0
      actualsByAccountMonth: {
        [INCOME.id]: makeActuals({ m01_pence: 5000n }),
      },
    });

    expect(rows[0].months.m01_pence.variancePct).toBeNull();
    expect(rows[0].ytd.variancePct).toBeNull();
  });

  it('computes correct variancePct for non-zero budget', () => {
    const rows = buildBudgetVsActual({
      accounts: [INCOME],
      budgetLines: [makeBudgetLine(INCOME.id, { m01_pence: 1000 })],
      actualsByAccountMonth: {
        [INCOME.id]: makeActuals({ m01_pence: 1200n }),
      },
    });

    // variance = 1200 - 1000 = 200, pct = 200/1000 = 0.2
    expect(rows[0].months.m01_pence.variance).toBe(200n);
    expect(rows[0].months.m01_pence.variancePct).toBeCloseTo(0.2);
  });

  it('computes negative variancePct when under budget', () => {
    const rows = buildBudgetVsActual({
      accounts: [EXPENSE],
      budgetLines: [makeBudgetLine(EXPENSE.id, { m03_pence: 5000 })],
      actualsByAccountMonth: {
        [EXPENSE.id]: makeActuals({ m03_pence: 4000n }),
      },
    });

    // variance = 4000 - 5000 = -1000, pct = -1000/5000 = -0.2
    expect(rows[0].months.m03_pence.variance).toBe(-1000n);
    expect(rows[0].months.m03_pence.variancePct).toBeCloseTo(-0.2);
  });
});

/* ------------------------------------------------------------------ */
/*  Sign conventions                                                   */
/* ------------------------------------------------------------------ */

describe('buildBudgetVsActual - sign conventions', () => {
  it('income: positive actuals produce positive variance when over budget', () => {
    const rows = buildBudgetVsActual({
      accounts: [INCOME],
      budgetLines: [makeBudgetLine(INCOME.id, { m06_pence: 10000 })],
      actualsByAccountMonth: {
        [INCOME.id]: makeActuals({ m06_pence: 12000n }),
      },
    });

    const cell = rows[0].months.m06_pence;
    expect(cell.budget).toBe(10000n);
    expect(cell.actual).toBe(12000n);
    expect(cell.variance).toBe(2000n); // favourable
  });

  it('expense: actuals under budget produce negative variance (favourable)', () => {
    const rows = buildBudgetVsActual({
      accounts: [EXPENSE],
      budgetLines: [makeBudgetLine(EXPENSE.id, { m02_pence: 8000 })],
      actualsByAccountMonth: {
        [EXPENSE.id]: makeActuals({ m02_pence: 6000n }),
      },
    });

    const cell = rows[0].months.m02_pence;
    expect(cell.budget).toBe(8000n);
    expect(cell.actual).toBe(6000n);
    expect(cell.variance).toBe(-2000n); // under budget = favourable for expense
  });
});

/* ------------------------------------------------------------------ */
/*  YTD and annual                                                     */
/* ------------------------------------------------------------------ */

describe('buildBudgetVsActual - ytd and annual', () => {
  it('ytd sums all 12 months', () => {
    const rows = buildBudgetVsActual({
      accounts: [INCOME],
      budgetLines: [makeBudgetLine(INCOME.id, { m01_pence: 100, m06_pence: 200 })],
      actualsByAccountMonth: {
        [INCOME.id]: makeActuals({ m01_pence: 150n, m06_pence: 250n }),
      },
    });

    expect(rows[0].ytd.budget).toBe(300n);
    expect(rows[0].ytd.actual).toBe(400n);
    expect(rows[0].ytd.variance).toBe(100n);
  });

  it('annual equals ytd', () => {
    const rows = buildBudgetVsActual({
      accounts: [EXPENSE],
      budgetLines: [makeBudgetLine(EXPENSE.id, { m12_pence: 500 })],
      actualsByAccountMonth: {
        [EXPENSE.id]: makeActuals({ m12_pence: 700n }),
      },
    });

    expect(rows[0].annual.budget).toBe(rows[0].ytd.budget);
    expect(rows[0].annual.actual).toBe(rows[0].ytd.actual);
    expect(rows[0].annual.variance).toBe(rows[0].ytd.variance);
  });
});

/* ------------------------------------------------------------------ */
/*  Missing data                                                       */
/* ------------------------------------------------------------------ */

describe('buildBudgetVsActual - missing data', () => {
  it('account with no budget line gets zero budget values', () => {
    const rows = buildBudgetVsActual({
      accounts: [INCOME],
      budgetLines: [], // no budget lines
      actualsByAccountMonth: {
        [INCOME.id]: makeActuals({ m04_pence: 3000n }),
      },
    });

    expect(rows[0].months.m04_pence.budget).toBe(0n);
    expect(rows[0].months.m04_pence.actual).toBe(3000n);
    expect(rows[0].ytd.budget).toBe(0n);
  });

  it('account with no actuals gets zero actual values', () => {
    const rows = buildBudgetVsActual({
      accounts: [EXPENSE],
      budgetLines: [makeBudgetLine(EXPENSE.id, { m05_pence: 2000 })],
      actualsByAccountMonth: {}, // no actuals
    });

    expect(rows[0].months.m05_pence.actual).toBe(0n);
    expect(rows[0].months.m05_pence.budget).toBe(2000n);
    expect(rows[0].ytd.actual).toBe(0n);
  });

  it('empty inputs produce empty output', () => {
    const rows = buildBudgetVsActual({
      accounts: [],
      budgetLines: [],
      actualsByAccountMonth: {},
    });

    expect(rows).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  computeBvaTotals                                                   */
/* ------------------------------------------------------------------ */

describe('computeBvaTotals', () => {
  it('totals equal sum of individual rows', () => {
    const rows = buildBudgetVsActual({
      accounts: [INCOME, EXPENSE],
      budgetLines: [
        makeBudgetLine(INCOME.id, { m01_pence: 1000, m02_pence: 2000 }),
        makeBudgetLine(EXPENSE.id, { m01_pence: 500, m02_pence: 800 }),
      ],
      actualsByAccountMonth: {
        [INCOME.id]: makeActuals({ m01_pence: 1100n, m02_pence: 2200n }),
        [EXPENSE.id]: makeActuals({ m01_pence: 600n, m02_pence: 700n }),
      },
    });

    const totals = computeBvaTotals(rows);

    // m01 budget: 1000 + 500 = 1500
    expect(totals.months.m01_pence.budget).toBe(1500n);
    // m01 actual: 1100 + 600 = 1700
    expect(totals.months.m01_pence.actual).toBe(1700n);
    // m01 variance: 1700 - 1500 = 200
    expect(totals.months.m01_pence.variance).toBe(200n);

    // m02 budget: 2000 + 800 = 2800
    expect(totals.months.m02_pence.budget).toBe(2800n);
    // m02 actual: 2200 + 700 = 2900
    expect(totals.months.m02_pence.actual).toBe(2900n);

    // ytd budget = sum of row ytds = (1000+2000) + (500+800) = 4300
    expect(totals.ytd.budget).toBe(4300n);
    // ytd actual = (1100+2200) + (600+700) = 4600
    expect(totals.ytd.actual).toBe(4600n);
    // ytd variance = 4600 - 4300 = 300
    expect(totals.ytd.variance).toBe(300n);
  });

  it('totals variancePct is null when total budget is 0', () => {
    const rows = buildBudgetVsActual({
      accounts: [INCOME],
      budgetLines: [], // no budget
      actualsByAccountMonth: {
        [INCOME.id]: makeActuals({ m01_pence: 100n }),
      },
    });

    const totals = computeBvaTotals(rows);
    expect(totals.months.m01_pence.variancePct).toBeNull();
    expect(totals.ytd.variancePct).toBeNull();
  });

  it('totals variancePct computed from summed values', () => {
    const rows = buildBudgetVsActual({
      accounts: [INCOME],
      budgetLines: [makeBudgetLine(INCOME.id, { m01_pence: 1000 })],
      actualsByAccountMonth: {
        [INCOME.id]: makeActuals({ m01_pence: 1500n }),
      },
    });

    const totals = computeBvaTotals(rows);
    // variance = 500, budget = 1000, pct = 0.5
    expect(totals.months.m01_pence.variancePct).toBeCloseTo(0.5);
  });

  it('handles empty rows', () => {
    const totals = computeBvaTotals([]);

    for (const key of MONTH_KEYS) {
      expect(totals.months[key].budget).toBe(0n);
      expect(totals.months[key].actual).toBe(0n);
      expect(totals.months[key].variance).toBe(0n);
      expect(totals.months[key].variancePct).toBeNull();
    }
    expect(totals.ytd.budget).toBe(0n);
    expect(totals.annual.budget).toBe(0n);
  });
});
