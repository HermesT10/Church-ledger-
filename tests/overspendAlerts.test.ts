import { describe, it, expect } from 'vitest';
import { MONTH_KEYS } from '@/lib/budgets/budgetMath';
import type { AccountRef, BudgetGridLine } from '@/lib/budgets/types';
import type { ActualsMap, MonthlyActuals } from '@/lib/reports/actuals';
import { buildBudgetVsActual } from '@/lib/reports/budgetVsActual';
import { detectOverspendAlerts } from '@/lib/alerts/overspend';

/* ------------------------------------------------------------------ */
/*  Helpers (mirrors budgetVsActual test helpers)                      */
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
const EXPENSE2 = makeAccount('acc-exp2', '2100', 'Utilities', 'expense');

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

/* ------------------------------------------------------------------ */
/*  Expense overspend                                                  */
/* ------------------------------------------------------------------ */

describe('detectOverspendAlerts - expense overspend', () => {
  it('triggers when actual exceeds budget by more than threshold amount', () => {
    const rows = buildRows(
      [EXPENSE],
      [makeBudgetLine(EXPENSE.id, { m01_pence: 10000 })],
      { [EXPENSE.id]: makeActuals({ m01_pence: 20000n }) },
    );

    const alerts = detectOverspendAlerts({
      rows,
      period: 'YTD',
      thresholdAmountPence: 5000n,
      thresholdPercent: 200, // very high so only amount triggers
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0].accountId).toBe(EXPENSE.id);
    expect(alerts[0].adverseVariancePence).toBe(10000n); // 20000 - 10000
    expect(alerts[0].accountType).toBe('expense');
  });

  it('triggers when percent exceeds threshold even if amount is below', () => {
    // Budget: 1000, Actual: 1500 → adverse = 500 (50%)
    const rows = buildRows(
      [EXPENSE],
      [makeBudgetLine(EXPENSE.id, { m03_pence: 1000 })],
      { [EXPENSE.id]: makeActuals({ m03_pence: 1500n }) },
    );

    const alerts = detectOverspendAlerts({
      rows,
      period: 'YTD',
      thresholdAmountPence: 100000n, // very high so only percent triggers
      thresholdPercent: 20, // 50% > 20%
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0].adverseVariancePct).toBeCloseTo(0.5);
  });

  it('does NOT trigger when expense is under budget (favourable)', () => {
    const rows = buildRows(
      [EXPENSE],
      [makeBudgetLine(EXPENSE.id, { m01_pence: 10000 })],
      { [EXPENSE.id]: makeActuals({ m01_pence: 5000n }) },
    );

    const alerts = detectOverspendAlerts({
      rows,
      period: 'YTD',
      thresholdAmountPence: 0n,
      thresholdPercent: 0,
    });

    expect(alerts).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Income underperformance                                            */
/* ------------------------------------------------------------------ */

describe('detectOverspendAlerts - income underperformance', () => {
  it('triggers when income actual is below budget by more than threshold', () => {
    // Budget: 50000, Actual: 30000 → adverse = 20000
    const rows = buildRows(
      [INCOME],
      [makeBudgetLine(INCOME.id, { m06_pence: 50000 })],
      { [INCOME.id]: makeActuals({ m06_pence: 30000n }) },
    );

    const alerts = detectOverspendAlerts({
      rows,
      period: 'YTD',
      thresholdAmountPence: 5000n,
      thresholdPercent: 200,
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0].accountId).toBe(INCOME.id);
    expect(alerts[0].adverseVariancePence).toBe(20000n);
    expect(alerts[0].accountType).toBe('income');
  });

  it('does NOT trigger when income exceeds budget (favourable)', () => {
    const rows = buildRows(
      [INCOME],
      [makeBudgetLine(INCOME.id, { m01_pence: 10000 })],
      { [INCOME.id]: makeActuals({ m01_pence: 15000n }) },
    );

    const alerts = detectOverspendAlerts({
      rows,
      period: 'YTD',
      thresholdAmountPence: 0n,
      thresholdPercent: 0,
    });

    expect(alerts).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Sorting                                                            */
/* ------------------------------------------------------------------ */

describe('detectOverspendAlerts - sorting', () => {
  it('sorts by adverseVariancePence descending (most severe first)', () => {
    const rows = buildRows(
      [EXPENSE, EXPENSE2],
      [
        makeBudgetLine(EXPENSE.id, { m01_pence: 10000 }),
        makeBudgetLine(EXPENSE2.id, { m01_pence: 5000 }),
      ],
      {
        [EXPENSE.id]: makeActuals({ m01_pence: 15000n }),   // adverse: 5000
        [EXPENSE2.id]: makeActuals({ m01_pence: 25000n }),  // adverse: 20000
      },
    );

    const alerts = detectOverspendAlerts({
      rows,
      period: 'YTD',
      thresholdAmountPence: 1000n,
      thresholdPercent: 200,
    });

    expect(alerts).toHaveLength(2);
    expect(alerts[0].accountId).toBe(EXPENSE2.id); // 20000 > 5000
    expect(alerts[1].accountId).toBe(EXPENSE.id);
  });
});

/* ------------------------------------------------------------------ */
/*  OR threshold logic                                                 */
/* ------------------------------------------------------------------ */

describe('detectOverspendAlerts - OR threshold logic', () => {
  it('triggers if EITHER amount OR percent threshold is exceeded', () => {
    // Budget: 100, Actual: 130 → adverse = 30 (30%)
    const rows = buildRows(
      [EXPENSE],
      [makeBudgetLine(EXPENSE.id, { m01_pence: 100 })],
      { [EXPENSE.id]: makeActuals({ m01_pence: 130n }) },
    );

    // Amount threshold: 50 (30 < 50 → false)
    // Percent threshold: 20% (30% > 20% → true)
    const alerts = detectOverspendAlerts({
      rows,
      period: 'YTD',
      thresholdAmountPence: 50n,
      thresholdPercent: 20,
    });

    expect(alerts).toHaveLength(1);
  });

  it('does not trigger if NEITHER threshold is exceeded', () => {
    // Budget: 10000, Actual: 10100 → adverse = 100 (1%)
    const rows = buildRows(
      [EXPENSE],
      [makeBudgetLine(EXPENSE.id, { m01_pence: 10000 })],
      { [EXPENSE.id]: makeActuals({ m01_pence: 10100n }) },
    );

    const alerts = detectOverspendAlerts({
      rows,
      period: 'YTD',
      thresholdAmountPence: 5000n, // 100 < 5000
      thresholdPercent: 20,         // 1% < 20%
    });

    expect(alerts).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/*  MTD period                                                         */
/* ------------------------------------------------------------------ */

describe('detectOverspendAlerts - MTD period', () => {
  it('uses the specified month cell for MTD', () => {
    // Only month 3 has overspend; YTD might be different
    const rows = buildRows(
      [EXPENSE],
      [makeBudgetLine(EXPENSE.id, { m03_pence: 1000, m04_pence: 5000 })],
      { [EXPENSE.id]: makeActuals({ m03_pence: 8000n, m04_pence: 2000n }) },
    );

    const alerts = detectOverspendAlerts({
      rows,
      period: 'MTD',
      monthIndex: 3,
      thresholdAmountPence: 1000n,
      thresholdPercent: 200,
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0].adverseVariancePence).toBe(7000n); // 8000 - 1000
  });
});

/* ------------------------------------------------------------------ */
/*  Edge cases                                                         */
/* ------------------------------------------------------------------ */

describe('detectOverspendAlerts - edge cases', () => {
  it('handles zero budget (variancePct null, amount check still applies)', () => {
    // Budget: 0, Actual: 6000 → adverse = 6000, pct = null
    const rows = buildRows(
      [EXPENSE],
      [], // no budget lines
      { [EXPENSE.id]: makeActuals({ m01_pence: 6000n }) },
    );

    const alerts = detectOverspendAlerts({
      rows,
      period: 'YTD',
      thresholdAmountPence: 5000n,
      thresholdPercent: 20,
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0].adverseVariancePct).toBeNull();
    expect(alerts[0].adverseVariancePence).toBe(6000n);
  });

  it('returns empty alerts for empty rows', () => {
    const alerts = detectOverspendAlerts({
      rows: [],
      period: 'YTD',
      thresholdAmountPence: 0n,
      thresholdPercent: 0,
    });

    expect(alerts).toHaveLength(0);
  });

  it('returns budget and actual in the alert object', () => {
    const rows = buildRows(
      [EXPENSE],
      [makeBudgetLine(EXPENSE.id, { m02_pence: 3000 })],
      { [EXPENSE.id]: makeActuals({ m02_pence: 9000n }) },
    );

    const alerts = detectOverspendAlerts({
      rows,
      period: 'YTD',
      thresholdAmountPence: 1000n,
      thresholdPercent: 200,
    });

    expect(alerts[0].budgetPence).toBe(3000n);
    expect(alerts[0].actualPence).toBe(9000n);
  });
});
