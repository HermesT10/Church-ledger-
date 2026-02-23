import { describe, it, expect } from 'vitest';
import {
  parseMoneyToPence,
  parseDate,
  fingerprintGivingRow,
  validateGivingRow,
  normalizeText,
  importHashFromCsv,
} from '../src/lib/giving/importUtils';
import {
  groupRowsByDate,
  buildDonationJournalLines,
  buildJournalSpecs,
  buildPayoutJournalLines,
  groupPayoutRows,
  buildPayoutJournalSpecs,
  isJournalBalanced,
} from '../src/lib/giving/journalBuilder';
import { detectColumns, mapRow } from '../src/lib/giving/providers/gocardless';
import { detectColumns as detectSumup, mapRow as mapSumup } from '../src/lib/giving/providers/sumup';
import { detectColumns as detectIzettle, mapRow as mapIzettle } from '../src/lib/giving/providers/izettle';
import type { NormalizedRow } from '../src/lib/giving/types';

/* ================================================================== */
/*  Money Parsing                                                      */
/* ================================================================== */

describe('parseMoneyToPence', () => {
  it('parses simple pounds string', () => {
    expect(parseMoneyToPence('12.50')).toBe(1250n);
  });

  it('parses string with £ sign', () => {
    expect(parseMoneyToPence('£99.99')).toBe(9999n);
  });

  it('parses string with commas', () => {
    expect(parseMoneyToPence('1,234.56')).toBe(123456n);
  });

  it('parses negative amount', () => {
    expect(parseMoneyToPence('-5.00')).toBe(-500n);
  });

  it('parses parenthesised negative', () => {
    expect(parseMoneyToPence('(10.00)')).toBe(-1000n);
  });

  it('returns 0n for empty string', () => {
    expect(parseMoneyToPence('')).toBe(0n);
  });

  it('returns 0n for non-numeric', () => {
    expect(parseMoneyToPence('abc')).toBe(0n);
  });

  it('parses number input', () => {
    expect(parseMoneyToPence(42.5)).toBe(4250n);
  });
});

/* ================================================================== */
/*  Date Parsing                                                       */
/* ================================================================== */

describe('parseDate', () => {
  it('parses ISO date', () => {
    expect(parseDate('2026-01-15')).toBe('2026-01-15');
  });

  it('parses UK date DD/MM/YYYY', () => {
    expect(parseDate('15/01/2026')).toBe('2026-01-15');
  });

  it('parses UK date DD-MM-YYYY', () => {
    expect(parseDate('15-01-2026')).toBe('2026-01-15');
  });

  it('parses UK date DD.MM.YYYY', () => {
    expect(parseDate('15.01.2026')).toBe('2026-01-15');
  });

  it('returns null for empty', () => {
    expect(parseDate('')).toBeNull();
  });

  it('returns null for null', () => {
    expect(parseDate(null)).toBeNull();
  });

  it('returns null for garbage', () => {
    expect(parseDate('not-a-date')).toBeNull();
  });
});

/* ================================================================== */
/*  Fingerprinting                                                     */
/* ================================================================== */

