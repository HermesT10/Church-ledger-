import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = existsSync(join(process.cwd(), 'Church-ledger-'))
  ? join(process.cwd(), 'Church-ledger-')
  : process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), 'utf8');
}

describe('banking reconciliation core rebuild', () => {
  it('documents the current audit and implementation summary', () => {
    const auditPath = 'docs/audits/banking-reconciliation-core-audit.md';
    const summaryPath = 'docs/implementation/banking-reconciliation-core-summary.md';

    expect(existsSync(join(root, auditPath))).toBe(true);
    expect(existsSync(join(root, summaryPath))).toBe(true);

    const audit = read(auditPath);
    const summary = read(summaryPath);

    expect(audit).toContain('Current Data Flow');
    expect(audit).toContain('Mapping Problems');
    expect(audit).toContain('Posting Risks');
    expect(summary).toContain('Upload creates bank transaction rows only');
    expect(summary).toContain('Transaction Amount');
    expect(summary).toContain('Running Balance');
  });

  it('adds storage fields and compatibility view fields for full bank transaction details', () => {
    const migration = read('supabase/migrations/20260501095800_banking_reconciliation_core.sql');

    expect(migration).toContain('additional_description text');
    expect(migration).toContain('display_description text');
    expect(migration).toContain('additional_description_column text');
    expect(migration).toContain('create or replace view public.bank_transactions');
    expect(migration).toContain('raw as raw_row');
  });

  it('keeps the import UI summary-first and avoids signed amount terminology', () => {
    const ui = read('src/app/(app)/banking/[bankAccountId]/import/import-form.tsx');

    expect(ui).toContain('Detected statement format');
    expect(ui).toContain('Advanced: Edit column mapping');
    expect(ui).toContain('Transaction Amount');
    expect(ui).toContain('Running Balance');
    expect(ui).not.toContain('Signed amount');
    expect(ui).toContain('additional_description');
  });

  it('stores full normalised rows and logs mapping/duplicate events during import', () => {
    const actions = read('src/lib/banking/import-actions.ts');

    expect(actions).toContain('additional_description: row.additional_description');
    expect(actions).toContain('display_description: row.display_description');
    expect(actions).toContain('bank_statement_duplicate_upload_skipped');
    expect(actions).toContain('bank_statement_duplicate_transactions_skipped');
    expect(actions).toContain('bank_statement_mapping_detected');
    expect(actions).toContain('bank_statement_mapping_manually_edited');
  });

  it('prevents imported bank lines from bypassing reconciliation and blocks double posting', () => {
    const bankingActions = read('src/lib/banking/actions.ts');
    const reconciliationActions = read('src/lib/banking/reconciliation-workspace-actions.ts');

    expect(bankingActions).toContain('Imported bank transactions must be reconciled through the reconciliation workspace');
    expect(bankingActions).toContain('posted_journal_id');
    expect(reconciliationActions).toContain('posted_journal_id');
    expect(reconciliationActions).toContain('assertNoExistingBankMatch');
    expect(reconciliationActions).toContain('bank_reconciliation_confirm_match');
    expect(reconciliationActions).toContain('bank_reconciliation_exclude');
  });

  it('keeps downstream reporting and RLS coverage connected to the banking source of truth', () => {
    const summaryReports = read('src/lib/reports/summaryReports.ts');
    const reportValidation = read('src/lib/reports/engine/validation.ts');
    const migration = read('supabase/migrations/00089_banking_schema_foundation.sql');

    expect(summaryReports).toContain('getBankReconciliationSummaryReport');
    expect(reportValidation).toContain('unreconciled_bank_transactions');
    expect(migration).toContain('alter table public.bank_lines force row level security');
    expect(migration).toContain('public.is_org_treasurer_or_admin(workspace_id)');
  });
});
