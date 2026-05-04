import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = existsSync(join(process.cwd(), 'Church-ledger-'))
  ? join(process.cwd(), 'Church-ledger-')
  : process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), 'utf8');
}

describe('banking reconciliation fix', () => {
  it('documents the audit and implementation summary', () => {
    expect(existsSync(join(root, 'docs/audits/banking-reconciliation-fix-audit.md'))).toBe(true);
    expect(existsSync(join(root, 'docs/implementation/banking-reconciliation-fix-summary.md'))).toBe(true);

    const audit = read('docs/audits/banking-reconciliation-fix-audit.md');
    const summary = read('docs/implementation/banking-reconciliation-fix-summary.md');
    expect(audit).toContain('linked_account_id');
    expect(audit).toContain('voidBankStatementImport` only sets');
    expect(summary).toContain('BANK_ACCOUNT_LEDGER_LINK_MISSING');
    expect(summary).toContain('deleteBankStatementImport');
  });

  it('keeps linked_account_id as the canonical bank ledger link', () => {
    const files = [
      'src/lib/banking/ledger-link.ts',
      'src/lib/banking/bankAccounts.ts',
      'src/lib/banking/actions.ts',
      'src/lib/banking/reconciliation-workspace-actions.ts',
      'src/lib/transactions/posting.ts',
    ].map(read).join('\n');

    expect(files).toContain('linked_account_id');
    expect(files).not.toContain('chart_account_id');
    expect(files).not.toContain('linked_ledger_account_id');
  });

  it('adds an idempotent repair migration for active bank account ledger links', () => {
    const migration = read('supabase/migrations/20260502162000_repair_bank_account_ledger_links.sql');
    expect(migration).toContain('public.bank_accounts.linked_account_id');
    expect(migration).toContain("a.type::text = 'asset'");
    expect(migration).toContain('allow_direct_posting');
    expect(migration).toContain('available_in_reconciliation');
    expect(migration).toContain('raise notice');
  });

  it('centralises validation and repair of bank ledger links', () => {
    const helper = read('src/lib/banking/ledger-link.ts');
    expect(helper).toContain('validateBankLedgerLink');
    expect(helper).toContain('ensureBankLedgerAccount');
    expect(helper).toContain('linkExistingBankLedgerAccount');
    expect(helper).toContain('BANK_ACCOUNT_LEDGER_LINK_MISSING');
    expect(helper).toContain('BANK_ACCOUNT_LEDGER_LINK_INVALID');
    expect(helper).toContain("action: 'bank_ledger_link_auto_created'");
  });

  it('auto-links new bank accounts and exposes repair actions in Banking', () => {
    const create = read('src/lib/banking/bankAccounts.ts');
    const actions = read('src/lib/banking/actions.ts');
    const page = read('src/app/(app)/banking/[bankAccountId]/page.tsx');

    expect(create).toContain('createBankLedgerAccountForName');
    expect(create).toContain('linked_account_id: ledger.account.id');
    expect(actions).toContain('repairBankAccountLedgerLink');
    expect(actions).toContain('linkBankAccountLedgerAccountFromForm');
    expect(page).toContain('Accounting Link');
    expect(page).toContain('Create ledger account');
    expect(page).toContain('Repair link');
  });

  it('guards reconciliation and posting with structured ledger-link errors', () => {
    const reconciliationActions = read('src/lib/banking/reconciliation-workspace-actions.ts');
    const posting = read('src/lib/transactions/posting.ts');
    const donationActions = read('src/lib/reconciliation/actions.ts');
    const client = read('src/app/(app)/reconciliation/reconciliation-workspace-client.tsx');

    expect(reconciliationActions).toContain('validateBankLedgerLink');
    expect(posting).toContain('validateBankLedgerLink');
    expect(donationActions).toContain('validateBankLedgerLink');
    expect(posting).toContain('validation.code');
    expect(client).toContain('Bank account needs an accounting link');
    expect(client).toContain('Create ledger account automatically');
  });

  it('adds reconciliation filters and keeps default queue action-focused', () => {
    const actions = read('src/lib/banking/reconciliation-workspace-actions.ts');
    const client = read('src/app/(app)/reconciliation/reconciliation-workspace-client.tsx');
    const legacy = read('src/lib/reconciliation/actions.ts');

    expect(actions).toContain("ReconciliationQueueFilter = 'needs_reconciliation' | 'reconciled' | 'excluded' | 'all'");
    expect(actions).toContain('countQueueFilters');
    expect(actions).toContain("['unmatched', 'suggested_match', 'needs_review']");
    expect(client).toContain('Needs reconciliation');
    expect(client).toContain('All imported transactions for this account are reconciled.');
    expect(legacy).toContain('"excluded","duplicate","matched","reconciled"');
  });

  it('adds safe statement import deletion with confirmation UI and audit logging', () => {
    const importActions = read('src/lib/banking/import-actions.ts');
    const deleteAction = read('src/app/(app)/banking/[bankAccountId]/statement-delete-action.tsx');
    const page = read('src/app/(app)/banking/[bankAccountId]/page.tsx');

    expect(importActions).toContain('deleteBankStatementImport');
    expect(importActions).toContain('bank_statement_delete_blocked');
    expect(importActions).toContain('bank_statement_import_deleted');
    expect(importActions).toContain(".from('categorisation_suggestions')");
    expect(importActions).toContain(".from('bank_lines')");
    expect(importActions).toContain(".from('bank_statement_imports')");
    expect(importActions).toContain('.remove([statementImport.file_path])');
    expect(deleteAction).toContain('DELETE STATEMENT');
    expect(importActions).toContain('A deletion reason is required');
    expect(deleteAction).toContain('This statement has reconciled transactions');
    expect(page).toContain('StatementDeleteAction');
  });
});