describe('fingerprintGivingRow', () => {
  it('generates consistent SHA-256 hash', () => {
    const fp1 = fingerprintGivingRow({
      provider: 'gocardless',
      txn_date: '2026-01-15',
      gross_amount_pence: 1000,
      fee_amount_pence: 20,
      reference: 'PAY-123',
    });
    const fp2 = fingerprintGivingRow({
      provider: 'gocardless',
      txn_date: '2026-01-15',
      gross_amount_pence: 1000,
      fee_amount_pence: 20,
      reference: 'PAY-123',
    });
    expect(fp1).toBe(fp2);
    expect(fp1).toHaveLength(64); // SHA-256 hex
  });

  it('produces different hashes for different data', () => {
    const fp1 = fingerprintGivingRow({
      provider: 'gocardless',
      txn_date: '2026-01-15',
      gross_amount_pence: 1000,
      fee_amount_pence: 20,
      reference: 'PAY-123',
    });
    const fp2 = fingerprintGivingRow({
      provider: 'gocardless',
      txn_date: '2026-01-16',
      gross_amount_pence: 1000,
      fee_amount_pence: 20,
      reference: 'PAY-123',
    });
    expect(fp1).not.toBe(fp2);
  });

  it('different providers produce different fingerprints', () => {
    const fp1 = fingerprintGivingRow({
      provider: 'gocardless',
      txn_date: '2026-01-15',
      gross_amount_pence: 1000,
      fee_amount_pence: 20,
      reference: 'PAY-123',
    });
    const fp2 = fingerprintGivingRow({
      provider: 'sumup',
      txn_date: '2026-01-15',
      gross_amount_pence: 1000,
      fee_amount_pence: 20,
      reference: 'PAY-123',
    });
    expect(fp1).not.toBe(fp2);
  });

  it('normalises reference casing', () => {
    const fp1 = fingerprintGivingRow({
      provider: 'gocardless',
      txn_date: '2026-01-15',
      gross_amount_pence: 1000,
      fee_amount_pence: 20,
      reference: 'PAY-ABC',
    });
    const fp2 = fingerprintGivingRow({
      provider: 'gocardless',
      txn_date: '2026-01-15',
      gross_amount_pence: 1000,
      fee_amount_pence: 20,
      reference: 'pay-abc',
    });
    expect(fp1).toBe(fp2);
  });
});

/* ================================================================== */
/*  Row Validation                                                     */
/* ================================================================== */

describe('validateGivingRow', () => {
  it('returns null for valid row', () => {
    expect(
      validateGivingRow({
        txn_date: '2026-01-15',
        gross_amount_pence: 1000,
        fee_amount_pence: 20,
        net_amount_pence: 980,
      })
    ).toBeNull();
  });

  it('rejects zero gross amount', () => {
    expect(
      validateGivingRow({
        txn_date: '2026-01-15',
        gross_amount_pence: 0,
        fee_amount_pence: 0,
        net_amount_pence: 0,
      })
    ).toContain('Gross amount must be positive');
  });

  it('rejects negative fee', () => {
    expect(
      validateGivingRow({
        txn_date: '2026-01-15',
        gross_amount_pence: 1000,
        fee_amount_pence: -10,
        net_amount_pence: 1010,
      })
    ).toContain('Fee amount cannot be negative');
  });

  it('rejects invalid date format', () => {
    expect(
      validateGivingRow({
        txn_date: 'bad-date',
        gross_amount_pence: 1000,
        fee_amount_pence: 0,
        net_amount_pence: 1000,
      })
    ).toContain('Invalid date');
  });
});

/* ================================================================== */
/*  Provider Mappers – GoCardless                                      */
/* ================================================================== */

describe('GoCardless mapper', () => {
  const headers = ['id', 'charge_date', 'amount', 'app_fee', 'customer_name', 'payout_id'];

  it('detects columns from typical headers', () => {
    const cols = detectColumns(headers);
    expect(cols).not.toBeNull();
    expect(cols!.date).toBe('charge_date');
    expect(cols!.grossAmount).toBe('amount');
    expect(cols!.feeAmount).toBe('app_fee');
    expect(cols!.donorName).toBe('customer_name');
    expect(cols!.payoutReference).toBe('payout_id');
  });

  it('maps a row correctly', () => {
    const cols = detectColumns(headers)!;
    const raw = {
      id: 'PM001',
      charge_date: '2026-02-10',
      amount: '25.00',
      app_fee: '0.50',
      customer_name: 'John Doe',
      payout_id: 'PO-001',
    };

    const result = mapRow(raw, cols);
    expect(result).not.toBeNull();
    expect(result!.txn_date).toBe('2026-02-10');
    expect(result!.gross_amount_pence).toBe(2500);
    expect(result!.fee_amount_pence).toBe(50);
    expect(result!.net_amount_pence).toBe(2450);
    expect(result!.donor_name).toBe('John Doe');
    expect(result!.payout_reference).toBe('PO-001');
  });

  it('returns null for zero amount', () => {
    const cols = detectColumns(headers)!;
    const raw = {
      id: 'PM002',
      charge_date: '2026-02-10',
      amount: '0.00',
      app_fee: '0',
      customer_name: 'Jane',
      payout_id: '',
    };
    expect(mapRow(raw, cols)).toBeNull();
  });
});

