import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { calculateLettingsChargeStatus } from '../src/lib/lettings/status';

const migration = readFileSync(
  new URL('../supabase/migrations/00095_lettings_feature.sql', import.meta.url),
  'utf8',
);
const actions = readFileSync(
  new URL('../src/lib/lettings/actions.ts', import.meta.url),
  'utf8',
);
const matching = readFileSync(
  new URL('../src/lib/banking/reconciliation-matching.ts', import.meta.url),
  'utf8',
);
const reconciliationActions = readFileSync(
  new URL('../src/lib/banking/reconciliation-workspace-actions.ts', import.meta.url),
  'utf8',
);
const lettingsPage = readFileSync(
  new URL('../src/app/(app)/lettings/page.tsx', import.meta.url),
  'utf8',
);

describe('Lettings charge status rules', () => {
  it('derives expected, paid, part-paid and overdue statuses', () => {
    expect(calculateLettingsChargeStatus({ expectedAmountPence: 10000, paidAmountPence: 0, today: '2026-04-10' })).toBe('expected');
    expect(calculateLettingsChargeStatus({ expectedAmountPence: 10000, paidAmountPence: 10000 })).toBe('paid');
    expect(calculateLettingsChargeStatus({ expectedAmountPence: 10000, paidAmountPence: 5000 })).toBe('part_paid');
    expect(calculateLettingsChargeStatus({ expectedAmountPence: 10000, paidAmountPence: 0, dueDate: '2026-03-01', today: '2026-04-10' })).toBe('overdue');
  });

  it('preserves waived and cancelled admin states', () => {
    expect(calculateLettingsChargeStatus({ expectedAmountPence: 10000, paidAmountPence: 10000, existingStatus: 'waived' })).toBe('waived');
    expect(calculateLettingsChargeStatus({ expectedAmountPence: 10000, paidAmountPence: 10000, existingStatus: 'cancelled' })).toBe('cancelled');
  });
});

describe('Lettings schema and integration safeguards', () => {
  it('creates tenant-scoped Lettings tables with RLS', () => {
    for (const table of ['lettings_hirers', 'lettings_charges', 'lettings_payments', 'lettings_documents']) {
      expect(migration).toContain(`public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain('organisation_id uuid not null');
    }
  });

  it('uses pence columns and duplicate posting guards', () => {
    expect(migration).toContain('expected_amount_pence bigint');
    expect(migration).toContain('paid_amount_pence bigint');
    expect(migration).toContain('outstanding_amount_pence bigint generated always');
    expect(migration).toContain('idx_lettings_payments_bank_unique');
    expect(migration).toContain('idx_lettings_payments_journal_unique');
  });

  it('posts Lettings payments through a dedicated one-journal path', () => {
    expect(actions).toContain('findOrCreateLettingsHirerForReconciliation');
    expect(actions).toContain("source_type: 'lettings_payment'");
    expect(actions).toContain('posted_journal_id');
    expect(actions).toContain('Bank receipt:');
  });

  it('adds Lettings bank matching suggestions and confirmation branch', () => {
    expect(matching).toContain('lettingsChargeSuggestions');
    expect(matching).toContain('lettingsChargeToSuggestion');
    expect(matching).toContain("'lettings_charge'");
    expect(reconciliationActions).toContain('reconcileLettingsChargeFromBankLine');
    expect(reconciliationActions).toContain("'lettings_payment'");
    expect(reconciliationActions).toContain('finalizeLettingsPaymentReconciliation');
    expect(reconciliationActions).toContain('bank_reconciliation_create_lettings_from_bank');
    expect(reconciliationActions).toContain('createNewLetting');
    expect(reconciliationActions).toContain('findOrCreateLettingsHirerForReconciliation');
  });

  it('renders the spreadsheet-style Lettings register', () => {
    expect(lettingsPage).toContain('Monthly register');
    expect(lettingsPage).toContain('Add Hirer');
    expect(lettingsPage).toContain('Add Monthly Charge');
    expect(lettingsPage).toContain('Monthly totals');
    expect(lettingsPage).toContain('name="default_fund_id"');
    expect(lettingsPage).toContain('name="default_income_account_id"');
    expect(lettingsPage).toMatch(/default_fund_id[\s\S]*required/);
    expect(lettingsPage).toMatch(/default_income_account_id[\s\S]*required/);
  });
});
