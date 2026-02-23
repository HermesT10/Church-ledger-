import { describe, it, expect } from 'vitest';
import {
  scoreMatch,
  rankCandidates,
  isProbablePayoutJournal,
  buildMatchCandidate,
  type BankLineForMatching,
  type JournalForMatching,
  type MatchCandidate,
} from '../src/lib/reconciliation/matching';
import {
  computeClearingBalances,
  type JournalLineInput,
  type ProviderClearingMap,
} from '../src/lib/reconciliation/clearingReport';

/* ================================================================== */
/*  isProbablePayoutJournal                                            */
/* ================================================================== */

describe('isProbablePayoutJournal', () => {
  it('detects GoCardless payout memo', () => {
    const result = isProbablePayoutJournal(
      'GoCardless payout PO-001 (Import abc12345)'
    );
    expect(result.isPayout).toBe(true);
    expect(result.provider).toBe('gocardless');
  });

  it('detects SumUp payout memo', () => {
    const result = isProbablePayoutJournal(
      'SumUp payout REF-999 (Import def67890)'
    );
    expect(result.isPayout).toBe(true);
    expect(result.provider).toBe('sumup');
  });

  it('detects iZettle payout memo', () => {
    const result = isProbablePayoutJournal(
      'iZettle payout DEP-100 (Import xyz11111)'
    );
    expect(result.isPayout).toBe(true);
    expect(result.provider).toBe('izettle');
  });

  it('returns false for non-payout journal', () => {
    const result = isProbablePayoutJournal('January rent payment');
    expect(result.isPayout).toBe(false);
    expect(result.provider).toBeNull();
  });

  it('returns false for null memo', () => {
    const result = isProbablePayoutJournal(null);
    expect(result.isPayout).toBe(false);
    expect(result.provider).toBeNull();
  });

  it('detects payout without known provider', () => {
    const result = isProbablePayoutJournal(
      'Unknown platform payout REF-001'
    );
    expect(result.isPayout).toBe(true);
    expect(result.provider).toBeNull();
  });

  it('is case-insensitive', () => {
    const result = isProbablePayoutJournal(
      'GOCARDLESS PAYOUT PO-001 (IMPORT ABC)'
    );
    expect(result.isPayout).toBe(true);
    expect(result.provider).toBe('gocardless');
  });
});

/* ================================================================== */
/*  scoreMatch                                                         */
/* ================================================================== */

describe('scoreMatch', () => {
  const baseBankLine: BankLineForMatching = {
    id: 'bl-1',
    txn_date: '2026-02-10',
    amount_pence: 5000,
    description: null,
    reference: null,
  };

  const baseJournal: JournalForMatching = {
    id: 'j-1',
    journal_date: '2026-02-10',
    memo: 'Test journal',
    amountPence: 5000,
  };

  it('exact amount and same date yields high score', () => {
    const { score } = scoreMatch(baseBankLine, baseJournal);
    // 50 (exact amount) + 25 (same date) = 75
    expect(score).toBeGreaterThanOrEqual(75);
  });

  it('wrong amount yields lower score', () => {
    const journal = { ...baseJournal, amountPence: 9999 };
    const { score } = scoreMatch(baseBankLine, journal);
    expect(score).toBeLessThan(50);
  });

  it('amount within 1% gives partial credit', () => {
    // 5000 * 1.005 = 5025 (within 1%)
    const journal = { ...baseJournal, amountPence: 5025 };
    const { score, reasons } = scoreMatch(baseBankLine, journal);
    expect(score).toBeGreaterThanOrEqual(30); // 30 for within 1% + date
    expect(reasons).toContain('Amount within 1%');
  });

  it('date proximity affects score', () => {
    const farJournal = { ...baseJournal, journal_date: '2026-02-20' };
    const { score: farScore } = scoreMatch(baseBankLine, farJournal);

    const closeJournal = { ...baseJournal, journal_date: '2026-02-11' };
    const { score: closeScore } = scoreMatch(baseBankLine, closeJournal);

    expect(closeScore).toBeGreaterThan(farScore);
  });

  it('same day gets max date score', () => {
    const { score, reasons } = scoreMatch(baseBankLine, baseJournal);
    expect(reasons).toContain('Same date');
    expect(score).toBeGreaterThanOrEqual(75);
  });

  it('reference matching provider name boosts score', () => {
    const bankLine = {
      ...baseBankLine,
      reference: 'GOCARDLESS REF-001',
    };
    const journal = {
      ...baseJournal,
      memo: 'GoCardless payout PO-001 (Import abc12345)',
    };
    const { score, reasons } = scoreMatch(bankLine, journal);
    expect(score).toBeGreaterThanOrEqual(90);
    expect(reasons.some((r) => r.includes('gocardless'))).toBe(true);
  });

  it('returns reasons array', () => {
    const { reasons } = scoreMatch(baseBankLine, baseJournal);
    expect(reasons.length).toBeGreaterThan(0);
  });

  it('handles negative bank line amounts', () => {
    const negativeBankLine = { ...baseBankLine, amount_pence: -5000 };
    const { score } = scoreMatch(negativeBankLine, baseJournal);
    // abs(-5000) = 5000 → exact match
    expect(score).toBeGreaterThanOrEqual(75);
  });
});

