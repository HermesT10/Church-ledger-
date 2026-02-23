import { describe, it, expect } from 'vitest';
import {
  aggregateActuals,
  type RawJournalLine,
  type ActualsMap,
} from '@/lib/reports/actuals';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeLine(overrides: Partial<RawJournalLine> & { account_id: string; journal_date: string }): RawJournalLine {
  return {
    fund_id: null,
    debit_pence: 0,
    credit_pence: 0,
    ...overrides,
  };
}

const INCOME_ACCOUNT = 'acc-income';
const EXPENSE_ACCOUNT = 'acc-expense';
const ASSET_ACCOUNT = 'acc-asset';

const accountTypes: Record<string, string> = {
  [INCOME_ACCOUNT]: 'income',
  [EXPENSE_ACCOUNT]: 'expense',
  [ASSET_ACCOUNT]: 'asset',
};

/* ------------------------------------------------------------------ */
/*  Sign conventions                                                   */
/* ------------------------------------------------------------------ */

describe('aggregateActuals - sign conventions', () => {
  it('income account: credit produces positive net', () => {
    const lines = [
      makeLine({
        account_id: INCOME_ACCOUNT,
        journal_date: '2026-01-15',
        credit_pence: 5000,
        debit_pence: 0,
      }),
    ];
    const result = aggregateActuals(lines, accountTypes);
    expect(result[INCOME_ACCOUNT].m01_pence).toBe(5000n);
  });

  it('income account: debit produces negative net', () => {
    const lines = [
      makeLine({
        account_id: INCOME_ACCOUNT,
        journal_date: '2026-02-10',
        credit_pence: 0,
        debit_pence: 3000,
      }),
    ];
    const result = aggregateActuals(lines, accountTypes);
    expect(result[INCOME_ACCOUNT].m02_pence).toBe(-3000n);
  });

  it('expense account: debit produces positive net', () => {
    const lines = [
      makeLine({
        account_id: EXPENSE_ACCOUNT,
        journal_date: '2026-03-20',
        debit_pence: 7500,
        credit_pence: 0,
      }),
    ];
    const result = aggregateActuals(lines, accountTypes);
    expect(result[EXPENSE_ACCOUNT].m03_pence).toBe(7500n);
  });

  it('expense account: credit produces negative net', () => {
    const lines = [
      makeLine({
        account_id: EXPENSE_ACCOUNT,
        journal_date: '2026-04-05',
        debit_pence: 0,
        credit_pence: 2000,
      }),
    ];
    const result = aggregateActuals(lines, accountTypes);
    expect(result[EXPENSE_ACCOUNT].m04_pence).toBe(-2000n);
  });
});

/* ------------------------------------------------------------------ */
/*  Monthly aggregation                                                */
/* ------------------------------------------------------------------ */

describe('aggregateActuals - monthly aggregation', () => {
  it('sums multiple lines in the same month', () => {
    const lines = [
      makeLine({
        account_id: INCOME_ACCOUNT,
        journal_date: '2026-06-01',
        credit_pence: 1000,
      }),
      makeLine({
        account_id: INCOME_ACCOUNT,
        journal_date: '2026-06-15',
        credit_pence: 2500,
      }),
      makeLine({
        account_id: INCOME_ACCOUNT,
        journal_date: '2026-06-28',
        credit_pence: 500,
      }),
    ];
    const result = aggregateActuals(lines, accountTypes);
    expect(result[INCOME_ACCOUNT].m06_pence).toBe(4000n);
  });

  it('places lines in correct months', () => {
    const lines = [
      makeLine({
        account_id: EXPENSE_ACCOUNT,
        journal_date: '2026-01-10',
        debit_pence: 100,
      }),
      makeLine({
        account_id: EXPENSE_ACCOUNT,
        journal_date: '2026-07-20',
        debit_pence: 200,
      }),
      makeLine({
        account_id: EXPENSE_ACCOUNT,
        journal_date: '2026-12-31',
        debit_pence: 300,
      }),
    ];
    const result = aggregateActuals(lines, accountTypes);
    expect(result[EXPENSE_ACCOUNT].m01_pence).toBe(100n);
    expect(result[EXPENSE_ACCOUNT].m07_pence).toBe(200n);
    expect(result[EXPENSE_ACCOUNT].m12_pence).toBe(300n);
    // Other months should be 0
    expect(result[EXPENSE_ACCOUNT].m02_pence).toBe(0n);
    expect(result[EXPENSE_ACCOUNT].m06_pence).toBe(0n);
  });
});

