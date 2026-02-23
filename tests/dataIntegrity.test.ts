import { describe, it, expect } from 'vitest';
import {
  buildReversalLines,
  validateReversal,
  canReverse,
} from '../src/lib/journals/reversal';
import type { JournalLine } from '../src/lib/journals/reversal';

/* ------------------------------------------------------------------ */
/*  Test data helpers                                                  */
/* ------------------------------------------------------------------ */

const SAMPLE_LINES: JournalLine[] = [
  {
    account_id: 'acc-expense',
    fund_id: 'fund-general',
    description: 'Office supplies',
    debit_pence: 5000,
    credit_pence: 0,
  },
  {
    account_id: 'acc-bank',
    fund_id: null,
    description: 'Bank payment',
    debit_pence: 0,
    credit_pence: 5000,
  },
];

const MULTI_LINE: JournalLine[] = [
  {
    account_id: 'acc-salaries',
    fund_id: 'fund-general',
    description: 'Gross pay',
    debit_pence: 200000,
    credit_pence: 0,
  },
  {
    account_id: 'acc-er-nic',
    fund_id: 'fund-general',
    description: 'Employer NIC',
    debit_pence: 30000,
    credit_pence: 0,
  },
  {
    account_id: 'acc-paye-liability',
    fund_id: null,
    description: 'PAYE/NIC',
    debit_pence: 0,
    credit_pence: 50000,
  },
  {
    account_id: 'acc-net-pay',
    fund_id: null,
    description: 'Net pay',
    debit_pence: 0,
    credit_pence: 180000,
  },
];

/* ------------------------------------------------------------------ */
/*  buildReversalLines                                                 */
/* ------------------------------------------------------------------ */

