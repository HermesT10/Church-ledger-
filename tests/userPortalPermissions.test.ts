import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  PORTAL_ACTION_KEYS,
  PORTAL_PAGE_KEYS,
  PORTAL_SCOPE_KEYS,
} from '../src/lib/portal-permission-constants';

const migration = readFileSync(
  new URL('../supabase/migrations/20260429204000_portal_permissions_assignments.sql', import.meta.url),
  'utf8',
);
const portalPermissions = readFileSync(
  new URL('../src/lib/portal-permissions.ts', import.meta.url),
  'utf8',
);
const employeeDetail = readFileSync(
  new URL('../src/app/(app)/employees/[id]/employee-detail-client.tsx', import.meta.url),
  'utf8',
);
const inviteActions = readFileSync(
  new URL('../src/lib/invites/actions.ts', import.meta.url),
  'utf8',
);
const calendarActions = readFileSync(
  new URL('../src/lib/calendar/actions.ts', import.meta.url),
  'utf8',
);
const budgetActions = readFileSync(
  new URL('../src/lib/budgets/actions.ts', import.meta.url),
  'utf8',
);
const fundsActions = readFileSync(
  new URL('../src/lib/funds/actions.ts', import.meta.url),
  'utf8',
);

describe('user portal permissions phase two', () => {
  it('defines the requested page, action, and scope contract', () => {
    expect(PORTAL_PAGE_KEYS).toEqual([
      'dashboard',
      'budgets',
      'submit_invoices',
      'cash_collections',
      'expenses',
      'calendar',
      'restricted_funds',
      'income_register',
      'expense_register',
      'documents',
    ]);
    expect(PORTAL_ACTION_KEYS).toContain('approve');
    expect(PORTAL_ACTION_KEYS).toContain('delete_own');
    expect(PORTAL_SCOPE_KEYS).toEqual([
      'all_workspace',
      'assigned_budgets',
      'assigned_funds',
      'assigned_categories',
      'own_records',
    ]);
  });

  it('seeds system presets and assignment tables with RLS', () => {
    expect(migration).toContain('is_system_preset boolean not null default false');
    for (const preset of ['Youth Leader', 'Cafe Lead', 'Maintenance Lead', 'Cash Counter', 'Trustee Viewer', 'Finance Assistant', 'Read Only User']) {
      expect(migration).toContain(preset);
    }
    for (const table of ['user_budget_assignments', 'user_fund_assignments', 'user_category_assignments', 'user_card_assignments']) {
      expect(migration).toContain(`create table if not exists public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it('blocks server access without permission and enforces scopes', () => {
    expect(portalPermissions).toContain('export class PortalPermissionError');
    expect(portalPermissions).toContain('Portal permissions have not been configured for this user.');
    expect(portalPermissions).toContain("requestedScope === 'assigned_budgets'");
    expect(portalPermissions).toContain("requestedScope === 'assigned_funds'");
    expect(portalPermissions).toContain("requestedScope === 'assigned_categories'");
    expect(portalPermissions).toContain("requestedScope === 'own_records'");
  });

  it('applies server-side guards to high-risk portal entry points', () => {
    expect(calendarActions).toContain('enforcePortalPermissionForContext');
    expect(budgetActions).toContain("'budgets', 'view', { scope: 'assigned_budgets'");
    expect(fundsActions).toContain("'restricted_funds', 'view', { scope: 'assigned_funds'");
  });

  it('adds admin UI for presets, toggles, assignments, and effective permissions', () => {
    expect(employeeDetail).toContain('Permission preset');
    expect(employeeDetail).toContain('PORTAL_PAGE_KEYS.map');
    expect(employeeDetail).toContain('PORTAL_ACTION_KEYS.map');
    expect(employeeDetail).toContain('PORTAL_SCOPE_KEYS.map');
    expect(employeeDetail).toContain('Budget assignment table');
    expect(employeeDetail).toContain('Fund assignment table');
    expect(employeeDetail).toContain('Category assignment table');
    expect(employeeDetail).toContain('Card assignment table');
    expect(employeeDetail).toContain('Effective permissions');
    for (const tab of ['Budgets', 'Submissions', 'Transactions', 'Cards', 'Calendar', 'Activity / Audit']) {
      expect(employeeDetail).toContain(tab);
    }
  });

  it('keeps portal permission management admin-only', () => {
    expect(inviteActions).toContain('ensureAdminContext');
    expect(inviteActions).toContain('saveEmployeePortalPermissions');
    expect(inviteActions).toContain("action: 'update_portal_permissions'");
  });
});
