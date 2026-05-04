import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260430102300_portal_expense_submissions.sql', import.meta.url),
  'utf8',
);
const actions = readFileSync(
  new URL('../src/lib/portal/expense-submissions.ts', import.meta.url),
  'utf8',
);
const types = readFileSync(
  new URL('../src/lib/portal/expense-submission-types.ts', import.meta.url),
  'utf8',
);
const portalPage = readFileSync(
  new URL('../src/app/(app)/portal/expenses/page.tsx', import.meta.url),
  'utf8',
);
const portalClient = readFileSync(
  new URL('../src/app/(app)/portal/expenses/portal-expenses-client.tsx', import.meta.url),
  'utf8',
);
const adminPage = readFileSync(
  new URL('../src/app/(app)/workflows/portal-expenses/page.tsx', import.meta.url),
  'utf8',
);
const adminClient = readFileSync(
  new URL('../src/app/(app)/workflows/portal-expenses/portal-expenses-admin-client.tsx', import.meta.url),
  'utf8',
);
const evidenceConfig = readFileSync(
  new URL('../src/lib/evidence/config.ts', import.meta.url),
  'utf8',
);
const evidenceRoute = readFileSync(
  new URL('../src/app/api/evidence/route.ts', import.meta.url),
  'utf8',
);
const dashboard = readFileSync(
  new URL('../src/lib/portal/dashboard.ts', import.meta.url),
  'utf8',
);
const refreshHook = readFileSync(
  new URL('../src/app/(app)/portal/use-portal-refresh.ts', import.meta.url),
  'utf8',
);
const notificationTypes = readFileSync(
  new URL('../src/lib/portal/types.ts', import.meta.url),
  'utf8',
);

describe('portal expense submissions', () => {
  it('creates a scoped intake table with settings, lifecycle, RLS, indexes, and realtime', () => {
    expect(migration).toContain('create table if not exists public.portal_expense_submissions');
    for (const field of [
      'expense_date',
      'amount_pence',
      'method',
      'budget_category_id',
      'card_assignment_id',
      'receipt_path',
      'overspend_warning',
      'linked_manual_transaction_id',
      'linked_bank_transaction_id',
    ]) {
      expect(migration).toContain(field);
    }
    for (const status of ['draft', 'submitted', 'changes_requested', 'approved', 'rejected', 'awaiting_bank_match', 'paid', 'reconciled', 'voided']) {
      expect(migration).toContain(status);
      expect(types).toContain(`'${status}'`);
    }
    for (const method of ['cash', 'card', 'cheque', 'bank_transfer']) {
      expect(migration).toContain(method);
      expect(types).toContain(`'${method}'`);
    }
    expect(migration).toContain('portal_expense_receipts_required');
    expect(migration).toContain('allow_portal_expense_overspend_submission');
    expect(migration).toContain('submitted_by = auth.uid()');
    expect(migration).toContain('public.is_org_treasurer_or_admin(workspace_id)');
    expect(migration).toContain('alter publication supabase_realtime add table public.portal_expense_submissions');
  });

  it('implements draft, submit, upload, admin review, conversion, and bank-link actions', () => {
    for (const action of [
      'listPortalExpenseSubmissions',
      'listPortalExpenseFormOptions',
      'savePortalExpenseDraft',
      'updatePortalExpenseDraft',
      'submitPortalExpense',
      'uploadPortalExpenseReceipt',
      'requestPortalExpenseChanges',
      'approvePortalExpenseSubmission',
      'rejectPortalExpenseSubmission',
      'voidPortalExpenseSubmission',
      'convertPortalExpenseToManualTransaction',
      'linkPortalExpenseToBankTransaction',
    ]) {
      expect(actions).toContain(action);
    }
    expect(actions).toContain("scope: 'assigned_budgets'");
    expect(actions).toContain("scope: 'assigned_funds'");
    expect(actions).toContain("scope: 'assigned_categories'");
    expect(actions).toContain("from('user_card_assignments')");
    expect(actions).toContain("from('manual_transactions')");
    expect(actions).toContain("from('manual_transaction_lines')");
    expect(actions).toContain('maybeFindDuplicate');
  });

  it('enforces receipt policy, private evidence, and authenticated receipt viewing', () => {
    expect(evidenceConfig).toContain("'portal-expense-submissions': 'transactions'");
    expect(actions).toContain('FINANCIAL_EVIDENCE_BUCKET');
    expect(actions).toContain('buildEvidenceAccessPath(path)');
    expect(actions).toContain("['application/pdf', 'image/jpeg', 'image/png']");
    expect(actions).toContain('10 * 1024 * 1024');
    expect(evidenceRoute).toContain("parsed.entityType === 'portal-expense-submissions'");
    expect(evidenceRoute).toContain("from('portal_expense_submissions')");
    expect(evidenceRoute).toContain("eq('submitted_by', user.id)");
  });

  it('checks assigned budgets, funds, categories, cards, and overspend policy', () => {
    expect(actions).toContain('getBudgetWarning');
    expect(actions).toContain("from('budget_lines')");
    expect(actions).toContain("from('journal_lines')");
    expect(actions).toContain('allowOverspendSubmission');
    expect(actions).toContain('overspend_warning');
    expect(actions).toContain('This card is not assigned to you.');
  });

  it('builds portal and admin UI flows', () => {
    expect(portalPage).toContain('PortalExpensesClient');
    expect(portalClient).toContain('Submit expense');
    expect(portalClient).toContain('Receipt');
    expect(portalClient).toContain('Budget/category');
    expect(portalClient).toContain('SheetContent');
    expect(adminPage).toContain('PortalExpensesAdminClient');
    expect(adminClient).toContain('Approve');
    expect(adminClient).toContain('Request changes');
    expect(adminClient).toContain('Convert to manual transaction');
    expect(adminClient).toContain('Link bank transaction');
  });

  it('updates dashboard, realtime, notifications, and accounting status sync', () => {
    expect(dashboard).toContain("from('portal_expense_submissions')");
    expect(dashboard).toContain("eq('submitted_by', userId)");
    expect(refreshHook).toContain("table: 'portal_expense_submissions'");
    expect(migration).toContain('sync_portal_expense_submission_transaction_state');
    expect(migration).toContain('handle_portal_expense_submission_bank_match');
    for (const type of ['expense_submitted', 'expense_changes_requested', 'expense_approved', 'expense_rejected', 'expense_awaiting_bank_match', 'expense_paid', 'expense_reconciled', 'expense_voided']) {
      expect(notificationTypes).toContain(type);
    }
  });
});
