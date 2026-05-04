import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const monitoring = readFileSync(
  new URL('../src/lib/employees/monitoring.ts', import.meta.url),
  'utf8',
);
const monitoringTypes = readFileSync(
  new URL('../src/lib/employees/monitoring-types.ts', import.meta.url),
  'utf8',
);
const employeePage = readFileSync(
  new URL('../src/app/(app)/employees/[id]/page.tsx', import.meta.url),
  'utf8',
);
const employeeDetail = readFileSync(
  new URL('../src/app/(app)/employees/[id]/employee-detail-client.tsx', import.meta.url),
  'utf8',
);
const monitoringTabs = readFileSync(
  new URL('../src/app/(app)/employees/[id]/employee-monitoring-tabs.tsx', import.meta.url),
  'utf8',
);
const inviteActions = readFileSync(
  new URL('../src/lib/invites/actions.ts', import.meta.url),
  'utf8',
);

describe('admin user monitoring', () => {
  it('creates an admin-only monitoring loader and typed contract', () => {
    expect(monitoring).toContain('export async function getEmployeeMonitoringData');
    expect(monitoring).toContain("if (ctx.role !== 'admin')");
    expect(monitoring).toContain('Only admins can view employee monitoring.');
    expect(monitoring).toContain("employee.organisation_id !== ctx.orgId");
    expect(monitoringTypes).toContain('export interface EmployeeMonitoringData');
    expect(monitoringTypes).toContain('EmployeeMonitoringOverview');
    expect(monitoringTypes).toContain('EmployeeBudgetUsageRow');
    expect(monitoringTypes).toContain('EmployeeMonitoringActivityItem');
  });

  it('resolves portal user access from permissions and accepted invites', () => {
    expect(monitoring).toContain("from('portal_user_permissions')");
    expect(monitoring).toContain("from('organisation_invites')");
    expect(monitoring).toContain('acceptedInvite?.accepted_by');
    expect(monitoring).toContain('normalizePortalPermissions');
    expect(monitoring).toContain('emptyMonitoringData');
  });

  it('calculates assigned budget usage, pending amounts, remaining value, and overspend risk', () => {
    expect(monitoring).toContain("from('user_budget_assignments')");
    expect(monitoring).toContain("from('budget_lines')");
    expect(monitoring).toContain("from('journal_lines')");
    expect(monitoring).toContain("from('portal_expense_submissions')");
    expect(monitoring).toContain("from('invoice_submissions')");
    expect(monitoring).toContain('remainingPence = annualAllocationPence - usedPence - pendingPence');
    expect(monitoring).toContain("overspendRisk: remainingPence < 0 ? 'overspent'");
    expect(monitoringTabs).toContain('Budget Usage');
  });

  it('loads user submissions and related manual, bank, and card transactions', () => {
    expect(monitoring).toContain("from('invoice_submissions')");
    expect(monitoring).toContain("from('portal_expense_submissions')");
    expect(monitoring).toContain("from('cash_collection_submissions')");
    expect(monitoring).toContain("from('manual_transactions')");
    expect(monitoring).toContain("from('bank_lines')");
    expect(monitoring).toContain("from('user_card_assignments')");
    expect(monitoringTabs).toContain('/workflows/invoices');
    expect(monitoringTabs).toContain('/workflows/portal-expenses');
    expect(monitoringTabs).toContain('/cash/collection-submissions');
  });

  it('builds card, calendar, task, notification, and audit monitoring views', () => {
    expect(monitoring).toContain("from('calendar_events')");
    expect(monitoring).toContain("from('calendar_event_attendees')");
    expect(monitoring).toContain("from('portal_tasks')");
    expect(monitoring).toContain("from('portal_notifications')");
    expect(monitoring).toContain("from('audit_log')");
    expect(monitoring).toContain('sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))');
    expect(monitoringTabs).toContain('Activity / Audit');
  });

  it('expands employee detail tabs while keeping portal management separate', () => {
    for (const tab of ['Budgets', 'Submissions', 'Transactions', 'Cards', 'Calendar', 'Activity / Audit']) {
      expect(employeeDetail).toContain(tab);
    }
    expect(employeeDetail).toContain('EmployeeMonitoringSummaryCards');
    expect(employeeDetail).toContain('EmployeeMonitoringBudgets');
    expect(employeeDetail).toContain('EmployeeMonitoringSubmissions');
    expect(employeeDetail).toContain('EmployeeMonitoringTransactions');
    expect(employeeDetail).toContain('EmployeeMonitoringCards');
    expect(employeeDetail).toContain('EmployeeMonitoringCalendar');
    expect(employeeDetail).toContain('EmployeeMonitoringActivity');
    expect(employeeDetail).toContain('Portal Access');
  });

  it('does not pass monitoring data to non-admin clients', () => {
    expect(employeePage).toContain("const monitoringData = canManagePortal");
    expect(employeePage).toContain("getEmployeeMonitoringData(employee.id)");
    expect(employeePage).toContain(': null');
    expect(employeeDetail).toContain('canManagePortal && activeTab ===');
    expect(monitoring).toContain("eq('workspace_id', params.workspaceId)");
    expect(monitoring).toContain("eq('organisation_id', params.workspaceId)");
  });

  it('keeps permission changes audited through the existing portal access save flow', () => {
    expect(inviteActions).toContain('saveEmployeePortalPermissions');
    expect(inviteActions).toContain("action: 'update_portal_permissions'");
    expect(inviteActions).toContain('budgetAssignments');
    expect(inviteActions).toContain('fundAssignments');
    expect(inviteActions).toContain('categoryAssignments');
    expect(inviteActions).toContain('cardAssignments');
  });
});
