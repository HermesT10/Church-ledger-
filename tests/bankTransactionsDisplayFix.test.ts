import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const importActions = readFileSync(
  new URL('../src/lib/banking/import-actions.ts', import.meta.url),
  'utf8',
);
const statementParser = readFileSync(
  new URL('../src/lib/banking/statement-parser.ts', import.meta.url),
  'utf8',
);
const accountPage = readFileSync(
  new URL('../src/app/(app)/banking/[bankAccountId]/page.tsx', import.meta.url),
  'utf8',
);
const reconciliationWorkspace = readFileSync(
  new URL('../src/app/(app)/reconciliation/reconciliation-workspace-client.tsx', import.meta.url),
  'utf8',
);
const reconciliationActions = readFileSync(
  new URL('../src/lib/banking/reconciliation-workspace-actions.ts', import.meta.url),
  'utf8',
);
const bankingTypes = readFileSync(
  new URL('../src/lib/banking/types.ts', import.meta.url),
  'utf8',
);
const migration = readFileSync(
  new URL('../supabase/migrations/00092_bank_transaction_display_fields.sql', import.meta.url),
  'utf8',
);

describe('bank transactions display fix', () => {
  it('adds first-class time, row number and raw row fields to the database model', () => {
    expect(migration).toContain('add column if not exists transaction_time');
    expect(migration).toContain('add column if not exists row_number');
    expect(migration).toContain('raw as raw_row');
    expect(migration).toContain('with (security_invoker = true)');
    expect(bankingTypes).toContain('transaction_time?: string | null');
    expect(bankingTypes).toContain('row_number?: number | null');
    expect(bankingTypes).toContain('raw_row?: Record<string, unknown> | null');
  });

  it('stores description, time, amount and balance as separate import fields', () => {
    expect(importActions).toContain('transaction_time: row.transaction_time');
    expect(importActions).toContain('row_number: row.row_number');
    expect(importActions).toContain('description: row.description');
    expect(importActions).toContain('amount: row.amount_pence / 100');
    expect(importActions).toContain('running_balance: row.running_balance_pence == null ? null : row.running_balance_pence / 100');
    expect(importActions).toContain('__mapping: mapping');
  });

  it('warns for time-like descriptions and amount-as-balance mapping mistakes', () => {
    expect(statementParser).toContain('DESCRIPTION_TIME_WARNING');
    expect(statementParser).toContain('AMOUNT_BALANCE_WARNING');
    expect(statementParser).toContain('looksLikeTime(description)');
    expect(statementParser).toContain('params.mapping.amount === params.mapping.balance');
  });

  it('renders transaction list with description primary and balance separately from movement', () => {
    expect(accountPage).toContain('transactionTitle(line)');
    expect(accountPage).toContain('movementLabel(line.amount_pence)');
    expect(accountPage).toContain('Balance {formatOptionalPounds(line.balance_pence)}');
    expect(accountPage).toContain('Missing description');
    expect(accountPage).toContain('Suggested Match');
  });

  it('shows labelled movement and balance in the reconciliation workspace', () => {
    expect(reconciliationActions).toContain('transaction_time');
    expect(reconciliationActions).toContain('money_in');
    expect(reconciliationActions).toContain('running_balance');
    expect(reconciliationWorkspace).toContain('movementLabel(line)');
    expect(reconciliationWorkspace).toContain('Balance {formatPounds(line.balance_pence)}');
    expect(reconciliationWorkspace).toContain('transactionTitle(selectedLine)');
  });

  it('guards reprocessing when imported rows are already matched or reconciled', () => {
    expect(importActions).toContain('reprocessBankStatementImport');
    expect(importActions).toContain('assertStatementImportCanBeReprocessed');
    expect(importActions).toContain('This import cannot be reprocessed because at least one transaction is already matched');
    expect(importActions).toContain("action: 'bank_statement_reprocess_started'");
    expect(importActions).toContain("action: result.ok ? 'bank_statement_reprocessed' : 'bank_statement_reprocess_failed'");
  });
});