/* ================================================================== */
/*  Provider Mappers – SumUp                                           */
/* ================================================================== */

describe('SumUp mapper', () => {
  const headers = ['Transaction ID', 'Date', 'Transaction Amount', 'Transaction Fee', 'Net Amount', 'Customer Name'];

  it('detects columns', () => {
    const cols = detectSumup(headers);
    expect(cols).not.toBeNull();
    expect(cols!.date).toBe('Date');
    expect(cols!.grossAmount).toBe('Transaction Amount');
    expect(cols!.feeAmount).toBe('Transaction Fee');
    expect(cols!.netAmount).toBe('Net Amount');
  });

  it('maps a row correctly', () => {
    const cols = detectSumup(headers)!;
    const raw = {
      'Transaction ID': 'TXN-001',
      'Date': '10/02/2026',
      'Transaction Amount': '15.00',
      'Transaction Fee': '0.30',
      'Net Amount': '14.70',
      'Customer Name': 'Alice Smith',
    };
    const result = mapSumup(raw, cols);
    expect(result).not.toBeNull();
    expect(result!.txn_date).toBe('2026-02-10');
    expect(result!.gross_amount_pence).toBe(1500);
    expect(result!.fee_amount_pence).toBe(30);
    expect(result!.net_amount_pence).toBe(1470);
    expect(result!.donor_name).toBe('Alice Smith');
  });
});

/* ================================================================== */
/*  Provider Mappers – iZettle                                         */
/* ================================================================== */

describe('iZettle mapper', () => {
  const headers = ['Receipt number', 'Date', 'Amount', 'Fee', 'Net', 'Buyer'];

  it('detects columns', () => {
    const cols = detectIzettle(headers);
    expect(cols).not.toBeNull();
    expect(cols!.date).toBe('Date');
    expect(cols!.grossAmount).toBe('Amount');
    expect(cols!.feeAmount).toBe('Fee');
    expect(cols!.netAmount).toBe('Net');
    expect(cols!.donorName).toBe('Buyer');
  });

  it('maps a row correctly', () => {
    const cols = detectIzettle(headers)!;
    const raw = {
      'Receipt number': 'R-001',
      'Date': '2026-02-10',
      'Amount': '20.00',
      'Fee': '0.40',
      'Net': '19.60',
      'Buyer': 'Bob Brown',
    };
    const result = mapIzettle(raw, cols);
    expect(result).not.toBeNull();
    expect(result!.gross_amount_pence).toBe(2000);
    expect(result!.fee_amount_pence).toBe(40);
    expect(result!.net_amount_pence).toBe(1960);
    expect(result!.donor_name).toBe('Bob Brown');
    expect(result!.reference).toBe('R-001');
  });
});

/* ================================================================== */
/*  Journal Builder                                                    */
/* ================================================================== */

