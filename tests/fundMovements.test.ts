import { describe, it, expect } from 'vitest';
import {
  buildFundMovementsReport,
  UNALLOCATED_FUND_ID,
  type FMFundRef,
  type FMRawLine,
} from '@/lib/reports/fundMovements';

/* ------------------------------------------------------------------ */
/*  Factory helpers                                                    */
/* ------------------------------------------------------------------ */

function makeFund(id: string, name: string, type: string): FMFundRef {
  return { id, name, type };
}

function makeLine(
  fund_id: string | null,
  account_type: 'income' | 'expense',
  debit: number,
  credit: number,
  journal_date: string,
): FMRawLine {
  return { fund_id, account_type, debit_pence: debit, credit_pence: credit, journal_date };
}

const GENERAL = makeFund('f1', 'General Fund', 'unrestricted');
const BUILDING = makeFund('f2', 'Building Project', 'restricted');
const YOUTH = makeFund('f3', 'Youth', 'designated');

/* ------------------------------------------------------------------ */
/*  1. Period boundaries correct                                       */
/* ------------------------------------------------------------------ */

describe('buildFundMovementsReport - period boundaries', () => {
  it('opening balance uses lines before startDate; period uses lines within [start, end]', () => {
    const lines = [
      // Before period (2025): income 5000, expense 2000 for General
      makeLine('f1', 'income', 0, 5000, '2025-11-15'),
      makeLine('f1', 'expense', 2000, 0, '2025-12-01'),

      // Within period (Jan 2026): income 3000, expense 1000
      makeLine('f1', 'income', 0, 3000, '2026-01-10'),
      makeLine('f1', 'expense', 1000, 0, '2026-01-20'),

      // After period end -- should be ignored
      makeLine('f1', 'income', 0, 9999, '2026-02-01'),
    ];

    const report = buildFundMovementsReport({
      funds: [GENERAL],
      lines,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      year: 2026,
      month: 1,
    });

    const row = report.funds[0];
    // Opening: income 5000 - expense 2000 = 3000
    expect(row.openingBalancePence).toBe(3000n);
    // Period income: 3000
    expect(row.incomePence).toBe(3000n);
    // Period expenditure: 1000
    expect(row.expenditurePence).toBe(1000n);
    // The Feb line should NOT be included
    expect(row.closingBalancePence).toBe(3000n + 3000n - 1000n); // 5000
  });

  it('line on startDate is within period, line on day before is opening', () => {
    const lines = [
      makeLine('f1', 'income', 0, 1000, '2025-12-31'), // before
      makeLine('f1', 'income', 0, 2000, '2026-01-01'), // within (on start)
      makeLine('f1', 'income', 0, 3000, '2026-01-31'), // within (on end)
    ];

    const report = buildFundMovementsReport({
      funds: [GENERAL],
      lines,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      year: 2026,
      month: 1,
    });

    const row = report.funds[0];
    expect(row.openingBalancePence).toBe(1000n);
    expect(row.incomePence).toBe(5000n); // 2000 + 3000
  });
});

/* ------------------------------------------------------------------ */
/*  2. Closing = opening + income - expenditure                        */
/* ------------------------------------------------------------------ */

describe('buildFundMovementsReport - closing identity', () => {
  it('closing = opening + income - expenditure for each fund', () => {
    const lines = [
      // General Fund: opening history
      makeLine('f1', 'income', 0, 10000, '2025-06-01'),
      makeLine('f1', 'expense', 4000, 0, '2025-09-01'),
      // General Fund: period activity
      makeLine('f1', 'income', 0, 3000, '2026-03-15'),
      makeLine('f1', 'expense', 1500, 0, '2026-03-20'),

      // Building Fund: opening history
      makeLine('f2', 'income', 0, 20000, '2025-01-01'),
      makeLine('f2', 'expense', 5000, 0, '2025-07-01'),
      // Building Fund: period activity
      makeLine('f2', 'income', 0, 8000, '2026-03-10'),
      makeLine('f2', 'expense', 12000, 0, '2026-03-25'),
    ];

    const report = buildFundMovementsReport({
      funds: [GENERAL, BUILDING],
      lines,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      year: 2026,
    });

    for (const row of report.funds) {
      expect(row.closingBalancePence).toBe(
        row.openingBalancePence + row.incomePence - row.expenditurePence,
      );
      expect(row.netMovementPence).toBe(row.incomePence - row.expenditurePence);
    }

    // Verify specific values for General
    const gen = report.funds.find((r) => r.fundId === 'f1')!;
    expect(gen.openingBalancePence).toBe(6000n); // 10000 - 4000
    expect(gen.incomePence).toBe(3000n);
    expect(gen.expenditurePence).toBe(1500n);
    expect(gen.closingBalancePence).toBe(7500n); // 6000 + 3000 - 1500

    // Verify specific values for Building
    const bld = report.funds.find((r) => r.fundId === 'f2')!;
    expect(bld.openingBalancePence).toBe(15000n); // 20000 - 5000
    expect(bld.incomePence).toBe(8000n);
    expect(bld.expenditurePence).toBe(12000n);
    expect(bld.closingBalancePence).toBe(11000n); // 15000 + 8000 - 12000
  });
});

/* ------------------------------------------------------------------ */
/*  3. Fund filtering (via different inputs)                           */
/* ------------------------------------------------------------------ */

