import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  giftAidFollowUpState,
  reconciliationSummary,
  resetDraftForType,
  toManualTransactionType,
} from '@/app/(app)/reconciliation/reconciliation-form-model';

describe('smart reconciliation form model', () => {
  it('resets stale donor and supplier values when type changes', () => {
    expect(resetDraftForType('donation')).toMatchObject({
      supplierId: '',
      giftAidEligible: true,
      addGiftAidFollowUp: true,
      rememberBankReference: true,
    });

    expect(resetDraftForType('expense')).toMatchObject({
      donorId: '',
      giftAidEligible: false,
      addGiftAidFollowUp: false,
      rememberBankReference: true,
    });

    expect(resetDraftForType('transfer')).toMatchObject({
      donorId: '',
      supplierId: '',
      incomeStreamId: '',
      rememberBankReference: false,
    });
  });

  it('maps only manual transaction-backed types to manual transaction types', () => {
    expect(toManualTransactionType('income')).toBe('income');
    expect(toManualTransactionType('expense')).toBe('expense');
    expect(toManualTransactionType('transfer')).toBe('transfer');
    expect(toManualTransactionType('donation')).toBeNull();
    expect(toManualTransactionType('exclude')).toBeNull();
  });

  it('summarises transfers as non-income and non-expense movements', () => {
    const summary = reconciliationSummary({
      type: 'transfer',
      amountLabel: '£125.00',
      fromAccountName: 'Current Account',
      toAccountName: 'Savings Account',
    });

    expect(summary).toContain('Current Account');
    expect(summary).toContain('Savings Account');
    expect(summary).toContain('will not affect income or expenses');
  });

  it('hides Gift Aid follow-up controls for anonymous donations', () => {
    const state = giftAidFollowUpState({
      isDonation: true,
      hasDonor: false,
      donorHasActiveGiftAidDeclaration: false,
      donorEmail: null,
      addGiftAidFollowUp: false,
    });

    expect(state.show).toBe(false);
    expect(state.defaultAddGiftAidFollowUp).toBe(false);
    expect(state.declarationLinkDisabled).toBe(true);
  });

  it('defaults Gift Aid follow-up on when a donor has no active declaration', () => {
    const state = giftAidFollowUpState({
      isDonation: true,
      hasDonor: true,
      donorHasActiveGiftAidDeclaration: false,
      donorEmail: 'donor@example.com',
      addGiftAidFollowUp: true,
    });

    expect(state.show).toBe(true);
    expect(state.defaultAddGiftAidFollowUp).toBe(true);
    expect(state.canGenerateDeclarationLink).toBe(true);
    expect(state.declarationLinkDisabled).toBe(false);
  });

  it('disables Gift Aid declaration links when a donor has no email or already has a declaration', () => {
    expect(
      giftAidFollowUpState({
        isDonation: true,
        hasDonor: true,
        donorHasActiveGiftAidDeclaration: false,
        donorEmail: null,
        addGiftAidFollowUp: true,
      }).canGenerateDeclarationLink
    ).toBe(false);

    const activeDeclaration = giftAidFollowUpState({
      isDonation: true,
      hasDonor: true,
      donorHasActiveGiftAidDeclaration: true,
      donorEmail: 'donor@example.com',
      addGiftAidFollowUp: false,
    });

    expect(activeDeclaration.defaultAddGiftAidFollowUp).toBe(false);
    expect(activeDeclaration.canGenerateDeclarationLink).toBe(false);
    expect(activeDeclaration.helperText).toContain('already has an active Gift Aid declaration');
  });
});

describe('smart reconciliation migration', () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/20260502152000_reconciliation_smart_create_transfer.sql'
    ),
    'utf8'
  );
  const openRequestMigration = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/20260502123428_one_open_gift_aid_request_per_donor.sql'
    ),
    'utf8'
  );

  it('adds Gift Aid declaration follow-up requests', () => {
    expect(migration).toContain('create table if not exists public.gift_aid_declaration_requests');
    expect(migration).toContain("status in ('needed', 'link_generated', 'sent', 'completed', 'dismissed')");
  });

  it('adds supplier linkage and aliases for reconciliation-created expenses', () => {
    expect(migration).toContain('add column if not exists supplier_id');
    expect(migration).toContain('create table if not exists public.supplier_matching_aliases');
  });

  it('adds transfer account metadata without creating income or expense tables', () => {
    expect(migration).toContain('transfer_from_account_id');
    expect(migration).toContain('transfer_to_account_id');
    expect(migration).not.toContain('create table if not exists public.internal_transfer_income');
  });

  it('enforces one open Gift Aid declaration request per donor/workspace', () => {
    expect(openRequestMigration).toContain('partition by workspace_id, donor_id');
    expect(openRequestMigration).toContain('uq_gift_aid_declaration_requests_open_donor');
    expect(openRequestMigration).toContain("where status in ('needed', 'link_generated', 'sent')");
  });
});
