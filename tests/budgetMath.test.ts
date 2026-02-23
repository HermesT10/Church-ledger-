import { describe, it, expect } from 'vitest';
import {
  MONTH_KEYS,
  monthKeyFromIndex,
  sumMonths,
  setMonthAmount,
  computeRowTotals,
  computeColumnTotals,
  type BudgetLineRow,
} from '@/lib/budgets/budgetMath';
import {
  isBudgetableAccount,
  validateBudgetLines,
  type AccountRow,
} from '@/lib/budgets/budgetValidation';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Create a budget line with all months set to 0 by default. */
function makeLine(
  id: string,
  overrides: Partial<Record<string, bigint>> = {},
): BudgetLineRow {
  const base: BudgetLineRow = {
    id,
    m01_pence: 0n,
    m02_pence: 0n,
    m03_pence: 0n,
    m04_pence: 0n,
    m05_pence: 0n,
    m06_pence: 0n,
    m07_pence: 0n,
    m08_pence: 0n,
    m09_pence: 0n,
    m10_pence: 0n,
    m11_pence: 0n,
    m12_pence: 0n,
  };
  return { ...base, ...overrides } as BudgetLineRow;
}

/* ------------------------------------------------------------------ */
/*  monthKeyFromIndex                                                  */
/* ------------------------------------------------------------------ */

describe('monthKeyFromIndex', () => {
  it('returns m01_pence for month 1', () => {
    expect(monthKeyFromIndex(1)).toBe('m01_pence');
  });

  it('returns m06_pence for month 6', () => {
    expect(monthKeyFromIndex(6)).toBe('m06_pence');
  });

  it('returns m12_pence for month 12', () => {
    expect(monthKeyFromIndex(12)).toBe('m12_pence');
  });

  it('throws RangeError for month 0', () => {
    expect(() => monthKeyFromIndex(0)).toThrow(RangeError);
  });

  it('throws RangeError for month 13', () => {
    expect(() => monthKeyFromIndex(13)).toThrow(RangeError);
  });

  it('throws RangeError for non-integer', () => {
    expect(() => monthKeyFromIndex(1.5)).toThrow(RangeError);
  });
});

/* ------------------------------------------------------------------ */
/*  sumMonths                                                          */
/* ------------------------------------------------------------------ */

describe('sumMonths', () => {
  it('returns 0n for a line with all zeros', () => {
    const line = makeLine('a');
    expect(sumMonths(line)).toBe(0n);
  });

  it('sums all 12 months correctly', () => {
    const line = makeLine('a', {
      m01_pence: 100n,
      m02_pence: 200n,
      m03_pence: 300n,
      m04_pence: 400n,
      m05_pence: 500n,
      m06_pence: 600n,
      m07_pence: 700n,
      m08_pence: 800n,
      m09_pence: 900n,
      m10_pence: 1000n,
      m11_pence: 1100n,
      m12_pence: 1200n,
    });
    // 100+200+...+1200 = sum of arithmetic series = 12 * (100+1200)/2 = 7800
    expect(sumMonths(line)).toBe(7800n);
  });

  it('handles a mix of zero and non-zero months', () => {
    const line = makeLine('a', {
      m01_pence: 5000n,
      m06_pence: 3000n,
      m12_pence: 2000n,
    });
    expect(sumMonths(line)).toBe(10000n);
  });
});

/* ------------------------------------------------------------------ */
/*  setMonthAmount                                                     */
/* ------------------------------------------------------------------ */

describe('setMonthAmount', () => {
  it('updates the correct month', () => {
    const line = makeLine('a');
    const updated = setMonthAmount(line, 3, 5000n);
    expect(updated.m03_pence).toBe(5000n);
  });

  it('leaves other months unchanged', () => {
    const line = makeLine('a', { m01_pence: 100n, m02_pence: 200n });
    const updated = setMonthAmount(line, 3, 5000n);
    expect(updated.m01_pence).toBe(100n);
    expect(updated.m02_pence).toBe(200n);
    expect(updated.m04_pence).toBe(0n);
  });

  it('does not mutate the original line', () => {
    const line = makeLine('a');
    setMonthAmount(line, 1, 9999n);
    expect(line.m01_pence).toBe(0n);
  });

  it('updated line reflects in sumMonths', () => {
    const line = makeLine('a', { m01_pence: 1000n });
    const updated = setMonthAmount(line, 6, 2000n);
    expect(sumMonths(updated)).toBe(3000n);
  });
});

/* ------------------------------------------------------------------ */
/*  computeRowTotals                                                   */
/* ------------------------------------------------------------------ */