describe('buildFundMovementsReport - fund filtering', () => {
  it('only produces rows for provided funds + unallocated if present', () => {
    const lines = [
      makeLine('f1', 'income', 0, 5000, '2026-02-01'),
      makeLine('f2', 'income', 0, 3000, '2026-02-01'),
      makeLine('f3', 'income', 0, 1000, '2026-02-01'),
    ];

    // Only pass General fund -- simulates server-side filter
    const report = buildFundMovementsReport({
      funds: [GENERAL],
      lines,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      year: 2026,
    });

    // Only General row should appear (f2/f3 lines are still processed
    // but have no corresponding fund row -- they end up "orphaned")
    expect(report.funds).toHaveLength(1);
    expect(report.funds[0].fundId).toBe('f1');
    expect(report.funds[0].incomePence).toBe(5000n);
  });
});

/* ------------------------------------------------------------------ */
/*  4. NULL fund_id mapped to Unallocated                              */
/* ------------------------------------------------------------------ */

describe('buildFundMovementsReport - unallocated fund', () => {
  it('lines with null fund_id appear in __unallocated__ row', () => {
    const lines = [
      makeLine(null, 'income', 0, 7000, '2026-04-01'),
      makeLine(null, 'expense', 2000, 0, '2026-04-15'),
      makeLine('f1', 'income', 0, 1000, '2026-04-01'),
    ];

    const report = buildFundMovementsReport({
      funds: [GENERAL],
      lines,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      year: 2026,
    });

    // Should have General + Unallocated
    expect(report.funds).toHaveLength(2);

    const unalloc = report.funds.find((r) => r.fundId === UNALLOCATED_FUND_ID)!;
    expect(unalloc).toBeDefined();
    expect(unalloc.fundName).toBe('Unallocated');
    expect(unalloc.incomePence).toBe(7000n);
    expect(unalloc.expenditurePence).toBe(2000n);
    expect(unalloc.closingBalancePence).toBe(5000n);
  });

  it('no unallocated row when all lines have fund_id', () => {
    const lines = [
      makeLine('f1', 'income', 0, 1000, '2026-05-01'),
    ];

    const report = buildFundMovementsReport({
      funds: [GENERAL],
      lines,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      year: 2026,
    });

    expect(report.funds).toHaveLength(1);
    expect(report.funds[0].fundId).toBe('f1');
  });
});

/* ------------------------------------------------------------------ */
/*  5. Totals tie out                                                  */
/* ------------------------------------------------------------------ */

describe('buildFundMovementsReport - totals', () => {
  it('totals equal sum across all fund rows', () => {
    const lines = [
      // Opening
      makeLine('f1', 'income', 0, 10000, '2025-06-01'),
      makeLine('f2', 'income', 0, 5000, '2025-06-01'),
      // Period
      makeLine('f1', 'income', 0, 3000, '2026-03-01'),
      makeLine('f1', 'expense', 1000, 0, '2026-03-15'),
      makeLine('f2', 'income', 0, 2000, '2026-04-01'),
      makeLine('f2', 'expense', 4000, 0, '2026-04-15'),
      makeLine('f3', 'expense', 500, 0, '2026-05-01'),
    ];

    const report = buildFundMovementsReport({
      funds: [GENERAL, BUILDING, YOUTH],
      lines,
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      year: 2026,
    });

    const sumField = (field: 'openingBalancePence' | 'incomePence' | 'expenditurePence' | 'netMovementPence' | 'closingBalancePence') =>
      report.funds.reduce((s, r) => s + r[field], 0n);

    expect(report.totals.openingBalancePence).toBe(sumField('openingBalancePence'));
    expect(report.totals.incomePence).toBe(sumField('incomePence'));
    expect(report.totals.expenditurePence).toBe(sumField('expenditurePence'));
    expect(report.totals.netMovementPence).toBe(sumField('netMovementPence'));
    expect(report.totals.closingBalancePence).toBe(sumField('closingBalancePence'));

    // Also verify the closing identity on totals
    expect(report.totals.closingBalancePence).toBe(
      report.totals.openingBalancePence + report.totals.incomePence - report.totals.expenditurePence,
    );
  });
});

/* ------------------------------------------------------------------ */
/*  6. Empty data                                                      */
/* ------------------------------------------------------------------ */

describe('buildFundMovementsReport - empty data', () => {
  it('no lines produces all-zero rows for each fund', () => {
    const report = buildFundMovementsReport({
      funds: [GENERAL, BUILDING],
      lines: [],
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      year: 2026,
    });

    expect(report.funds).toHaveLength(2);
    for (const row of report.funds) {
      expect(row.openingBalancePence).toBe(0n);
      expect(row.incomePence).toBe(0n);
      expect(row.expenditurePence).toBe(0n);
      expect(row.netMovementPence).toBe(0n);
      expect(row.closingBalancePence).toBe(0n);
    }

    expect(report.totals.closingBalancePence).toBe(0n);
  });

  it('no funds and no lines produces empty report', () => {
    const report = buildFundMovementsReport({
      funds: [],
      lines: [],
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      year: 2026,
    });

    expect(report.funds).toHaveLength(0);
    expect(report.totals.closingBalancePence).toBe(0n);
  });
});
