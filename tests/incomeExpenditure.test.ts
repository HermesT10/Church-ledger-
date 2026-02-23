import { describe, it, expect } from 'vitest';
import { MONTH_KEYS } from '@/lib/budgets/budgetMath';
import type { ActualsMap, MonthlyActuals } from '@/lib/reports/actuals';
import {
  buildIncomeExpenditureReport,
  type IEAccountRef,
} from '@/lib/reports/incomeExpenditure';

/* ------------------------------------------------------------------ */
/*  Factory helpers                                                    */
/* ------------------------------------------------------------------ */

function makeAccount(id: string, code: string, name: string, type: string): IEAccountRef {
  return { id, code, name, type };
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

const INC1 = makeAccount('inc-1', 'INC-001', 'Donations-General', 'income');
const INC2 = makeAccount('inc-2', 'INC-002', 'Gift Aid', 'income');
const EXP1 = makeAccount('exp-1', 'EXP-001', 'Salaries', 'expense');
const EXP2 = makeAccount('exp-2', 'EXP-002', 'Utilities', 'expense');

/* ------------------------------------------------------------------ */
/*  1. Income and expense sums correct                                 */
/* ------------------------------------------------------------------ */

describe('buildIncomeExpenditureReport - category sums', () => {
  it('category totals match sum of rows', () => {
    const actuals: ActualsMap = {
      [INC1.id]: makeActuals({ m01_pence: 5000n, m02_pence: 3000n }),
      [INC2.id]: makeActuals({ m01_pence: 1000n, m02_pence: 2000n }),
      [EXP1.id]: makeActuals({ m01_pence: 4000n, m02_pence: 2500n }),
      [EXP2.id]: makeActuals({ m01_pence: 500n, m02_pence: 800n }),
    };

    const report = buildIncomeExpenditureReport({
      accounts: [INC1, INC2, EXP1, EXP2],
      actualsMap: actuals,
    });

    expect(report.categories).toHaveLength(2);

    const income = report.categories[0];
    expect(income.categoryName).toBe('Income');
    expect(income.rows).toHaveLength(2);

    // Income totals = sum of row YTDs
    const incYtdSum = income.rows.reduce((s, r) => s + r.ytdActual, 0n);
    expect(income.totals.ytdActual).toBe(incYtdSum);

    const expenses = report.categories[1];
    expect(expenses.categoryName).toBe('Expenses');
    expect(expenses.rows).toHaveLength(2);

    const expYtdSum = expenses.rows.reduce((s, r) => s + r.ytdActual, 0n);
    expect(expenses.totals.ytdActual).toBe(expYtdSum);

    // Verify actual values
    // INC1 YTD: 5000 + 3000 = 8000, INC2 YTD: 1000 + 2000 = 3000
    expect(income.totals.ytdActual).toBe(11000n);
    // EXP1 YTD: 4000 + 2500 = 6500, EXP2 YTD: 500 + 800 = 1300
    expect(expenses.totals.ytdActual).toBe(7800n);
  });
});

/* ------------------------------------------------------------------ */
/*  2. Fund filter works (via different actualsMap inputs)             */
/* ------------------------------------------------------------------ */

describe('buildIncomeExpenditureReport - fund filter', () => {
  it('processes whatever actualsMap it receives (simulating fund filter)', () => {
    // Simulate a fund-filtered actualsMap: only INC1 has data
    const fundFiltered: ActualsMap = {
      [INC1.id]: makeActuals({ m01_pence: 2000n }),
    };

    const report = buildIncomeExpenditureReport({
      accounts: [INC1, INC2, EXP1],
      actualsMap: fundFiltered,
    });

    const income = report.categories[0];
    // INC1 has data, INC2 does not
    expect(income.rows[0].ytdActual).toBe(2000n);
    expect(income.rows[1].ytdActual).toBe(0n);

    const expenses = report.categories[1];
    // EXP1 has no data in this fund
    expect(expenses.rows[0].ytdActual).toBe(0n);
  });
});

/* ------------------------------------------------------------------ */
/*  3. YTD logic correct                                               */
/* ------------------------------------------------------------------ */

describe('buildIncomeExpenditureReport - YTD logic', () => {
  it('month=6: YTD sums m01..m06 only', () => {
    const actuals: ActualsMap = {
      [EXP1.id]: makeActuals({
        m01_pence: 1000n,
        m02_pence: 1000n,
        m03_pence: 1000n,
        m04_pence: 1000n,
        m05_pence: 1000n,
        m06_pence: 1000n,
        m07_pence: 9999n, // should NOT be included
        m08_pence: 9999n,
      }),
    };

    const report = buildIncomeExpenditureReport({
      accounts: [EXP1],
      actualsMap: actuals,
      month: 6,
    });

    const row = report.categories[1].rows[0]; // Expenses category
    // YTD = sum of m01..m06 = 6000
    expect(row.ytdActual).toBe(6000n);
  });

  it('no month: YTD sums all 12 months', () => {
    const months: Record<string, bigint> = {};
    for (let i = 0; i < 12; i++) months[MONTH_KEYS[i]] = 100n;

    const actuals: ActualsMap = {
      [INC1.id]: makeActuals(months),
    };

    const report = buildIncomeExpenditureReport({
      accounts: [INC1],
      actualsMap: actuals,
    });

    const row = report.categories[0].rows[0]; // Income category
    // YTD = 100 * 12 = 1200
    expect(row.ytdActual).toBe(1200n);
  });
});

/* ------------------------------------------------------------------ */
/*  4. Monthly column                                                  */
/* ------------------------------------------------------------------ */

describe('buildIncomeExpenditureReport - monthly column', () => {
  it('month=3: monthlyActual equals m03_pence value', () => {
    const actuals: ActualsMap = {
      [INC1.id]: makeActuals({
        m01_pence: 1000n,
        m02_pence: 2000n,
        m03_pence: 3000n,
      }),
    };

    const report = buildIncomeExpenditureReport({
      accounts: [INC1],
      actualsMap: actuals,
      month: 3,
    });

    const row = report.categories[0].rows[0];
    expect(row.monthlyActual).toBe(3000n);
  });

  it('no month: monthlyActual is 0n', () => {
    const actuals: ActualsMap = {
      [INC1.id]: makeActuals({ m01_pence: 5000n }),
    };

    const report = buildIncomeExpenditureReport({
      accounts: [INC1],
      actualsMap: actuals,
    });

    const row = report.categories[0].rows[0];
    expect(row.monthlyActual).toBe(0n);
  });
});

/* ------------------------------------------------------------------ */
/*  5. Totals tie out (net = income - expenses)                        */
/* ------------------------------------------------------------------ */

describe('buildIncomeExpenditureReport - net totals', () => {
  it('report totals = income totals - expense totals', () => {
    const actuals: ActualsMap = {
      [INC1.id]: makeActuals({ m01_pence: 10000n, m02_pence: 5000n }),
      [INC2.id]: makeActuals({ m01_pence: 2000n }),
      [EXP1.id]: makeActuals({ m01_pence: 6000n, m02_pence: 3000n }),
      [EXP2.id]: makeActuals({ m01_pence: 1000n }),
    };

    const report = buildIncomeExpenditureReport({
      accounts: [INC1, INC2, EXP1, EXP2],
      actualsMap: actuals,
      month: 2,
    });

    const income = report.categories[0];
    const expenses = report.categories[1];

    // Net monthly = income monthly - expense monthly
    expect(report.totals.monthlyActual).toBe(
      income.totals.monthlyActual - expenses.totals.monthlyActual,
    );

    // Net YTD = income YTD - expense YTD
    expect(report.totals.ytdActual).toBe(
      income.totals.ytdActual - expenses.totals.ytdActual,
    );

    // Income YTD (m01+m02): INC1=15000, INC2=2000 => 17000
    // Expense YTD (m01+m02): EXP1=9000, EXP2=1000 => 10000
    // Net = 17000 - 10000 = 7000
    expect(report.totals.ytdActual).toBe(7000n);
  });
});

/* ------------------------------------------------------------------ */
/*  6. Empty actuals                                                   */
/* ------------------------------------------------------------------ */

describe('buildIncomeExpenditureReport - empty actuals', () => {
  it('accounts with no actuals produce 0n rows', () => {
    const report = buildIncomeExpenditureReport({
      accounts: [INC1, EXP1],
      actualsMap: {},
    });

    expect(report.categories[0].rows[0].ytdActual).toBe(0n);
    expect(report.categories[0].rows[0].monthlyActual).toBe(0n);
    expect(report.categories[1].rows[0].ytdActual).toBe(0n);
    expect(report.categories[1].rows[0].monthlyActual).toBe(0n);
    expect(report.totals.ytdActual).toBe(0n);
    expect(report.totals.monthlyActual).toBe(0n);
  });

  it('handles empty accounts list', () => {
    const report = buildIncomeExpenditureReport({
      accounts: [],
      actualsMap: {},
    });

    expect(report.categories).toHaveLength(2);
    expect(report.categories[0].rows).toHaveLength(0);
    expect(report.categories[1].rows).toHaveLength(0);
    expect(report.totals.ytdActual).toBe(0n);
  });
});
