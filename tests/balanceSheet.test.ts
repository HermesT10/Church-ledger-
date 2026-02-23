import { describe, it, expect } from 'vitest';
import {
  buildBalanceSheetReport,
  type BSAccountRef,
  type BSRawLine,
} from '@/lib/reports/balanceSheet';

/* ------------------------------------------------------------------ */
/*  Factory helpers                                                    */
/* ------------------------------------------------------------------ */

function makeAccount(id: string, code: string, name: string, type: string): BSAccountRef {
  return { id, code, name, type };
}

function makeLine(account_id: string, debit: number, credit: number): BSRawLine {
  return { account_id, debit_pence: debit, credit_pence: credit };
}

const ASSET1 = makeAccount('a1', 'AST-001', 'Bank Account 1', 'asset');
const ASSET2 = makeAccount('a2', 'AST-002', 'Bank Account 2', 'asset');
const LIAB1 = makeAccount('l1', 'LIA-001', 'Creditors', 'liability');
const EQUITY1 = makeAccount('e1', 'EQU-001', 'General Reserves', 'equity');
const EQUITY2 = makeAccount('e2', 'EQU-002', 'Restricted Reserves', 'equity');

const AS_OF = '2026-06-30';

/* ------------------------------------------------------------------ */
/*  1. Debits/credits polarity correct per type                        */
/* ------------------------------------------------------------------ */

describe('buildBalanceSheetReport - polarity', () => {
  it('asset balance = debit - credit', () => {
    const lines = [
      makeLine('a1', 10000, 3000), // debit 100.00, credit 30.00
    ];

    const report = buildBalanceSheetReport({
      accounts: [ASSET1],
      lines,
      asOfDate: AS_OF,
    });

    expect(report.sections.assets.rows[0].balance).toBe(7000n); // 10000 - 3000
  });

  it('liability balance = credit - debit', () => {
    const lines = [
      makeLine('l1', 2000, 8000),
    ];

    const report = buildBalanceSheetReport({
      accounts: [LIAB1],
      lines,
      asOfDate: AS_OF,
    });

    expect(report.sections.liabilities.rows[0].balance).toBe(6000n); // 8000 - 2000
  });

  it('equity balance = credit - debit', () => {
    const lines = [
      makeLine('e1', 1000, 5000),
    ];

    const report = buildBalanceSheetReport({
      accounts: [EQUITY1],
      lines,
      asOfDate: AS_OF,
    });

    expect(report.sections.equity.rows[0].balance).toBe(4000n); // 5000 - 1000
  });
});

/* ------------------------------------------------------------------ */
/*  2. Balances check passes (A = L + E)                               */
/* ------------------------------------------------------------------ */

describe('buildBalanceSheetReport - balances check passes', () => {
  it('check.balances is true when A = L + E', () => {
    // Asset: debit 20000  => balance 20000
    // Liability: credit 8000 => balance 8000
    // Equity: credit 12000 => balance 12000
    // 20000 = 8000 + 12000 ✓
    const lines = [
      makeLine('a1', 20000, 0),
      makeLine('l1', 0, 8000),
      makeLine('e1', 0, 12000),
    ];

    const report = buildBalanceSheetReport({
      accounts: [ASSET1, LIAB1, EQUITY1],
      lines,
      asOfDate: AS_OF,
    });

    expect(report.sections.assets.total).toBe(20000n);
    expect(report.sections.liabilities.total).toBe(8000n);
    expect(report.sections.equity.total).toBe(12000n);
    expect(report.check.balances).toBe(true);
    expect(report.check.difference).toBe(0n);
  });
});

/* ------------------------------------------------------------------ */
/*  3. Balances check fails (A != L + E)                               */
/* ------------------------------------------------------------------ */

describe('buildBalanceSheetReport - balances check fails', () => {
  it('check.balances is false when A != L + E', () => {
    // Asset: 15000, Liability: 8000, Equity: 5000
    // 15000 != 8000 + 5000 = 13000, difference = 2000
    const lines = [
      makeLine('a1', 15000, 0),
      makeLine('l1', 0, 8000),
      makeLine('e1', 0, 5000),
    ];

    const report = buildBalanceSheetReport({
      accounts: [ASSET1, LIAB1, EQUITY1],
      lines,
      asOfDate: AS_OF,
    });

    expect(report.check.balances).toBe(false);
    expect(report.check.difference).toBe(2000n); // 15000 - (8000 + 5000)
  });
});

/* ------------------------------------------------------------------ */
/*  4. Fund filter works (via different line inputs)                   */
/* ------------------------------------------------------------------ */

