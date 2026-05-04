import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = existsSync(join(process.cwd(), 'Church-ledger-'))
  ? join(process.cwd(), 'Church-ledger-')
  : process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), 'utf8');
}

describe('reconciliation unreconcile and correction', () => {
  it('documents audit and implementation summaries', () => {
    expect(existsSync(join(root, 'docs/audits/reconciliation-correction-unreconcile-audit.md'))).toBe(true);
    expect(existsSync(join(root, 'docs/implementation/reconciliation-unreconcile-correction-summary.md'))).toBe(
      true,
    );

    const audit = read('docs/audits/reconciliation-correction-unreconcile-audit.md');
    const summary = read('docs/implementation/reconciliation-unreconcile-correction-summary.md');
    expect(audit).toContain('fetchPostedLines');
    expect(audit).toContain('Reversal journals');
    expect(summary).toContain('executePostedJournalReversal');
    expect(summary).toContain('giftAidUnreconcileOverride');
  });

  it('adds migration for corrections table and donation lifecycle', () => {
    const migration = read('supabase/migrations/20260502180000_reconciliation_corrections_and_donation_lifecycle.sql');
    expect(migration).toContain('reconciliation_corrections');
    expect(migration).toContain("'voided'");
    expect(migration).toContain("'corrected'");
    expect(migration).toContain('reversal_journal_id');
  });

  it('wires server orchestration and shared journal reversal', () => {
    const unreconcile = read('src/lib/banking/unreconcile-bank-transaction.ts');
    expect(unreconcile).toContain('export async function unreconcileBankTransaction');
    expect(unreconcile).toContain('executePostedJournalReversal');
    expect(unreconcile).toContain('bank_transaction_unreconciled');

    const reversal = read('src/lib/journals/execute-posted-reversal.ts');
    expect(reversal).toContain('export async function executePostedJournalReversal');

    const journalActions = read('src/lib/journals/actions.ts');
    expect(journalActions).toContain('executePostedJournalReversal');
  });

  it('excludes corrected and voided donations from default listing and register', () => {
    const list = read('src/lib/donations/actions.ts');
    expect(list).toContain("not('status', 'eq', 'voided')");
    expect(list).toContain("not('status', 'eq', 'corrected')");
    expect(list).toContain('includeCorrectedVoided');

    const giving = read('src/lib/donations/giving-register.ts');
    expect(giving).toContain('includeCorrectedVoided');
  });

  it('hides reversal journals from the income register by default', () => {
    const registers = read('src/lib/registers/actions.ts');
    expect(registers).toContain('includeReversalJournals');
    expect(registers).toContain('reversal_of');
    expect(registers).toContain('isReversalJournal');
  });

  it('surfaces unreconcile in the reconciliation workspace UI', () => {
    const client = read('src/app/(app)/reconciliation/reconciliation-workspace-client.tsx');
    expect(client).toContain('unreconcileBankTransaction');
    expect(client).toContain('UNRECONCILE');
    expect(client).toContain('Unreconcile bank line');
  });

  it('shows reconciliation correction history on bank account transactions', () => {
    const page = read('src/app/(app)/banking/[bankAccountId]/page.tsx');
    const cell = read('src/app/(app)/banking/[bankAccountId]/bank-line-corrections-cell.tsx');
    const queries = read('src/lib/banking/reconciliation-corrections-queries.ts');

    expect(page).toContain('getReconciliationCorrectionsForBankLines');
    expect(page).toContain('BankLineCorrectionsCell');
    expect(cell).toContain('Reconciliation corrections');
    expect(queries).toContain('reconciliation_corrections');
  });
});
