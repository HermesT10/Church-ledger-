import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../supabase/migrations/00089_banking_schema_foundation.sql', import.meta.url),
  'utf8',
);

describe('banking schema foundation migration', () => {
  it('adds statement imports, import mappings and bank rules with workspace scoping', () => {
    expect(migration).toContain('create table if not exists public.bank_statement_imports');
    expect(migration).toContain('create table if not exists public.bank_import_mappings');
    expect(migration).toContain('create table if not exists public.bank_rules');
    expect(migration).toMatch(/workspace_id uuid not null references public\.organisations/);
  });

  it('keeps legacy banking tenant columns in sync and rejects mismatches', () => {
    expect(migration).toContain('sync_workspace_and_organisation_ids');
    expect(migration).toContain('workspace_id and organisation_id must match');
    expect(migration).toContain('trg_bank_accounts_sync_tenant');
    expect(migration).toContain('trg_bank_lines_sync_tenant');
  });

  it('enables RLS and creates workspace policies for new foundation tables', () => {
    for (const table of ['bank_statement_imports', 'bank_import_mappings', 'bank_rules']) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`alter table public.${table} force row level security`);
      expect(migration).toContain(`public.is_org_member(workspace_id)`);
      expect(migration).toContain(`public.is_org_treasurer_or_admin(workspace_id)`);
    }
  });

  it('preserves bank_lines as the physical transaction table and exposes a compatibility view', () => {
    expect(migration).toContain('alter table public.bank_lines');
    expect(migration).toContain('create or replace view public.bank_transactions');
    expect(migration).toContain('Compatibility view over public.bank_lines');
  });
});
