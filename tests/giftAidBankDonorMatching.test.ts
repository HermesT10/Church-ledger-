import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  normalizeDonorMatchAlias,
  scoreDonorMatchesForBankTransaction,
  type BankDonorMatchDonor,
} from '@/lib/giftaid/bank-donor-matching';

const donors: BankDonorMatchDonor[] = [
  {
    id: 'donor-1',
    full_name: 'Jane Smith',
    first_name: 'Jane',
    last_name: 'Smith',
    display_name: 'Jane Smith',
    reference_code: null,
    donor_reference_code: null,
    is_active: true,
  },
  {
    id: 'donor-2',
    full_name: 'John Smyth',
    first_name: 'John',
    last_name: 'Smyth',
    display_name: 'John Smyth',
    reference_code: null,
    donor_reference_code: null,
    is_active: true,
  },
  {
    id: 'donor-archived',
    full_name: 'Archived Donor',
    first_name: 'Archived',
    last_name: 'Donor',
    display_name: 'Archived Donor',
    reference_code: null,
    donor_reference_code: null,
    is_active: false,
  },
];

describe('Gift Aid bank donor matching', () => {
  it('scores exact bank reference alias matches as high confidence', () => {
    const result = scoreDonorMatchesForBankTransaction({
      bankTransaction: {
        id: 'bank-1',
        workspace_id: 'org-1',
        reference: 'STEWARDSHIP JANE-SMITH',
        description: null,
        amount_pence: 5000,
      },
      donors,
      aliases: [
        {
          donor_id: 'donor-1',
          alias_text: 'JANE-SMITH',
          normalized_alias: normalizeDonorMatchAlias('JANE-SMITH'),
          source: 'bank_reference',
          confidence: 0.95,
        },
      ],
    });

    expect(result.candidates[0]).toMatchObject({
      donor_id: 'donor-1',
      confidence_label: 'high',
    });
    expect(result.candidates[0].reasons.join(' ')).toContain('Exact alias match');
  });

  it('scores fuzzy donor name matches from bank text', () => {
    const result = scoreDonorMatchesForBankTransaction({
      bankTransaction: {
        id: 'bank-1',
        workspace_id: 'org-1',
        reference: 'J SMITH MONTHLY GIVING',
        description: null,
        amount_pence: 2500,
      },
      donors,
      aliases: [],
    });

    expect(result.candidates.some((candidate) => candidate.donor_id === 'donor-1')).toBe(true);
    expect(
      result.candidates.find((candidate) => candidate.donor_id === 'donor-1')?.reasons
    ).toEqual(expect.arrayContaining(['Surname or initial matches bank reference']));
  });

  it('uses recurring amount and reference patterns', () => {
    const result = scoreDonorMatchesForBankTransaction({
      bankTransaction: {
        id: 'bank-1',
        workspace_id: 'org-1',
        reference: 'SO JANE GIVING',
        description: null,
        amount_pence: 3000,
      },
      donors,
      aliases: [],
      historicalDonations: [
        {
          donor_id: 'donor-1',
          amount_pence: 3000,
          provider_reference: 'SO JANE GIVING',
        },
      ],
    });

    expect(result.candidates[0].donor_id).toBe('donor-1');
    expect(result.candidates[0].reasons.join(' ')).toContain('Recurring amount');
  });

  it('does not suggest archived donors unless included', () => {
    const base = {
      bankTransaction: {
        id: 'bank-1',
        workspace_id: 'org-1',
        reference: 'Archived Donor',
        description: null,
        amount_pence: 1000,
      },
      donors,
      aliases: [],
    };

    expect(
      scoreDonorMatchesForBankTransaction(base).candidates.some(
        (candidate) => candidate.donor_id === 'donor-archived'
      )
    ).toBe(false);
    expect(
      scoreDonorMatchesForBankTransaction({
        ...base,
        includeArchived: true,
      }).candidates.some((candidate) => candidate.donor_id === 'donor-archived')
    ).toBe(true);
  });

  it('warns when multiple high confidence matches exist', () => {
    const result = scoreDonorMatchesForBankTransaction({
      bankTransaction: {
        id: 'bank-1',
        workspace_id: 'org-1',
        reference: 'PAYMENT SMITH SMYTH',
        description: null,
        amount_pence: 1000,
      },
      donors,
      aliases: [
        {
          donor_id: 'donor-1',
          alias_text: 'SMITH',
          normalized_alias: 'smith',
          source: 'bank_reference',
          confidence: 0.95,
        },
        {
          donor_id: 'donor-2',
          alias_text: 'SMYTH',
          normalized_alias: 'smyth',
          source: 'bank_reference',
          confidence: 0.95,
        },
      ],
    });

    expect(result.warning).toContain('Multiple high-confidence');
  });

  it('migration adds alias table with workspace RLS and source fields', () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        'supabase/migrations/00083_gift_aid_donor_alias_matching.sql'
      ),
      'utf8'
    );

    expect(migration).toContain('donor_matching_aliases');
    expect(migration).toContain('workspace_id uuid not null');
    expect(migration).toContain("source in ('bank_reference', 'manual', 'imported', 'system')");
    expect(migration).toContain('public.is_org_member(workspace_id)');
  });

  it('reconciliation action scopes suggestions and confirmed aliases to the active workspace', () => {
    const actions = readFileSync(
      join(process.cwd(), 'src/lib/reconciliation/actions.ts'),
      'utf8'
    );

    expect(actions).toContain('.eq(\'organisation_id\', orgId)');
    expect(actions).toContain('.from(\'donor_matching_aliases\')');
    expect(actions).toContain('.eq(\'workspace_id\', orgId)');
    expect(actions).toContain('saveBankReferenceAsAlias');
    expect(actions).toContain("donorId ?? 'anonymous'");
  });
});