describe('buildBalanceSheetReport - fund filter', () => {
  it('processes whatever lines it receives (simulating fund-filtered data)', () => {
    // Only lines for a specific fund are provided (server-side filtering)
    const fundLines = [
      makeLine('a1', 5000, 0),
      makeLine('e1', 0, 5000),
    ];

    const report = buildBalanceSheetReport({
      accounts: [ASSET1, ASSET2, LIAB1, EQUITY1],
      lines: fundLines,
      asOfDate: AS_OF,
    });

    // ASSET1 has balance 5000, ASSET2 has 0
    expect(report.sections.assets.rows[0].balance).toBe(5000n);
    expect(report.sections.assets.rows[1].balance).toBe(0n);
    // LIAB1 has 0
    expect(report.sections.liabilities.rows[0].balance).toBe(0n);
    // EQUITY1 has 5000
    expect(report.sections.equity.rows[0].balance).toBe(5000n);

    expect(report.check.balances).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  5. Totals tie out                                                  */
/* ------------------------------------------------------------------ */

describe('buildBalanceSheetReport - totals tie out', () => {
  it('section totals equal sum of rows; netAssets = assets - liabilities', () => {
    const lines = [
      makeLine('a1', 10000, 0),
      makeLine('a2', 6000, 1000),
      makeLine('l1', 500, 3000),
      makeLine('e1', 0, 8000),
      makeLine('e2', 200, 4700),
    ];

    const report = buildBalanceSheetReport({
      accounts: [ASSET1, ASSET2, LIAB1, EQUITY1, EQUITY2],
      lines,
      asOfDate: AS_OF,
    });

    // Asset totals: a1=10000, a2=6000-1000=5000 => 15000
    const assetRowSum = report.sections.assets.rows.reduce((s, r) => s + r.balance, 0n);
    expect(report.sections.assets.total).toBe(assetRowSum);
    expect(report.sections.assets.total).toBe(15000n);

    // Liability totals: l1=3000-500=2500
    const liabRowSum = report.sections.liabilities.rows.reduce((s, r) => s + r.balance, 0n);
    expect(report.sections.liabilities.total).toBe(liabRowSum);
    expect(report.sections.liabilities.total).toBe(2500n);

    // Equity totals: e1=8000, e2=4700-200=4500 => 12500
    const equityRowSum = report.sections.equity.rows.reduce((s, r) => s + r.balance, 0n);
    expect(report.sections.equity.total).toBe(equityRowSum);
    expect(report.sections.equity.total).toBe(12500n);

    // Net assets = assets - liabilities = 15000 - 2500 = 12500
    expect(report.netAssets).toBe(15000n - 2500n);
    expect(report.netAssets).toBe(12500n);

    // Check: 15000 = 2500 + 12500 = 15000 ✓
    expect(report.check.balances).toBe(true);
    expect(report.check.difference).toBe(0n);
  });
});

/* ------------------------------------------------------------------ */
/*  6. Empty lines                                                     */
/* ------------------------------------------------------------------ */

describe('buildBalanceSheetReport - empty lines', () => {
  it('accounts with no journal lines produce 0n balance rows', () => {
    const report = buildBalanceSheetReport({
      accounts: [ASSET1, LIAB1, EQUITY1],
      lines: [],
      asOfDate: AS_OF,
    });

    expect(report.sections.assets.rows[0].balance).toBe(0n);
    expect(report.sections.liabilities.rows[0].balance).toBe(0n);
    expect(report.sections.equity.rows[0].balance).toBe(0n);
    expect(report.sections.assets.total).toBe(0n);
    expect(report.sections.liabilities.total).toBe(0n);
    expect(report.sections.equity.total).toBe(0n);
    expect(report.netAssets).toBe(0n);
    expect(report.check.balances).toBe(true);
    expect(report.check.difference).toBe(0n);
  });

  it('handles empty accounts list', () => {
    const report = buildBalanceSheetReport({
      accounts: [],
      lines: [],
      asOfDate: AS_OF,
    });

    expect(report.sections.assets.rows).toHaveLength(0);
    expect(report.sections.liabilities.rows).toHaveLength(0);
    expect(report.sections.equity.rows).toHaveLength(0);
    expect(report.check.balances).toBe(true);
  });

  it('multiple lines for same account are aggregated', () => {
    const lines = [
      makeLine('a1', 5000, 0),
      makeLine('a1', 3000, 0),
      makeLine('a1', 0, 1000),
    ];

    const report = buildBalanceSheetReport({
      accounts: [ASSET1],
      lines,
      asOfDate: AS_OF,
    });

    // 5000 + 3000 - 1000 = 7000
    expect(report.sections.assets.rows[0].balance).toBe(7000n);
  });
});