/* ------------------------------------------------------------------ */
/*  YTD                                                                */
/* ------------------------------------------------------------------ */

describe('aggregateActuals - YTD', () => {
  it('computes ytd as sum of all 12 months', () => {
    const lines = [
      makeLine({
        account_id: INCOME_ACCOUNT,
        journal_date: '2026-01-15',
        credit_pence: 1000,
      }),
      makeLine({
        account_id: INCOME_ACCOUNT,
        journal_date: '2026-06-15',
        credit_pence: 2000,
      }),
      makeLine({
        account_id: INCOME_ACCOUNT,
        journal_date: '2026-12-15',
        credit_pence: 3000,
      }),
    ];
    const result = aggregateActuals(lines, accountTypes);
    expect(result[INCOME_ACCOUNT].ytd_pence).toBe(6000n);
  });

  it('ytd accounts for negative entries', () => {
    const lines = [
      makeLine({
        account_id: INCOME_ACCOUNT,
        journal_date: '2026-03-01',
        credit_pence: 5000,
      }),
      makeLine({
        account_id: INCOME_ACCOUNT,
        journal_date: '2026-09-01',
        debit_pence: 2000, // reversal
      }),
    ];
    const result = aggregateActuals(lines, accountTypes);
    expect(result[INCOME_ACCOUNT].m03_pence).toBe(5000n);
    expect(result[INCOME_ACCOUNT].m09_pence).toBe(-2000n);
    expect(result[INCOME_ACCOUNT].ytd_pence).toBe(3000n);
  });
});

/* ------------------------------------------------------------------ */
/*  Mixed accounts                                                     */
/* ------------------------------------------------------------------ */

describe('aggregateActuals - mixed accounts', () => {
  it('handles income and expense accounts in same dataset', () => {
    const lines = [
      makeLine({
        account_id: INCOME_ACCOUNT,
        journal_date: '2026-05-10',
        credit_pence: 10000,
      }),
      makeLine({
        account_id: EXPENSE_ACCOUNT,
        journal_date: '2026-05-10',
        debit_pence: 4000,
      }),
    ];
    const result = aggregateActuals(lines, accountTypes);
    expect(result[INCOME_ACCOUNT].m05_pence).toBe(10000n);
    expect(result[EXPENSE_ACCOUNT].m05_pence).toBe(4000n);
    expect(result[INCOME_ACCOUNT].ytd_pence).toBe(10000n);
    expect(result[EXPENSE_ACCOUNT].ytd_pence).toBe(4000n);
  });
});

/* ------------------------------------------------------------------ */
/*  Edge cases                                                         */
/* ------------------------------------------------------------------ */

describe('aggregateActuals - edge cases', () => {
  it('returns empty map for empty input', () => {
    const result = aggregateActuals([], accountTypes);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('skips lines with unknown account_id', () => {
    const lines = [
      makeLine({
        account_id: 'unknown-id',
        journal_date: '2026-01-01',
        credit_pence: 9999,
      }),
    ];
    const result = aggregateActuals(lines, accountTypes);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('skips non-budgetable account types (asset, liability, equity)', () => {
    const lines = [
      makeLine({
        account_id: ASSET_ACCOUNT,
        journal_date: '2026-01-01',
        debit_pence: 5000,
      }),
    ];
    const result = aggregateActuals(lines, accountTypes);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('untouched months are zero', () => {
    const lines = [
      makeLine({
        account_id: INCOME_ACCOUNT,
        journal_date: '2026-08-15',
        credit_pence: 1234,
      }),
    ];
    const result = aggregateActuals(lines, accountTypes);
    expect(result[INCOME_ACCOUNT].m01_pence).toBe(0n);
    expect(result[INCOME_ACCOUNT].m07_pence).toBe(0n);
    expect(result[INCOME_ACCOUNT].m08_pence).toBe(1234n);
    expect(result[INCOME_ACCOUNT].m09_pence).toBe(0n);
    expect(result[INCOME_ACCOUNT].m12_pence).toBe(0n);
  });
});