describe('computeRowTotals', () => {
  it('returns correct per-line totals', () => {
    const lines = [
      makeLine('line1', { m01_pence: 100n, m02_pence: 200n }),
      makeLine('line2', { m06_pence: 500n, m12_pence: 500n }),
    ];
    const totals = computeRowTotals(lines);
    expect(totals.get('line1')).toBe(300n);
    expect(totals.get('line2')).toBe(1000n);
  });

  it('returns empty map for empty input', () => {
    const totals = computeRowTotals([]);
    expect(totals.size).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  computeColumnTotals                                                */
/* ------------------------------------------------------------------ */

describe('computeColumnTotals', () => {
  it('returns 12 zeros for empty input', () => {
    const totals = computeColumnTotals([]);
    expect(totals).toHaveLength(12);
    expect(totals.every((v) => v === 0n)).toBe(true);
  });

  it('sums each month across multiple lines', () => {
    const lines = [
      makeLine('a', { m01_pence: 100n, m02_pence: 200n, m03_pence: 300n }),
      makeLine('b', { m01_pence: 400n, m02_pence: 500n, m03_pence: 600n }),
    ];
    const totals = computeColumnTotals(lines);
    expect(totals[0]).toBe(500n); // m01: 100 + 400
    expect(totals[1]).toBe(700n); // m02: 200 + 500
    expect(totals[2]).toBe(900n); // m03: 300 + 600
    // Remaining months should be 0
    for (let i = 3; i < 12; i++) {
      expect(totals[i]).toBe(0n);
    }
  });

  it('returns correct totals after setMonthAmount', () => {
    const lineA = makeLine('a', { m01_pence: 100n });
    const lineB = setMonthAmount(makeLine('b'), 1, 250n);
    const totals = computeColumnTotals([lineA, lineB]);
    expect(totals[0]).toBe(350n);
  });
});

/* ------------------------------------------------------------------ */
/*  MONTH_KEYS sanity                                                  */
/* ------------------------------------------------------------------ */

describe('MONTH_KEYS', () => {
  it('has exactly 12 entries', () => {
    expect(MONTH_KEYS).toHaveLength(12);
  });

  it('first key is m01_pence and last is m12_pence', () => {
    expect(MONTH_KEYS[0]).toBe('m01_pence');
    expect(MONTH_KEYS[11]).toBe('m12_pence');
  });
});

/* ------------------------------------------------------------------ */
/*  isBudgetableAccount                                                */
/* ------------------------------------------------------------------ */

describe('isBudgetableAccount', () => {
  it('returns true for income accounts', () => {
    expect(isBudgetableAccount({ id: '1', name: 'Donations', type: 'income' })).toBe(true);
  });

  it('returns true for expense accounts', () => {
    expect(isBudgetableAccount({ id: '2', name: 'Salaries', type: 'expense' })).toBe(true);
  });

  it('returns false for asset accounts', () => {
    expect(isBudgetableAccount({ id: '3', name: 'Bank', type: 'asset' })).toBe(false);
  });

  it('returns false for liability accounts', () => {
    expect(isBudgetableAccount({ id: '4', name: 'Creditors', type: 'liability' })).toBe(false);
  });

  it('returns false for equity accounts', () => {
    expect(isBudgetableAccount({ id: '5', name: 'Reserves', type: 'equity' })).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  validateBudgetLines                                                */
/* ------------------------------------------------------------------ */

describe('validateBudgetLines', () => {
  const accounts: AccountRow[] = [
    { id: 'acc-income', name: 'Donations', type: 'income' },
    { id: 'acc-expense', name: 'Salaries', type: 'expense' },
    { id: 'acc-asset', name: 'Bank Account', type: 'asset' },
    { id: 'acc-liability', name: 'Creditors', type: 'liability' },
    { id: 'acc-equity', name: 'Reserves', type: 'equity' },
  ];

  it('returns no errors for income and expense lines', () => {
    const lines = [
      { account_id: 'acc-income' },
      { account_id: 'acc-expense' },
    ];
    expect(validateBudgetLines(accounts, lines)).toEqual([]);
  });

  it('returns errors for asset account lines', () => {
    const lines = [{ account_id: 'acc-asset' }];
    const errors = validateBudgetLines(accounts, lines);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Bank Account');
    expect(errors[0]).toContain('asset');
    expect(errors[0]).toContain('not budgetable');
  });

  it('returns errors for liability and equity lines', () => {
    const lines = [
      { account_id: 'acc-liability' },
      { account_id: 'acc-equity' },
    ];
    const errors = validateBudgetLines(accounts, lines);
    expect(errors).toHaveLength(2);
  });

  it('returns error for unknown account_id', () => {
    const lines = [{ account_id: 'nonexistent' }];
    const errors = validateBudgetLines(accounts, lines);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('not found');
  });

  it('reports correct line numbers (1-based)', () => {
    const lines = [
      { account_id: 'acc-income' },   // line 1: ok
      { account_id: 'acc-asset' },     // line 2: error
      { account_id: 'acc-expense' },   // line 3: ok
      { account_id: 'acc-equity' },    // line 4: error
    ];
    const errors = validateBudgetLines(accounts, lines);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('Line 2');
    expect(errors[1]).toContain('Line 4');
  });
});
