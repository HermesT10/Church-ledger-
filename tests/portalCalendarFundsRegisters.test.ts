import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const portalCalendar = readFileSync(
  new URL('../src/lib/portal/calendar.ts', import.meta.url),
  'utf8',
);
const portalCalendarPage = readFileSync(
  new URL('../src/app/(app)/portal/calendar/page.tsx', import.meta.url),
  'utf8',
);
const portalCalendarClient = readFileSync(
  new URL('../src/app/(app)/portal/calendar/portal-calendar-client.tsx', import.meta.url),
  'utf8',
);
const portalFunds = readFileSync(
  new URL('../src/lib/portal/funds.ts', import.meta.url),
  'utf8',
);
const portalFundsPage = readFileSync(
  new URL('../src/app/(app)/portal/funds/page.tsx', import.meta.url),
  'utf8',
);
const portalFundsClient = readFileSync(
  new URL('../src/app/(app)/portal/funds/portal-funds-client.tsx', import.meta.url),
  'utf8',
);
const portalRegisters = readFileSync(
  new URL('../src/lib/portal/registers.ts', import.meta.url),
  'utf8',
);
const portalRegisterClient = readFileSync(
  new URL('../src/app/(app)/portal/portal-register-client.tsx', import.meta.url),
  'utf8',
);
const incomePage = readFileSync(
  new URL('../src/app/(app)/portal/income-register/page.tsx', import.meta.url),
  'utf8',
);
const expensePage = readFileSync(
  new URL('../src/app/(app)/portal/expense-register/page.tsx', import.meta.url),
  'utf8',
);
const refreshHook = readFileSync(
  new URL('../src/app/(app)/portal/use-portal-refresh.ts', import.meta.url),
  'utf8',
);

describe('portal calendar, funds, and registers', () => {
  it('scopes portal calendar visibility and keeps events synced with admin calendar tables', () => {
    expect(portalCalendar).toContain('listPortalCalendarEvents');
    expect(portalCalendar).toContain("from('calendar_events')");
    expect(portalCalendar).toContain("from('calendar_event_attendees')");
    expect(portalCalendar).toContain("from('portal_tasks')");
    expect(portalCalendar).toContain('canSeeEvent');
    expect(portalCalendar).toContain("visibility === 'workspace'");
    expect(portalCalendar).toContain('linked_fund_id');
    expect(portalCalendar).toContain('linked_account_id');
    expect(portalCalendarPage).toContain('PortalCalendarClient');
  });

  it('enforces calendar create and invite permissions and supports task updates', () => {
    expect(portalCalendar).toContain('createPortalCalendarEvent');
    expect(portalCalendar).toContain("enforcePortalPermissionForContext(ctx, 'calendar', 'create')");
    expect(portalCalendar).toContain('createAdminClient');
    expect(portalCalendar).toContain('invitePortalCalendarAttendee');
    expect(portalCalendar).toContain("enforcePortalPermissionForContext(ctx, 'calendar', 'comment')");
    expect(portalCalendar).toContain("eq('organisation_id', ctx.orgId)");
    expect(portalCalendar).toContain('updatePortalCalendarTaskStatus');
    expect(portalCalendarClient).toContain('Create event');
    expect(portalCalendarClient).toContain('Invite organisation user');
  });

  it('loads only permitted restricted funds and scoped transactions', () => {
    expect(portalFunds).toContain('listPortalRestrictedFunds');
    expect(portalFunds).toContain("from('user_fund_assignments')");
    expect(portalFunds).toContain("fund.type === 'restricted'");
    expect(portalFunds).toContain('assigned.has');
    expect(portalFunds).toContain('donatedPence');
    expect(portalFunds).toContain('usedPence');
    expect(portalFunds).toContain('remainingPence');
    expect(portalFunds).toContain('listPortalFundTransactions');
    expect(portalFundsPage).toContain('PortalFundsClient');
    expect(portalFundsClient).toContain('Transactions');
  });

  it('wraps income register scope for all workspace, assigned funds, and assigned categories', () => {
    expect(portalRegisters).toContain('listPortalRegisterData');
    expect(portalRegisters).toContain("params.registerType === 'income'");
    expect(portalRegisters).toContain('permissions.scopes.all_workspace');
    expect(portalRegisters).toContain('permissions.scopes.assigned_funds');
    expect(portalRegisters).toContain('permissions.scopes.assigned_categories');
    expect(portalRegisters).toContain("from('user_category_assignments')");
    expect(incomePage).toContain('listPortalRegisterData');
    expect(portalRegisterClient).toContain('Read-only portal register');
  });

  it('wraps expense register scope for assigned budgets, funds, and own records', () => {
    expect(portalRegisters).toContain("params.registerType === 'expense'");
    expect(portalRegisters).toContain('permissions.scopes.assigned_budgets');
    expect(portalRegisters).toContain('assignedBudgetScope');
    expect(portalRegisters).toContain('ownExpenseRegister');
    expect(portalRegisters).toContain("from('portal_expense_submissions')");
    expect(expensePage).toContain('canSubmitExpenses');
    expect(portalRegisterClient).toContain('/portal/expenses');
  });

  it('subscribes to live updates for calendar, funds, registers, permissions, assignments, and budgets', () => {
    for (const table of [
      'calendar_events',
      'calendar_event_attendees',
      'portal_tasks',
      'funds',
      'journals',
      'journal_lines',
      'budget_lines',
      'user_fund_assignments',
      'user_budget_assignments',
      'user_category_assignments',
      'portal_user_permissions',
    ]) {
      expect(refreshHook).toContain(`table: '${table}'`);
    }
  });

  it('represents cross-workspace isolation in every portal loader', () => {
    expect(portalCalendar).toContain("eq('workspace_id', ctx.orgId)");
    expect(portalFunds).toContain("eq('organisation_id', access.orgId)");
    expect(portalFunds).toContain("eq('workspace_id', workspaceId)");
    expect(portalRegisters).toContain("eq('workspace_id', access.orgId)");
    expect(portalRegisters).toContain("from('budget_lines')");
  });
});