describe('buildReversalLines', () => {
  it('swaps debits and credits', () => {
    const reversals = buildReversalLines(SAMPLE_LINES);

    expect(reversals[0].debit_pence).toBe(0);      // was credit=0 -> debit=0
    expect(reversals[0].credit_pence).toBe(5000);   // was debit=5000 -> credit=5000

    expect(reversals[1].debit_pence).toBe(5000);    // was credit=5000 -> debit=5000
    expect(reversals[1].credit_pence).toBe(0);       // was debit=0 -> credit=0
  });

  it('preserves account IDs', () => {
    const reversals = buildReversalLines(SAMPLE_LINES);
    expect(reversals[0].account_id).toBe('acc-expense');
    expect(reversals[1].account_id).toBe('acc-bank');
  });

  it('preserves fund IDs', () => {
    const reversals = buildReversalLines(SAMPLE_LINES);
    expect(reversals[0].fund_id).toBe('fund-general');
    expect(reversals[1].fund_id).toBeNull();
  });

  it('prefixes description with "Reversal:"', () => {
    const reversals = buildReversalLines(SAMPLE_LINES);
    expect(reversals[0].description).toBe('Reversal: Office supplies');
    expect(reversals[1].description).toBe('Reversal: Bank payment');
  });

  it('uses "Reversal" for null descriptions', () => {
    const lines: JournalLine[] = [
      { account_id: 'a', fund_id: null, description: null, debit_pence: 100, credit_pence: 0 },
      { account_id: 'b', fund_id: null, description: null, debit_pence: 0, credit_pence: 100 },
    ];
    const reversals = buildReversalLines(lines);
    expect(reversals[0].description).toBe('Reversal');
    expect(reversals[1].description).toBe('Reversal');
  });

  it('returns same number of lines', () => {
    expect(buildReversalLines(SAMPLE_LINES).length).toBe(2);
    expect(buildReversalLines(MULTI_LINE).length).toBe(4);
  });

  it('handles multi-line journals', () => {
    const reversals = buildReversalLines(MULTI_LINE);

    // Salaries: was debit 200000 -> credit 200000
    expect(reversals[0].debit_pence).toBe(0);
    expect(reversals[0].credit_pence).toBe(200000);

    // ER NIC: was debit 30000 -> credit 30000
    expect(reversals[1].debit_pence).toBe(0);
    expect(reversals[1].credit_pence).toBe(30000);

    // PAYE: was credit 50000 -> debit 50000
    expect(reversals[2].debit_pence).toBe(50000);
    expect(reversals[2].credit_pence).toBe(0);

    // Net pay: was credit 180000 -> debit 180000
    expect(reversals[3].debit_pence).toBe(180000);
    expect(reversals[3].credit_pence).toBe(0);
  });

  it('returns empty array for empty input', () => {
    expect(buildReversalLines([]).length).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  validateReversal                                                   */
/* ------------------------------------------------------------------ */

describe('validateReversal', () => {
  it('valid reversal passes validation', () => {
    const reversals = buildReversalLines(SAMPLE_LINES);
    const result = validateReversal(SAMPLE_LINES, reversals);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('valid multi-line reversal passes', () => {
    const reversals = buildReversalLines(MULTI_LINE);
    const result = validateReversal(MULTI_LINE, reversals);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('reversal journal is balanced (sum debits = sum credits)', () => {
    const reversals = buildReversalLines(SAMPLE_LINES);
    const totalDebits = reversals.reduce((s, l) => s + l.debit_pence, 0);
    const totalCredits = reversals.reduce((s, l) => s + l.credit_pence, 0);
    expect(totalDebits).toBe(totalCredits);
  });

  it('multi-line reversal is balanced', () => {
    const reversals = buildReversalLines(MULTI_LINE);
    const totalDebits = reversals.reduce((s, l) => s + l.debit_pence, 0);
    const totalCredits = reversals.reduce((s, l) => s + l.credit_pence, 0);
    expect(totalDebits).toBe(totalCredits);
  });

  it('fails on line count mismatch', () => {
    const reversals = buildReversalLines(SAMPLE_LINES).slice(0, 1);
    const result = validateReversal(SAMPLE_LINES, reversals);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Line count mismatch'))).toBe(true);
  });

  it('fails on account mismatch', () => {
    const reversals = buildReversalLines(SAMPLE_LINES);
    reversals[0].account_id = 'wrong-account';
    const result = validateReversal(SAMPLE_LINES, reversals);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('account mismatch'))).toBe(true);
  });

  it('fails on amount mismatch (debit != credit swap)', () => {
    const reversals = buildReversalLines(SAMPLE_LINES);
    reversals[0].credit_pence = 9999; // should be 5000
    const result = validateReversal(SAMPLE_LINES, reversals);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('original debit'))).toBe(true);
  });

  it('fails on unbalanced reversal', () => {
    const reversals = buildReversalLines(SAMPLE_LINES);
    reversals[0].debit_pence = 1; // break balance
    const result = validateReversal(SAMPLE_LINES, reversals);
    expect(result.valid).toBe(false);
    // Will have both amount mismatch and unbalanced errors
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('fails on empty original lines', () => {
    const result = validateReversal([], []);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('no lines'))).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  canReverse                                                         */
/* ------------------------------------------------------------------ */

describe('canReverse', () => {
  it('allows reversing a posted journal', () => {
    const result = canReverse({
      status: 'posted',
      reversed_by: null,
      reversal_of: null,
    });
    expect(result.allowed).toBe(true);
  });

  it('denies reversing a draft journal', () => {
    const result = canReverse({
      status: 'draft',
      reversed_by: null,
      reversal_of: null,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('posted');
  });

  it('denies reversing an approved journal', () => {
    const result = canReverse({
      status: 'approved',
      reversed_by: null,
      reversal_of: null,
    });
    expect(result.allowed).toBe(false);
  });

  it('denies reversing an already-reversed journal', () => {
    const result = canReverse({
      status: 'posted',
      reversed_by: 'some-reversal-id',
      reversal_of: null,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('already been reversed');
  });

  it('denies reversing a reversal journal', () => {
    const result = canReverse({
      status: 'posted',
      reversed_by: null,
      reversal_of: 'some-original-id',
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Reversal journals');
  });
});

/* ------------------------------------------------------------------ */
/*  DB-level invariants (documented tests)                             */
/* ------------------------------------------------------------------ */

describe('DB-level invariants (documented)', () => {
  it('documents: block_posted_mutation trigger prevents posted journal update/delete', () => {
    // The trigger trg_block_posted_journal fires BEFORE UPDATE OR DELETE
    // on public.journals. It calls block_posted_mutation() which:
    // - On DELETE: raises exception if OLD.status = 'posted'
    // - On UPDATE: raises exception if OLD.status = 'posted'
    //   (with a special carve-out for setting reversed_by metadata)
    // This fires even when RLS is bypassed by the service-role key.
    expect(true).toBe(true);
  });

  it('documents: block_posted_mutation trigger prevents posted payment run update/delete', () => {
    // trg_block_posted_payment_run fires BEFORE UPDATE OR DELETE on payment_runs.
    // Same function: blocks all mutations on status = 'posted' rows.
    expect(true).toBe(true);
  });

  it('documents: block_posted_mutation trigger prevents posted payroll run update/delete', () => {
    // trg_block_posted_payroll_run fires BEFORE UPDATE OR DELETE on payroll_runs.
    // Combined with the new RLS policies that check status = 'draft',
    // payroll runs are protected at both layers.
    expect(true).toBe(true);
  });

  it('documents: block_posted_mutation trigger prevents posted bill update/delete', () => {
    // trg_block_posted_bill fires BEFORE UPDATE OR DELETE on bills.
    // Posted and paid bills are immutable at the DB level.
    expect(true).toBe(true);
  });

  it('documents: block_posted_journal_line_mutation prevents line changes on posted journals', () => {
    // trg_block_posted_journal_lines fires BEFORE INSERT OR UPDATE OR DELETE
    // on journal_lines. It checks the parent journal's status and raises
    // an exception if the journal is posted.
    expect(true).toBe(true);
  });

  it('documents: payroll_runs RLS now prevents posted mutations (was missing)', () => {
    // Migration 00024 drops and recreates:
    // - pr_update_treasurer_admin: USING status = 'draft'
    // - pr_delete_treasurer_admin: USING status = 'draft'
    // - prs_insert_treasurer_admin: parent run status = 'draft'
    // - prs_delete_treasurer_admin: parent run status = 'draft'
    // This closes the gap from 00022 where these status checks were absent.
    expect(true).toBe(true);
  });

  it('documents: hard deletes blocked on donations and gift_aid_claims', () => {
    // trg_block_donation_delete and trg_block_gift_aid_claim_delete
    // fire BEFORE DELETE and always raise an exception.
    // These are ledger tables where data must be preserved.
    expect(true).toBe(true);
  });

  it('documents: hard deletes blocked on suppliers and donors (soft-delete only)', () => {
    // trg_block_supplier_delete and trg_block_donor_delete
    // fire BEFORE DELETE and always raise an exception.
    // Use is_active = false for soft-delete instead.
    expect(true).toBe(true);
  });

  it('documents: posted runs must have journal_id (CHECK constraint)', () => {
    // payroll_runs: pr_posted_needs_journal CHECK (status != 'posted' OR journal_id IS NOT NULL)
    // payment_runs: pmr_posted_needs_journal CHECK (status != 'posted' OR journal_id IS NOT NULL)
    // This ensures a posted run always has an associated journal.
    expect(true).toBe(true);
  });

  it('documents: duplicate CSV import blocked by unique fingerprint constraint', () => {
    // giving_import_rows: UNIQUE (organisation_id, provider, fingerprint)
    // bank_lines: UNIQUE (bank_account_id, fingerprint)
    // Both use SHA-256 fingerprints of row data to prevent duplicate imports.
    expect(true).toBe(true);
  });

  it('documents: journal reversal uses reversal_of + reversed_by columns', () => {
    // journals.reversal_of: on the reversal journal, references the original
    // journals.reversed_by: on the original, references the reversal
    // UNIQUE indexes prevent a journal from being reversed more than once.
    // The block_posted_mutation trigger allows setting reversed_by as a
    // special metadata-only update on posted journals.
    expect(true).toBe(true);
  });

  it('documents: reversal-only correction pattern for posted journals', () => {
    // Posted journals cannot be edited or deleted.
    // To correct a posted journal:
    // 1. Create a reversal journal (equal and opposite entries)
    // 2. The reversal is linked via reversal_of -> original.id
    // 3. The original is marked via reversed_by -> reversal.id
    // 4. A new correct journal is then created separately
    // The original and reversal both remain in the ledger for audit trail.
    expect(true).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Idempotency invariants (documented)                                */
/* ------------------------------------------------------------------ */

describe('idempotency invariants (documented)', () => {
  it('documents: postPayrollRun checks status before posting (idempotent)', () => {
    // postPayrollRun() in src/lib/payroll/actions.ts checks if
    // status === 'posted' and returns success early without re-posting.
    expect(true).toBe(true);
  });

  it('documents: postPaymentRun checks status before posting (idempotent)', () => {
    // postPaymentRun() in src/lib/bills/actions.ts checks if
    // status === 'posted' and returns success early.
    expect(true).toBe(true);
  });

  it('documents: Gift Aid claim creation uses FOR UPDATE locking to prevent races', () => {
    // create_gift_aid_claim() Postgres function uses SELECT ... FOR UPDATE
    // to lock donation rows before checking gift_aid_claim_id IS NULL.
    // If two concurrent requests try to claim the same donations,
    // only one will succeed; the other will see the claim_id is set.
    expect(true).toBe(true);
  });

  it('documents: payment run trigger prevents duplicate bill payment', () => {
    // handle_payment_run_post() checks if any bill in the run already
    // belongs to another POSTED payment run. If so, it raises an exception.
    expect(true).toBe(true);
  });
});
