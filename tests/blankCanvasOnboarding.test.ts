import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = existsSync(join(process.cwd(), 'Church-ledger-'))
  ? join(process.cwd(), 'Church-ledger-')
  : process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), 'utf8');
}

describe('blank canvas onboarding', () => {
  it('documents the audit and implementation summary', () => {
    const auditPath = 'docs/audits/onboarding-default-data-audit.md';
    const summaryPath = 'docs/implementation/blank-canvas-onboarding-summary.md';

    expect(existsSync(join(root, auditPath))).toBe(true);
    expect(existsSync(join(root, summaryPath))).toBe(true);

    const audit = read(auditPath);
    const summary = read(summaryPath);

    expect(audit).toContain('Default Data Sources');
    expect(audit).toContain('Removal Plan');
    expect(summary).toContain('Blank setup');
    expect(summary).toContain('Import-first setup');
    expect(summary).toContain('Bank-Driven Category Creation');
  });

  it('adds setup mode, progress, suggestions, mappings, archive fields, and RLS', () => {
    const migration = read('supabase/migrations/20260501101600_blank_canvas_onboarding.sql');

    expect(migration).toContain('setup_mode boolean not null default true');
    expect(migration).toContain('setup_type text not null default');
    expect(migration).toContain('create table if not exists public.workspace_setup_progress');
    expect(migration).toContain('create table if not exists public.categorisation_suggestions');
    expect(migration).toContain('create table if not exists public.bank_transaction_mappings');
    expect(migration).toContain('add column if not exists is_archived boolean not null default false');
    expect(migration).toContain('alter table public.workspace_setup_progress force row level security');
    expect(migration).toContain('public.is_org_treasurer_or_admin(workspace_id)');
  });

  it('keeps workspace creation blank apart from org, membership, profile, and progress rows', () => {
    const actions = read('src/app/(app)/onboarding/actions.ts');

    expect(actions).toContain('setup_mode: true');
    expect(actions).toContain('setup_type: \'blank\'');
    expect(actions).toContain('workspace_setup_progress');
    expect(actions).not.toContain('.from(\'funds\')');
    expect(actions).not.toContain('.from(\'accounts\')');
    expect(actions).not.toContain('.from(\'suppliers\')');
    expect(actions).not.toContain('.from(\'register_categories\')');
  });

  it('removes default seed buttons from onboarding and uses guided minimal setup instead', () => {
    const client = read('src/app/(app)/onboarding/setup/setup-client.tsx');
    const actions = read('src/app/(app)/onboarding/setup/actions.ts');

    expect(client).toContain('Blank setup');
    expect(client).toContain('Guided setup');
    expect(client).toContain('Import-first setup');
    expect(client).not.toContain('Seed Default Funds');
    expect(client).not.toContain('Seed Chart of Accounts');
    expect(actions).toContain('createGuidedSetupStructure');
    expect(actions).toContain('Restricted Funds Holding');
    expect(actions).not.toContain('STARTER_ACCOUNTS_CHART');
    expect(actions).not.toContain('SEED_FUNDS');
  });

  it('does not synthesize virtual register categories for an empty workspace', () => {
    const registers = read('src/lib/registers/actions.ts');

    expect(registers).toContain('return rows;');
    expect(registers).not.toContain('defaultCategoriesForRegister');
    expect(registers).not.toContain('virtualCategories');
  });

  it('creates bank-driven suggestions and mapping persistence after statement import', () => {
    const suggestions = read('src/lib/banking/categorisation-suggestions.ts');
    const imports = read('src/lib/banking/import-actions.ts');

    expect(suggestions).toContain('createBankCategorisationSuggestionsForImport');
    expect(suggestions).toContain('rememberBankTransactionMapping');
    expect(suggestions).toContain('bank_transaction_mappings');
    expect(suggestions).toContain('categorisation_suggestions');
    expect(imports).toContain('statement_uploaded: true');
    expect(imports).toContain('createBankCategorisationSuggestionsForImport');
  });

  it('shows an empty setup dashboard and explicit skip path', () => {
    const dashboard = read('src/app/(app)/dashboard/page.tsx');
    const actions = read('src/app/(app)/dashboard/setup-actions.ts');

    expect(dashboard).toContain('SetupDashboard');
    expect(dashboard).toContain('Setup {percent}% complete');
    expect(dashboard).toContain('Skip setup and open dashboard');
    expect(actions).toContain('skipDashboardSetupAction');
    expect(actions).toContain('workspace_setup_skipped');
  });

  it('keeps accounting lifecycle rules archive-first and reversal-first', () => {
    const accounts = read('src/lib/accounts/actions.ts');
    const funds = read('src/lib/funds/actions.ts');
    const suppliers = read('src/lib/suppliers/actions.ts');
    const journals = read('src/lib/journals/actions.ts');

    expect(accounts).toContain('is_archived: true');
    expect(funds).toContain('archived_by: user.id');
    expect(suppliers).toContain('is_archived: false');
    expect(journals).toContain('Posted or approved journals cannot be deleted. Create a reversal instead.');
    expect(journals).toContain('isDateInLockedPeriod');
    expect(journals).toContain(".eq('status', 'draft')");
  });
});
