import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FINANCE_LIFECYCLE_POLICIES,
  getFinanceLifecyclePolicy,
  requiresReversalAfterPosting,
} from '../src/lib/accounting/lifecycle';
import { buildEvidenceAccessPath } from '../src/lib/evidence/config';

const root = process.cwd();

function readProjectFile(path: string): string {
  return readFileSync(join(root, path), 'utf-8');
}

describe('production hardening controls', () => {
  it('does not publish real-looking Supabase keys in .env.example', () => {
    const envExample = readProjectFile('.env.example');

    expect(envExample).not.toContain('eyJhbGciOiJIUzI1Ni');
    expect(envExample).toContain('NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co');
    expect(envExample).toContain('SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
  });

  it('makes financial evidence private and removes public-read storage policy', () => {
    const migration = readProjectFile('supabase/migrations/00066_private_financial_evidence.sql');

    expect(migration).toContain('set public = false');
    expect(migration).toContain('drop policy if exists financial_evidence_public_read');
    expect(migration).toContain('financial_evidence_member_select');
    expect(migration).toContain('public.is_org_member');
  });

  it('forces bank allocation through draft journal posting and blocks direct posted inserts', () => {
    const invariants = readProjectFile('supabase/migrations/00065_harden_posted_journal_invariants.sql');
    const atomicFn = readProjectFile('supabase/migrations/00068_post_bank_allocation_atomic.sql');

    expect(invariants).toContain('prevent_direct_posted_journal_insert');
    expect(invariants).toContain("new.status = 'posted'");
    expect(invariants).toContain('prevent_posted_journal_line_mutation');

    expect(atomicFn).toContain('create or replace function public.post_bank_allocation_atomic');
    expect(atomicFn).toContain("'draft'");
    expect(atomicFn).toContain('$fn$');
  });

  it('returns stable app evidence URLs instead of public storage URLs', () => {
    expect(buildEvidenceAccessPath('org/bills/file.pdf')).toBe(
      '/api/evidence?path=org%2Fbills%2Ffile.pdf',
    );
  });
});

describe('finance lifecycle policies', () => {
  it('covers all core finance modules', () => {
    const modules = FINANCE_LIFECYCLE_POLICIES.map((policy) => policy.module);

    expect(modules).toEqual([
      'journals',
      'bills',
      'payment_runs',
      'payroll',
      'banking',
      'cash',
      'donations',
      'giving_imports',
      'gift_aid',
      'budgets',
    ]);
  });

  it('requires controlled reversals after posted ledger mutations', () => {
    expect(requiresReversalAfterPosting('journals')).toBe(true);
    expect(requiresReversalAfterPosting('banking')).toBe(true);
    expect(requiresReversalAfterPosting('donations')).toBe(true);
    expect(requiresReversalAfterPosting('budgets')).toBe(false);
  });

  it('marks approval-required modules explicitly', () => {
    expect(getFinanceLifecyclePolicy('bills').postingControl).toBe('approval_required');
    expect(getFinanceLifecyclePolicy('payroll').postingControl).toBe('approval_required');
    expect(getFinanceLifecyclePolicy('banking').postingControl).toBe('manual_review_required');
  });
});