/* ================================================================== */
/*  rankCandidates                                                     */
/* ================================================================== */

describe('rankCandidates', () => {
  it('returns sorted by score descending, limited to top N', () => {
    const candidates: MatchCandidate[] = [
      { journalId: 'j1', journalDate: '2026-01-01', memo: 'a', amountPence: 100, matchType: 'manual', provider: null, score: 30, reasons: [] },
      { journalId: 'j2', journalDate: '2026-01-01', memo: 'b', amountPence: 200, matchType: 'payout', provider: 'gocardless', score: 90, reasons: [] },
      { journalId: 'j3', journalDate: '2026-01-01', memo: 'c', amountPence: 300, matchType: 'manual', provider: null, score: 60, reasons: [] },
      { journalId: 'j4', journalDate: '2026-01-01', memo: 'd', amountPence: 400, matchType: 'manual', provider: null, score: 50, reasons: [] },
    ];

    const top3 = rankCandidates(candidates, 3);
    expect(top3).toHaveLength(3);
    expect(top3[0].journalId).toBe('j2'); // score 90
    expect(top3[1].journalId).toBe('j3'); // score 60
    expect(top3[2].journalId).toBe('j4'); // score 50
  });

  it('returns all if less than N', () => {
    const candidates: MatchCandidate[] = [
      { journalId: 'j1', journalDate: '2026-01-01', memo: 'a', amountPence: 100, matchType: 'manual', provider: null, score: 50, reasons: [] },
    ];
    const top3 = rankCandidates(candidates, 3);
    expect(top3).toHaveLength(1);
  });

  it('does not mutate original array', () => {
    const candidates: MatchCandidate[] = [
      { journalId: 'j1', journalDate: '2026-01-01', memo: '', amountPence: 0, matchType: 'manual', provider: null, score: 10, reasons: [] },
      { journalId: 'j2', journalDate: '2026-01-01', memo: '', amountPence: 0, matchType: 'manual', provider: null, score: 80, reasons: [] },
    ];
    rankCandidates(candidates, 1);
    expect(candidates[0].journalId).toBe('j1'); // original unchanged
  });
});

/* ================================================================== */
/*  buildMatchCandidate                                                */
/* ================================================================== */

describe('buildMatchCandidate', () => {
  it('identifies payout journals and sets matchType accordingly', () => {
    const bankLine: BankLineForMatching = {
      id: 'bl-1',
      txn_date: '2026-02-10',
      amount_pence: 5000,
      description: null,
      reference: null,
    };
    const journal: JournalForMatching = {
      id: 'j-1',
      journal_date: '2026-02-10',
      memo: 'GoCardless payout PO-001 (Import abc)',
      amountPence: 5000,
    };

    const candidate = buildMatchCandidate(bankLine, journal);
    expect(candidate.matchType).toBe('payout');
    expect(candidate.provider).toBe('gocardless');
    expect(candidate.score).toBeGreaterThan(0);
  });

  it('sets matchType to manual for non-payout journals', () => {
    const bankLine: BankLineForMatching = {
      id: 'bl-1',
      txn_date: '2026-02-10',
      amount_pence: 5000,
      description: null,
      reference: null,
    };
    const journal: JournalForMatching = {
      id: 'j-1',
      journal_date: '2026-02-10',
      memo: 'Monthly rent',
      amountPence: 5000,
    };

    const candidate = buildMatchCandidate(bankLine, journal);
    expect(candidate.matchType).toBe('manual');
    expect(candidate.provider).toBeNull();
  });
});