describe('groupRowsByDate', () => {
  const makeRow = (date: string, gross: number): NormalizedRow => ({
    txn_date: date,
    gross_amount_pence: gross,
    fee_amount_pence: Math.round(gross * 0.02),
    net_amount_pence: gross - Math.round(gross * 0.02),
    donor_name: null,
    reference: null,
    payout_reference: null,
    raw: {},
  });

  it('groups rows by date', () => {
    const rows = [
      makeRow('2026-01-15', 1000),
      makeRow('2026-01-16', 2000),
      makeRow('2026-01-15', 3000),
    ];
    const groups = groupRowsByDate(rows);
    expect(groups).toHaveLength(2);
    expect(groups[0].txn_date).toBe('2026-01-15');
    expect(groups[0].rows).toHaveLength(2);
    expect(groups[0].total_gross_pence).toBe(4000);
    expect(groups[1].txn_date).toBe('2026-01-16');
    expect(groups[1].rows).toHaveLength(1);
  });

  it('sorts groups by date ascending', () => {
    const rows = [
      makeRow('2026-01-20', 1000),
      makeRow('2026-01-10', 2000),
    ];
    const groups = groupRowsByDate(rows);
    expect(groups[0].txn_date).toBe('2026-01-10');
    expect(groups[1].txn_date).toBe('2026-01-20');
  });
});

describe('buildDonationJournalLines', () => {
  it('creates balanced journal lines with fees', () => {
    const lines = buildDonationJournalLines({
      group: {
        txn_date: '2026-01-15',
        rows: [],
        total_gross_pence: 10000,
        total_fee_pence: 200,
        total_net_pence: 9800,
      },
      clearingAccountId: 'clearing-001',
      feeAccountId: 'fee-001',
      incomeAccountId: 'income-001',
      defaultFundId: 'fund-001',
    });

    // 4 lines: Dr Clearing, Cr Income, Dr Fees, Cr Clearing
    expect(lines).toHaveLength(4);

    const totalDebit = lines.reduce((s, l) => s + l.debit_pence, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit_pence, 0);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(10200); // gross + fee
    expect(isJournalBalanced(lines)).toBe(true);
  });

  it('creates 2 lines when no fees', () => {
    const lines = buildDonationJournalLines({
      group: {
        txn_date: '2026-01-15',
        rows: [],
        total_gross_pence: 5000,
        total_fee_pence: 0,
        total_net_pence: 5000,
      },
      clearingAccountId: 'clearing-001',
      feeAccountId: 'fee-001',
      incomeAccountId: 'income-001',
      defaultFundId: null,
    });

    expect(lines).toHaveLength(2);
    expect(isJournalBalanced(lines)).toBe(true);

    const totalDebit = lines.reduce((s, l) => s + l.debit_pence, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit_pence, 0);
    expect(totalDebit).toBe(5000);
    expect(totalCredit).toBe(5000);
  });

  it('uses correct accounts', () => {
    const lines = buildDonationJournalLines({
      group: {
        txn_date: '2026-01-15',
        rows: [],
        total_gross_pence: 1000,
        total_fee_pence: 50,
        total_net_pence: 950,
      },
      clearingAccountId: 'clearing-001',
      feeAccountId: 'fee-001',
      incomeAccountId: 'income-001',
      defaultFundId: 'fund-001',
    });

    // Dr Clearing (gross)
    expect(lines[0].account_id).toBe('clearing-001');
    expect(lines[0].debit_pence).toBe(1000);

    // Cr Income (gross)
    expect(lines[1].account_id).toBe('income-001');
    expect(lines[1].credit_pence).toBe(1000);
    expect(lines[1].fund_id).toBe('fund-001');

    // Dr Fees
    expect(lines[2].account_id).toBe('fee-001');
    expect(lines[2].debit_pence).toBe(50);

    // Cr Clearing (fee offset)
    expect(lines[3].account_id).toBe('clearing-001');
    expect(lines[3].credit_pence).toBe(50);
  });
});

