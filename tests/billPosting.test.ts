import { describe, it, expect } from 'vitest';
import {
  buildJournalLinesFromBill,
  type BillLineForPosting,
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

/* ------------------------------------------------------------------ */
/*  buildJournalLinesFromBill                                          */
/* ------------------------------------------------------------------ */

describe('buildJournalLinesFromBill', () => {
  it('produces balanced journal lines (debits = credits)', () => {
    const billLines: BillLineForPosting[] = [
      { account_id: 'exp-1', fund_id: null, description: 'Office supplies', amount_pence: 5000 },
      { account_id: 'exp-2', fund_id: 'fund-1', description: 'Postage', amount_pence: 2500 },
    ];
    const totalPence = 7500;

    const journalLines = buildJournalLinesFromBill(billLines, CREDITORS_ACCOUNT, totalPence);

    expect(totalDebits(journalLines)).toBe(totalCredits(journalLines));
    expect(totalDebits(journalLines)).toBe(totalPence);
  });

  it('creates one debit line per bill line', () => {
    const billLines: BillLineForPosting[] = [
      { account_id: 'exp-1', fund_id: null, description: 'A', amount_pence: 3000 },
      { account_id: 'exp-2', fund_id: null, description: 'B', amount_pence: 4000 },
      { account_id: 'exp-3', fund_id: null, description: 'C', amount_pence: 3000 },
    ];

    const journalLines = buildJournalLinesFromBill(billLines, CREDITORS_ACCOUNT, 10000);

    const debitLines = journalLines.filter((l) => l.debit_pence > 0);
    expect(debitLines).toHaveLength(3);
  });

  it('creates a single credit line to creditors account', () => {
    const billLines: BillLineForPosting[] = [
      { account_id: 'exp-1', fund_id: null, description: 'Item', amount_pence: 10000 },
    ];

    const journalLines = buildJournalLinesFromBill(billLines, CREDITORS_ACCOUNT, 10000);

    const creditLines = journalLines.filter((l) => l.credit_pence > 0);
    expect(creditLines).toHaveLength(1);
    expect(creditLines[0].account_id).toBe(CREDITORS_ACCOUNT);
    expect(creditLines[0].credit_pence).toBe(10000);
  });

  it('preserves fund tags from bill lines to debit journal lines', () => {
    const billLines: BillLineForPosting[] = [
      { account_id: 'exp-1', fund_id: 'fund-general', description: 'Unrestricted', amount_pence: 5000 },
      { account_id: 'exp-2', fund_id: 'fund-restricted', description: 'Restricted', amount_pence: 5000 },
    ];

    const journalLines = buildJournalLinesFromBill(billLines, CREDITORS_ACCOUNT, 10000);

    const debitLines = journalLines.filter((l) => l.debit_pence > 0);
    expect(debitLines[0].fund_id).toBe('fund-general');
    expect(debitLines[1].fund_id).toBe('fund-restricted');
  });

  it('sets credit line fund_id to null', () => {
    const billLines: BillLineForPosting[] = [
      { account_id: 'exp-1', fund_id: 'fund-1', description: 'Item', amount_pence: 5000 },
    ];

    const journalLines = buildJournalLinesFromBill(billLines, CREDITORS_ACCOUNT, 5000);

    const creditLine = journalLines.find((l) => l.credit_pence > 0)!;
    expect(creditLine.fund_id).toBeNull();
  });

  it('each journal line is either debit or credit, never both', () => {
    const billLines: BillLineForPosting[] = [
      { account_id: 'exp-1', fund_id: null, description: 'A', amount_pence: 3000 },
      { account_id: 'exp-2', fund_id: null, description: 'B', amount_pence: 7000 },
    ];

    const journalLines = buildJournalLinesFromBill(billLines, CREDITORS_ACCOUNT, 10000);

    for (const line of journalLines) {
      expect(line.debit_pence > 0 && line.credit_pence > 0).toBe(false);
    }
  });

  it('handles single bill line correctly', () => {
    const billLines: BillLineForPosting[] = [
      { account_id: 'exp-1', fund_id: null, description: 'Single item', amount_pence: 15000 },
    ];

    const journalLines = buildJournalLinesFromBill(billLines, CREDITORS_ACCOUNT, 15000);

    // Should have exactly 2 lines: 1 debit + 1 credit
    expect(journalLines).toHaveLength(2);
    expect(totalDebits(journalLines)).toBe(15000);
    expect(totalCredits(journalLines)).toBe(15000);
  });

  it('preserves descriptions from bill lines', () => {
    const billLines: BillLineForPosting[] = [
      { account_id: 'exp-1', fund_id: null, description: 'Printer paper', amount_pence: 2500 },
    ];

    const journalLines = buildJournalLinesFromBill(billLines, CREDITORS_ACCOUNT, 2500);

    const debitLine = journalLines.find((l) => l.debit_pence > 0)!;
    expect(debitLine.description).toBe('Printer paper');
  });
});