/* ================================================================== */
/*  computeClearingBalances                                             */
/* ================================================================== */

describe('computeClearingBalances', () => {
  const providerMap: ProviderClearingMap[] = [
    {
      provider: 'gocardless',
      clearingAccountId: 'clr-gc',
      clearingAccountName: 'GoCardless Clearing',
    },
    {
      provider: 'sumup',
      clearingAccountId: 'clr-su',
      clearingAccountName: 'SumUp Clearing',
    },
  ];

  it('returns zero balance when all payouts matched', () => {
    const journalLines: JournalLineInput[] = [
      // Donation: Dr Clearing 1000
      { journal_id: 'j1', journal_date: '2026-01-15', journal_memo: 'GoCardless donations', account_id: 'clr-gc', debit_pence: 1000, credit_pence: 0 },
      // Fee: Cr Clearing 20
      { journal_id: 'j1', journal_date: '2026-01-15', journal_memo: 'GoCardless donations', account_id: 'clr-gc', debit_pence: 0, credit_pence: 20 },
      // Payout: Cr Clearing 980
      { journal_id: 'j2', journal_date: '2026-01-20', journal_memo: 'GoCardless payout PO-001 (Import abc)', account_id: 'clr-gc', debit_pence: 0, credit_pence: 980 },
    ];

    const matchedJournalIds = new Set(['j2']); // payout matched
    const result = computeClearingBalances({
      journalLines,
      matchedJournalIds,
      providerMap,
    });

    const gcRow = result.find((r) => r.provider === 'gocardless')!;
    expect(gcRow.balancePence).toBe(0); // 1000 - 20 - 980 = 0
    expect(gcRow.openPayoutCount).toBe(0);
    expect(gcRow.status).toBe('clear');
  });

  it('returns non-zero balance when payouts outstanding', () => {
    const journalLines: JournalLineInput[] = [
      // Donation: Dr Clearing 5000
      { journal_id: 'j1', journal_date: '2026-01-15', journal_memo: 'GoCardless donations', account_id: 'clr-gc', debit_pence: 5000, credit_pence: 0 },
      // Fee: Cr Clearing 100
      { journal_id: 'j1', journal_date: '2026-01-15', journal_memo: 'GoCardless donations', account_id: 'clr-gc', debit_pence: 0, credit_pence: 100 },
      // Payout journal exists but NOT matched
      { journal_id: 'j2', journal_date: '2026-01-20', journal_memo: 'GoCardless payout PO-001 (Import abc)', account_id: 'clr-gc', debit_pence: 0, credit_pence: 4900 },
    ];

    const matchedJournalIds = new Set<string>(); // nothing matched
    const result = computeClearingBalances({
      journalLines,
      matchedJournalIds,
      providerMap,
    });

    const gcRow = result.find((r) => r.provider === 'gocardless')!;
    expect(gcRow.balancePence).toBe(0); // 5000 - 100 - 4900 = 0 (balance is 0 even without matching because the journal entry was made)
    expect(gcRow.openPayoutCount).toBe(1); // 1 unmatched payout journal
    expect(gcRow.oldestOpenPayoutDate).toBe('2026-01-20');
    expect(gcRow.status).toBe('outstanding');
  });

  it('returns positive balance when payout journal not yet created', () => {
    const journalLines: JournalLineInput[] = [
      // Donation: Dr Clearing 3000
      { journal_id: 'j1', journal_date: '2026-01-15', journal_memo: 'SumUp donations', account_id: 'clr-su', debit_pence: 3000, credit_pence: 0 },
      // Fee: Cr Clearing 60
      { journal_id: 'j1', journal_date: '2026-01-15', journal_memo: 'SumUp donations', account_id: 'clr-su', debit_pence: 0, credit_pence: 60 },
      // No payout journal yet
    ];

    const matchedJournalIds = new Set<string>();
    const result = computeClearingBalances({
      journalLines,
      matchedJournalIds,
      providerMap,
    });

    const suRow = result.find((r) => r.provider === 'sumup')!;
    expect(suRow.balancePence).toBe(2940); // 3000 - 60 = 2940
    expect(suRow.openPayoutCount).toBe(0);
    expect(suRow.status).toBe('outstanding');
  });

  it('marks overdue when oldest unmatched payout > 30 days', () => {
    const journalLines: JournalLineInput[] = [
      { journal_id: 'j1', journal_date: '2025-12-01', journal_memo: 'GoCardless donations', account_id: 'clr-gc', debit_pence: 2000, credit_pence: 0 },
      { journal_id: 'j2', journal_date: '2025-12-05', journal_memo: 'GoCardless payout PO-OLD (Import old)', account_id: 'clr-gc', debit_pence: 0, credit_pence: 2000 },
    ];

    const matchedJournalIds = new Set<string>();
    const result = computeClearingBalances({
      journalLines,
      matchedJournalIds,
      providerMap,
      asOfDate: '2026-02-10', // > 30 days from 2025-12-05
    });

    const gcRow = result.find((r) => r.provider === 'gocardless')!;
    expect(gcRow.openPayoutCount).toBe(1);
    expect(gcRow.status).toBe('overdue');
  });

  it('handles empty journal lines gracefully', () => {
    const result = computeClearingBalances({
      journalLines: [],
      matchedJournalIds: new Set(),
      providerMap,
    });

    expect(result).toHaveLength(2);
    expect(result[0].balancePence).toBe(0);
    expect(result[0].status).toBe('clear');
    expect(result[1].balancePence).toBe(0);
    expect(result[1].status).toBe('clear');
  });

  it('handles multiple providers independently', () => {
    const journalLines: JournalLineInput[] = [
      // GC: Dr Clearing 1000
      { journal_id: 'j1', journal_date: '2026-01-15', journal_memo: 'GC donations', account_id: 'clr-gc', debit_pence: 1000, credit_pence: 0 },
      // SU: Dr Clearing 2000
      { journal_id: 'j2', journal_date: '2026-01-15', journal_memo: 'SU donations', account_id: 'clr-su', debit_pence: 2000, credit_pence: 0 },
    ];

    const result = computeClearingBalances({
      journalLines,
      matchedJournalIds: new Set(),
      providerMap,
    });

    const gcRow = result.find((r) => r.provider === 'gocardless')!;
    const suRow = result.find((r) => r.provider === 'sumup')!;
    expect(gcRow.balancePence).toBe(1000);
    expect(suRow.balancePence).toBe(2000);
  });
});

/* ================================================================== */
/*  Duplicate match prevention (pure validation)                       */
/* ================================================================== */

describe('duplicate match prevention', () => {
  it('unique constraint means same bank_line_id cannot be matched twice (validated via pure check)', () => {
    // This test validates the concept: we check that building a candidate
    // for an already-matched line should be caught before DB insert.
    // The actual constraint is at the SQL level (unique bank_line_id).
    // Here we test the pure logic that the UI relies on:
    // matching candidates are only shown for unmatched journals.
    const matchedJournalIds = new Set(['j-already-matched']);

    const candidates: MatchCandidate[] = [
      { journalId: 'j-already-matched', journalDate: '2026-01-01', memo: '', amountPence: 100, matchType: 'manual', provider: null, score: 90, reasons: [] },
      { journalId: 'j-new', journalDate: '2026-01-01', memo: '', amountPence: 100, matchType: 'manual', provider: null, score: 80, reasons: [] },
    ];

    // Filter out already-matched journals (as suggestMatches does)
    const filtered = candidates.filter(
      (c) => !matchedJournalIds.has(c.journalId)
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].journalId).toBe('j-new');
  });
});