describe('buildJournalSpecs', () => {
  it('creates one spec per day group', () => {
    const rows: NormalizedRow[] = [
      {
        txn_date: '2026-01-15',
        gross_amount_pence: 1000,
        fee_amount_pence: 20,
        net_amount_pence: 980,
        donor_name: null,
        reference: null,
        payout_reference: null,
        raw: {},
      },
      {
        txn_date: '2026-01-16',
        gross_amount_pence: 2000,
        fee_amount_pence: 40,
        net_amount_pence: 1960,
        donor_name: null,
        reference: null,
        payout_reference: null,
        raw: {},
      },
    ];

    const groups = groupRowsByDate(rows);
    const specs = buildJournalSpecs({
      groups,
      provider: 'gocardless',
      importId: 'abc12345-xxxx-yyyy',
      clearingAccountId: 'clr',
      feeAccountId: 'fee',
      incomeAccountId: 'inc',
      defaultFundId: null,
    });

    expect(specs).toHaveLength(2);
    expect(specs[0].journal_date).toBe('2026-01-15');
    expect(specs[0].memo).toContain('GoCardless');
    expect(specs[0].memo).toContain('2026-01-15');
    expect(specs[0].memo).toContain('abc12345');
    expect(specs[1].journal_date).toBe('2026-01-16');

    // Both balanced
    expect(isJournalBalanced(specs[0].lines)).toBe(true);
    expect(isJournalBalanced(specs[1].lines)).toBe(true);
  });
});

describe('isJournalBalanced', () => {
  it('returns true for balanced lines', () => {
    expect(
      isJournalBalanced([
        { account_id: 'a', fund_id: null, description: '', debit_pence: 100, credit_pence: 0 },
        { account_id: 'b', fund_id: null, description: '', debit_pence: 0, credit_pence: 100 },
      ])
    ).toBe(true);
  });

  it('returns false for unbalanced', () => {
    expect(
      isJournalBalanced([
        { account_id: 'a', fund_id: null, description: '', debit_pence: 100, credit_pence: 0 },
        { account_id: 'b', fund_id: null, description: '', debit_pence: 0, credit_pence: 50 },
      ])
    ).toBe(false);
  });

  it('returns false for less than 2 lines', () => {
    expect(
      isJournalBalanced([
        { account_id: 'a', fund_id: null, description: '', debit_pence: 0, credit_pence: 0 },
      ])
    ).toBe(false);
  });
});

/* ================================================================== */
/*  Utility helpers                                                    */
/* ================================================================== */

describe('normalizeText', () => {
  it('lowercases and trims', () => {
    expect(normalizeText('  Hello World  ')).toBe('hello world');
  });

  it('collapses spaces', () => {
    expect(normalizeText('a   b    c')).toBe('a b c');
  });

  it('returns empty for null', () => {
    expect(normalizeText(null)).toBe('');
  });
});

