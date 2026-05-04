import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { aggregateRegisterLines, netRegisterAmount } from '../src/lib/registers/calculate';

const migration = readFileSync(
  new URL('../supabase/migrations/20260429104502_income_expense_registers.sql', import.meta.url),
  'utf8',
);
const categorisationMigration = readFileSync(
  new URL('../supabase/migrations/20260429133100_expense_register_categorisation.sql', import.meta.url),
  'utf8',
);
const actions = readFileSync(
  new URL('../src/lib/registers/actions.ts', import.meta.url),
  'utf8',
);
const defaults = readFileSync(
  new URL('../src/lib/registers/defaults.ts', import.meta.url),
  'utf8',
);
const registerPage = readFileSync(
  new URL('../src/components/registers/register-page.tsx', import.meta.url),
  'utf8',
);
const incomePage = readFileSync(
  new URL('../src/app/(app)/income/register/page.tsx', import.meta.url),
  'utf8',
);
const expensePage = readFileSync(
  new URL('../src/app/(app)/expenses/register/page.tsx', import.meta.url),
  'utf8',
);
const reportPage = readFileSync(
  new URL('../src/app/(app)/reports/income-expense-summary/page.tsx', import.meta.url),
  'utf8',
);
const exportRoute = readFileSync(
  new URL('../src/app/api/registers/export/route.ts', import.meta.url),
  'utf8',
);

describe('income and expense register aggregation', () => {
  it('uses correct income and expense sign conventions', () => {
    expect(netRegisterAmount('income', 0, 10_000)).toBe(10_000);
    expect(netRegisterAmount('income', 2_000, 10_000)).toBe(8_000);
    expect(netRegisterAmount('expense', 10_000, 0)).toBe(10_000);
    expect(netRegisterAmount('expense', 10_000, 2_000)).toBe(8_000);
  });

  it('groups monthly totals by mapped category and keeps unmapped data', () => {
    const result = aggregateRegisterLines('income', [
      { id: '1', accountId: 'a1', accountType: 'income', month: 3, debitPence: 0, creditPence: 8_194_00, categoryId: 'giving' },
      { id: '2', accountId: 'a2', accountType: 'income', month: 3, debitPence: 0, creditPence: 88_00, categoryId: null },
    ]);

    expect(result.giving[2].actualPence).toBe(8_194_00);
    expect(result.uncategorized[2].actualPence).toBe(88_00);
  });
});

describe('income and expense register implementation', () => {
  it('adds tenant-scoped RLS-protected mapping tables', () => {
    expect(migration).toContain('create table if not exists public.register_categories');
    expect(migration).toContain('create table if not exists public.register_category_mappings');
    expect(migration).toContain('organisation_id uuid not null');
    expect(migration).toContain('alter table public.register_categories enable row level security');
    expect(migration).toContain('alter table public.register_category_mappings enable row level security');
  });

  it('calculates from posted journals and does not write totals directly', () => {
    expect(actions).toContain("journals'");
    expect(actions).toContain(".eq('status', 'posted')");
    expect(actions).toContain('journal_lines');
    expect(actions).toContain('Uncategorized');
    expect(actions).toContain('manual_transactions');
    expect(actions).not.toContain('update monthly total');
  });

  it('exposes Income, Expense, and Summary routes', () => {
    expect(incomePage).toContain('registerType="income"');
    expect(expensePage).toContain('registerType="expense"');
    expect(reportPage).toContain('Income & Expense Summary');
    expect(exportRoute).toContain('text/csv');
  });

  it('separates supplier names from church-friendly expense categories', () => {
    expect(defaults).toContain('Staff & Payroll Costs');
    expect(defaults).toContain('Premises & Building Costs');
    expect(defaults).toContain('Office, Admin & Software');
    expect(defaults).toContain('Ministry, Worship & Church Activities');
    expect(defaults).toContain('Mission, Giving & External Support');
    expect(defaults).toContain('Finance, Bank Charges & Loan Repayments');
    expect(defaults).toContain('Other / Needs Review');
    expect(defaults).toContain('Video Conferencing');
    expect(defaults).not.toContain("{ name: 'Zoom', groupName: 'General'");
  });

  it('adds review metadata and safe mapping migration for uncertain suppliers', () => {
    expect(categorisationMigration).toContain('mapping_confidence');
    expect(categorisationMigration).toContain('needs_review boolean');
    expect(categorisationMigration).toContain('bank_rule_id uuid');
    expect(categorisationMigration).toContain("'Valda', 'Needs Review', 'low', true");
    expect(categorisationMigration).toContain("'Castle Water', 'Water', 'high', false");
    expect(categorisationMigration).toContain("status = 'archived'");
  });

  it('supports grouping, review workflow, drill-down, and category configuration in the UI/actions', () => {
    expect(actions).toContain('RegisterGroupBy');
    expect(actions).toContain('groupKeyForLine');
    expect(actions).toContain('reviewExpenseRegisterMappingAction');
    expect(actions).toContain('expense_register_mapping_reviewed');
    expect(registerPage).toContain('Group by');
    expect(registerPage).toContain('Review Uncategorized');
    expect(registerPage).toContain('Configure Categories');
    expect(registerPage).toContain('Create Category');
  });
});
