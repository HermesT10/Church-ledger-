import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertTransition, canTransition } from '../src/lib/transactions/lifecycle';
import { validateLineTotals } from '../src/lib/transactions/validation';
import { buildMatchSuggestion } from '../src/lib/transactions/matching';
import { scoreDuplicateCandidate } from '../src/lib/transactions/duplicates';
import type { ManualTransactionInput, ManualTransactionRow } from '../src/lib/transactions/types';

function tx(overrides: Partial<ManualTransactionRow> = {}): ManualTransactionRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    organisation_id: '22222222-2222-4222-8222-222222222222',
    type: 'expense',
    transaction_date: '2026-04-20',
    amount_pence: 4850,
    description: 'Youth snacks',
    payee_payer_name: 'Tesco Stores',
    reference: 'TESCO-123',
    payment_method: 'card',
    expected_bank_account_id: '33333333-3333-4333-8333-333333333333',
    status: 'awaiting_bank_match',
    approval_status: 'approved',
    requires_bank_match: true,
    matched_bank_transaction_id: null,
    posted_journal_id: null,
    created_by: '44444444-4444-4444-8444-444444444444',
    approved_by: null,
    approved_at: null,
    reconciled_at: null,
    posted_at: null,
    created_at: '2026-04-20T00:00:00Z',
    updated_at: '2026-04-20T00:00:00Z',
    voided_at: null,
    void_reason: null,
    duplicate_override_reason: null,
    ...overrides,
  };
}

describe('transactions lifecycle', () => {
  it('allows the safe MVP path and blocks repost transitions', () => {
    expect(canTransition('draft', 'submitted')).toBe(true);
    expect(canTransition('submitted', 'approved')).toBe(true);
    expect(canTransition('awaiting_bank_match', 'matched')).toBe(true);
    expect(canTransition('reconciled', 'posted')).toBe(true);
    expect(canTransition('posted', 'draft')).toBe(false);
    expect(assertTransition('posted', 'draft')).toContain('Cannot move');
  });
});

describe('transactions line validation', () => {
  it('requires income split totals to equal the parent amount', () => {
    const input: ManualTransactionInput = {
      type: 'income',
      transaction_date: '2026-04-20',
      amount_pence: 10000,
      description: 'Sunday giving',
      requires_bank_match: true,
      lines: [
        {
          fund_id: '55555555-5555-4555-8555-555555555555',
          account_id: '66666666-6666-4666-8666-666666666666',
          amount_pence: 7000,
          direction: 'in',
        },
      ],
    };

    expect(validateLineTotals(input)).toBe('Split line amounts must equal the transaction amount.');
  });

  it('requires transfer lines to balance in and out', () => {
    const input: ManualTransactionInput = {
      type: 'transfer',
      transaction_date: '2026-04-20',
      amount_pence: 5000,
      description: 'Move to savings',
      requires_bank_match: true,
      lines: [
        { account_id: '66666666-6666-4666-8666-666666666666', amount_pence: 5000, direction: 'out' },
        { account_id: '77777777-7777-4777-8777-777777777777', amount_pence: 5000, direction: 'in' },
      ],
    };

    expect(validateLineTotals(input)).toBeNull();
  });
});

describe('transactions duplicate and matching helpers', () => {
  it('scores likely duplicates using amount, date, reference, payee, and text', () => {
    const candidate = scoreDuplicateCandidate(
      {
        type: 'expense',
        transaction_date: '2026-04-20',
        amount_pence: 4850,
        description: 'Youth snacks',
        payee_payer_name: 'Tesco Stores',
        reference: 'TESCO-123',
        requires_bank_match: true,
        lines: [{ account_id: '66666666-6666-4666-8666-666666666666', amount_pence: 4850, direction: 'out' }],
      },
      tx(),
    );

    expect(candidate?.score).toBeGreaterThanOrEqual(90);
    expect(candidate?.reasons).toContain('same amount');
  });

  it('returns a high-confidence match for same amount, date, reference and bank account', () => {
    const suggestion = buildMatchSuggestion(tx(), {
      id: '88888888-8888-4888-8888-888888888888',
      txn_date: '2026-04-20',
      description: 'TESCO STORES',
      reference: 'TESCO-123',
      amount_pence: -4850,
      bank_account_id: '33333333-3333-4333-8333-333333333333',
    });

    expect(suggestion.confidence_label).toBe('high');
    expect(suggestion.match_reason).toContain('same amount');
  });
});

describe('transactions schema migration', () => {
  it('adds RLS and uniqueness safeguards for double matching/posting', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/00075_transactions_feature.sql'),
      'utf8',
    );

    expect(sql).toContain('alter table public.manual_transactions enable row level security');
    expect(sql).toContain('idx_transaction_matches_confirmed_bank_line');
    expect(sql).toContain('idx_transaction_matches_confirmed_manual_tx');
    expect(sql).toContain('idx_journals_manual_transaction_source_unique');
    expect(sql).toContain('posted_journal_id');
  });
});