describe('importHashFromCsv', () => {
  it('produces consistent hash', () => {
    const h1 = importHashFromCsv('csv-content', 'gocardless');
    const h2 = importHashFromCsv('csv-content', 'gocardless');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it('different content produces different hash', () => {
    const h1 = importHashFromCsv('content-a', 'gocardless');
    const h2 = importHashFromCsv('content-b', 'gocardless');
    expect(h1).not.toBe(h2);
  });
});

/* ================================================================== */
/*  Payout Journal Building                                            */
/* ================================================================== */

describe('buildPayoutJournalLines', () => {
  it('creates 2 balanced lines (Dr Bank, Cr Clearing)', () => {
    const lines = buildPayoutJournalLines({
      payoutAmountPence: 9800,
      bankAccountId: 'bank-001',
      clearingAccountId: 'clearing-001',
    });

    expect(lines).toHaveLength(2);
    expect(isJournalBalanced(lines)).toBe(true);

    // Dr Bank
    expect(lines[0].account_id).toBe('bank-001');
    expect(lines[0].debit_pence).toBe(9800);
    expect(lines[0].credit_pence).toBe(0);

    // Cr Clearing
    expect(lines[1].account_id).toBe('clearing-001');
    expect(lines[1].debit_pence).toBe(0);
    expect(lines[1].credit_pence).toBe(9800);
  });

  it('is balanced for any positive amount', () => {
    const lines = buildPayoutJournalLines({
      payoutAmountPence: 123456,
      bankAccountId: 'b',
      clearingAccountId: 'c',
    });
    const totalDebit = lines.reduce((s, l) => s + l.debit_pence, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit_pence, 0);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(123456);
  });
});

describe('groupPayoutRows', () => {
  const makePayoutRow = (ref: string | null, net: number): NormalizedRow => ({
    txn_date: '2026-01-15',
    gross_amount_pence: net + 50,
    fee_amount_pence: 50,
    net_amount_pence: net,
    donor_name: null,
    reference: null,
    payout_reference: ref,
    raw: {},
  });

  it('groups rows by payout_reference', () => {
    const rows = [
      makePayoutRow('PO-001', 980),
      makePayoutRow('PO-002', 1960),
      makePayoutRow('PO-001', 490),
    ];
    const groups = groupPayoutRows(rows);
    expect(groups).toHaveLength(2);

    const po1 = groups.find((g) => g.payout_reference === 'PO-001');
    expect(po1).toBeDefined();
    expect(po1!.rows).toHaveLength(2);
    expect(po1!.total_net_pence).toBe(1470);

    const po2 = groups.find((g) => g.payout_reference === 'PO-002');
    expect(po2).toBeDefined();
    expect(po2!.total_net_pence).toBe(1960);
  });

  it('ignores rows without payout_reference', () => {
    const rows = [
      makePayoutRow(null, 980),
      makePayoutRow('PO-001', 1960),
      makePayoutRow(null, 490),
    ];
    const groups = groupPayoutRows(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].payout_reference).toBe('PO-001');
  });

  it('returns empty for rows without payout references', () => {
    const rows = [makePayoutRow(null, 980), makePayoutRow(null, 490)];
    const groups = groupPayoutRows(rows);
    expect(groups).toHaveLength(0);
  });
});

describe('buildPayoutJournalSpecs', () => {
  it('creates one payout spec per group', () => {
    const payoutGroups = [
      {
        payout_reference: 'PO-001',
        total_net_pence: 5000,
        rows: [{
          txn_date: '2026-01-15',
          gross_amount_pence: 5100,
          fee_amount_pence: 100,
          net_amount_pence: 5000,
          donor_name: null,
          reference: null,
          payout_reference: 'PO-001',
          raw: {},
        }] as NormalizedRow[],
      },
    ];

    const specs = buildPayoutJournalSpecs({
      payoutGroups,
      provider: 'gocardless',
      importId: 'imp12345-xxxx',
      clearingAccountId: 'clr',
      bankAccountId: 'bank',
    });

    expect(specs).toHaveLength(1);
    expect(specs[0].memo).toContain('GoCardless');
    expect(specs[0].memo).toContain('PO-001');
    expect(specs[0].memo).toContain('imp12345');
    expect(isJournalBalanced(specs[0].lines)).toBe(true);
    expect(specs[0].lines[0].debit_pence).toBe(5000);
    expect(specs[0].lines[0].account_id).toBe('bank');
    expect(specs[0].lines[1].credit_pence).toBe(5000);
    expect(specs[0].lines[1].account_id).toBe('clr');
  });

  it('skips groups with zero net', () => {
    const payoutGroups = [
      {
        payout_reference: 'PO-ZERO',
        total_net_pence: 0,
        rows: [] as NormalizedRow[],
      },
    ];

    const specs = buildPayoutJournalSpecs({
      payoutGroups,
      provider: 'sumup',
      importId: 'imp99999',
      clearingAccountId: 'clr',
      bankAccountId: 'bank',
    });

    expect(specs).toHaveLength(0);
  });
});

/* ================================================================== */
/*  Status Filtering                                                   */
/* ================================================================== */

describe('GoCardless status filtering', () => {
  const headers = ['id', 'charge_date', 'amount', 'app_fee', 'status', 'customer_name'];

  it('accepts paid_out status', () => {
    const cols = detectColumns(headers)!;
    const raw = {
      id: 'PM001', charge_date: '2026-02-10', amount: '25.00',
      app_fee: '0.50', status: 'paid_out', customer_name: 'Donor',
    };
    expect(mapRow(raw, cols)).not.toBeNull();
  });

  it('accepts confirmed status', () => {
    const cols = detectColumns(headers)!;
    const raw = {
      id: 'PM002', charge_date: '2026-02-10', amount: '15.00',
      app_fee: '0.30', status: 'confirmed', customer_name: 'Donor',
    };
    expect(mapRow(raw, cols)).not.toBeNull();
  });

  it('skips failed status', () => {
    const cols = detectColumns(headers)!;
    const raw = {
      id: 'PM003', charge_date: '2026-02-10', amount: '10.00',
      app_fee: '0.20', status: 'failed', customer_name: 'Donor',
    };
    expect(mapRow(raw, cols)).toBeNull();
  });

  it('skips cancelled status', () => {
    const cols = detectColumns(headers)!;
    const raw = {
      id: 'PM004', charge_date: '2026-02-10', amount: '10.00',
      app_fee: '0.20', status: 'cancelled', customer_name: 'Donor',
    };
    expect(mapRow(raw, cols)).toBeNull();
  });

  it('detects status column', () => {
    const cols = detectColumns(headers)!;
    expect(cols.status).toBe('status');
  });
});

describe('SumUp status filtering', () => {
  const headers = ['Transaction ID', 'Date', 'Transaction Amount', 'Transaction Fee', 'Status'];

  it('accepts successful status', () => {
    const cols = detectSumup(headers)!;
    const raw = {
      'Transaction ID': 'TXN-001', 'Date': '2026-02-10',
      'Transaction Amount': '15.00', 'Transaction Fee': '0.30', 'Status': 'successful',
    };
    expect(mapSumup(raw, cols)).not.toBeNull();
  });

  it('skips refunded status', () => {
    const cols = detectSumup(headers)!;
    const raw = {
      'Transaction ID': 'TXN-002', 'Date': '2026-02-10',
      'Transaction Amount': '15.00', 'Transaction Fee': '0.30', 'Status': 'refunded',
    };
    expect(mapSumup(raw, cols)).toBeNull();
  });

  it('skips failed status', () => {
    const cols = detectSumup(headers)!;
    const raw = {
      'Transaction ID': 'TXN-003', 'Date': '2026-02-10',
      'Transaction Amount': '15.00', 'Transaction Fee': '0.30', 'Status': 'failed',
    };
    expect(mapSumup(raw, cols)).toBeNull();
  });
});

describe('iZettle status filtering', () => {
  const headers = ['Receipt number', 'Date', 'Amount', 'Fee', 'Net', 'Status', 'Buyer'];

  it('accepts normal sale', () => {
    const cols = detectIzettle(headers)!;
    const raw = {
      'Receipt number': 'R-001', 'Date': '2026-02-10', 'Amount': '20.00',
      'Fee': '0.40', 'Net': '19.60', 'Status': 'completed', 'Buyer': 'Bob',
    };
    expect(mapIzettle(raw, cols)).not.toBeNull();
  });

  it('skips voided transactions', () => {
    const cols = detectIzettle(headers)!;
    const raw = {
      'Receipt number': 'R-002', 'Date': '2026-02-10', 'Amount': '20.00',
      'Fee': '0.40', 'Net': '19.60', 'Status': 'voided', 'Buyer': 'Bob',
    };
    expect(mapIzettle(raw, cols)).toBeNull();
  });

  it('skips cancelled transactions', () => {
    const cols = detectIzettle(headers)!;
    const raw = {
      'Receipt number': 'R-003', 'Date': '2026-02-10', 'Amount': '20.00',
      'Fee': '0.40', 'Net': '19.60', 'Status': 'cancelled', 'Buyer': 'Bob',
    };
    expect(mapIzettle(raw, cols)).toBeNull();
  });
});
