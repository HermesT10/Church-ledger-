import { describe, it, expect } from 'vitest';
import {
  buildPaymentRunJournalLines,
  type PaymentRunItemForPosting,
  type JournalLineOutput,
} from '@/lib/bills/validation';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function totalDebits(lines: JournalLineOutput[]): number {
  return lines.reduce((s, l) => s + l.debit_pence, 0);
}

function totalCredits(lines: JournalLineOutput[]): number {
  return lines.reduce((s, l) => s + l.credit_pence, 0);
}

const CREDITORS_ACCOUNT = 'creditors-account-id';
const BANK_ACCOUNT = 'bank-account-id';

/* ------------------------------------------------------------------ */
/*  buildPaymentRunJournalLines                                        */
/* ------------------------------------------------------------------ */

describe('buildPaymentRunJournalLines', () => {
  it('produces balanced journal lines (debits = credits)', () => {
    const items: PaymentRunItemForPosting[] = [
      { bill_id: 'b1', amount_pence: 5000, description: 'Bill 001' },
      { bill_id: 'b2', amount_pence: 3000, description: 'Bill 002' },
    ];
    const totalPence = 8000;

    const lines = buildPaymentRunJournalLines(items, CREDITORS_ACCOUNT, BANK_ACCOUNT, totalPence);

    expect(totalDebits(lines)).toBe(totalCredits(lines));
    expect(totalDebits(lines)).toBe(totalPence);
  });

  it('creates one debit line per bill item to creditors account', () => {
    const items: PaymentRunItemForPosting[] = [
      { bill_id: 'b1', amount_pence: 3000 },
      { bill_id: 'b2', amount_pence: 4000 },
      { bill_id: 'b3', amount_pence: 3000 },
    ];

    const lines = buildPaymentRunJournalLines(items, CREDITORS_ACCOUNT, BANK_ACCOUNT, 10000);

    const debitLines = lines.filter((l) => l.debit_pence > 0);
    expect(debitLines).toHaveLength(3);
    for (const dl of debitLines) {
      expect(dl.account_id).toBe(CREDITORS_ACCOUNT);
    }
  });

  it('creates a single credit line to bank account for total', () => {
    const items: PaymentRunItemForPosting[] = [
      { bill_id: 'b1', amount_pence: 5000 },
      { bill_id: 'b2', amount_pence: 5000 },
    ];

    const lines = buildPaymentRunJournalLines(items, CREDITORS_ACCOUNT, BANK_ACCOUNT, 10000);

    const creditLines = lines.filter((l) => l.credit_pence > 0);
    expect(creditLines).toHaveLength(1);
    expect(creditLines[0].account_id).toBe(BANK_ACCOUNT);
    expect(creditLines[0].credit_pence).toBe(10000);
  });

  it('all fund tags are null (payment run is account-level)', () => {
    const items: PaymentRunItemForPosting[] = [
      { bill_id: 'b1', amount_pence: 7500 },
    ];

    const lines = buildPaymentRunJournalLines(items, CREDITORS_ACCOUNT, BANK_ACCOUNT, 7500);

    for (const line of lines) {
      expect(line.fund_id).toBeNull();
    }
  });

  it('each journal line is either debit or credit, never both', () => {
    const items: PaymentRunItemForPosting[] = [
      { bill_id: 'b1', amount_pence: 2000 },
      { bill_id: 'b2', amount_pence: 8000 },
    ];

    const lines = buildPaymentRunJournalLines(items, CREDITORS_ACCOUNT, BANK_ACCOUNT, 10000);

    for (const line of lines) {
      expect(line.debit_pence > 0 && line.credit_pence > 0).toBe(false);
    }
  });

  it('handles single bill item correctly', () => {
    const items: PaymentRunItemForPosting[] = [
      { bill_id: 'b1', amount_pence: 15000, description: 'Single bill' },
    ];

    const lines = buildPaymentRunJournalLines(items, CREDITORS_ACCOUNT, BANK_ACCOUNT, 15000);

    // 1 debit (creditors) + 1 credit (bank) = 2 lines
    expect(lines).toHaveLength(2);
    expect(totalDebits(lines)).toBe(15000);
    expect(totalCredits(lines)).toBe(15000);
  });

  it('preserves descriptions from items on debit lines', () => {
    const items: PaymentRunItemForPosting[] = [
      { bill_id: 'b1', amount_pence: 5000, description: 'Payment – Bill INV-001' },
    ];

    const lines = buildPaymentRunJournalLines(items, CREDITORS_ACCOUNT, BANK_ACCOUNT, 5000);

    const debitLine = lines.find((l) => l.debit_pence > 0)!;
    expect(debitLine.description).toBe('Payment – Bill INV-001');
  });

  it('uses default description when item has no description', () => {
    const items: PaymentRunItemForPosting[] = [
      { bill_id: 'b1', amount_pence: 5000 },
    ];

    const lines = buildPaymentRunJournalLines(items, CREDITORS_ACCOUNT, BANK_ACCOUNT, 5000);

    const debitLine = lines.find((l) => l.debit_pence > 0)!;
    expect(debitLine.description).toContain('clear creditor');
  });

  it('bank credit line has payment run description', () => {
    const items: PaymentRunItemForPosting[] = [
      { bill_id: 'b1', amount_pence: 5000 },
    ];

    const lines = buildPaymentRunJournalLines(items, CREDITORS_ACCOUNT, BANK_ACCOUNT, 5000);

    const creditLine = lines.find((l) => l.credit_pence > 0)!;
    expect(creditLine.description).toContain('bank transfer');
  });
});
