import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260429231500_portal_dashboard.sql', import.meta.url),
  'utf8',
);
const dashboardLoader = readFileSync(
  new URL('../src/lib/portal/dashboard.ts', import.meta.url),
  'utf8',
);
const dashboardClient = readFileSync(
  new URL('../src/app/(app)/portal/dashboard/portal-dashboard-client.tsx', import.meta.url),
  'utf8',
);
const portalLayout = readFileSync(
  new URL('../src/app/(app)/portal/layout.tsx', import.meta.url),
  'utf8',
);
const refreshHook = readFileSync(
  new URL('../src/app/(app)/portal/use-portal-refresh.ts', import.meta.url),
  'utf8',
);
const notifications = readFileSync(
  new URL('../src/lib/portal/notifications.ts', import.meta.url),
  'utf8',
);
const tasks = readFileSync(
  new URL('../src/lib/portal/tasks.ts', import.meta.url),
  'utf8',
);
const workflows = readFileSync(
  new URL('../src/lib/workflows/actions.ts', import.meta.url),
  'utf8',
);
const cash = readFileSync(
  new URL('../src/lib/cash/actions.ts', import.meta.url),
  'utf8',
);

describe('invited user portal dashboard', () => {
  it('creates RLS-protected tasks and notifications tables', () => {
    expect(migration).toContain('create table if not exists public.portal_tasks');
    expect(migration).toContain("status in ('open', 'in_progress', 'done')");
    expect(migration).toContain('calendar_event_id uuid references public.calendar_events');
    expect(migration).toContain('create table if not exists public.portal_notifications');
    expect(migration).toContain('alter table public.portal_tasks enable row level security');
    expect(migration).toContain('alter table public.portal_notifications enable row level security');
    expect(migration).toContain('assigned_to = auth.uid()');
    expect(migration).toContain('user_id = auth.uid()');
  });

  it('loads only scoped portal dashboard data', () => {
    expect(dashboardLoader).toContain('getPortalDashboardData');
    expect(dashboardLoader).toContain("from('user_budget_assignments')");
    expect(dashboardLoader).toContain("from('user_fund_assignments')");
    expect(dashboardLoader).toContain("eq('submitted_by', userId)");
    expect(dashboardLoader).toContain("from('portal_expense_submissions')");
    expect(dashboardLoader).toContain("from('cash_collection_submissions')");
    expect(dashboardLoader).toContain("canUsePortalFeature(context, 'restricted_funds', 'view', 'assigned_funds')");
  });

  it('renders the required dashboard widgets and hides funds by data availability', () => {
    for (const label of ['My Assigned Budgets', 'My Tasks', 'Upcoming Events', 'Pending Submissions', 'Approved/Paid Updates', 'Admin Notifications']) {
      expect(dashboardClient).toContain(label);
    }
    expect(dashboardClient).toContain('Restricted Funds Summary');
    expect(dashboardClient).toContain('data.restrictedFunds.length > 0');
  });

  it('links tasks to calendar events and supports task status updates', () => {
    expect(tasks).toContain("from('portal_tasks')");
    expect(tasks).toContain('calendar_events(id, title, start_at)');
    expect(tasks).toContain('updatePortalTaskStatus');
    expect(dashboardClient).toContain("(['open', 'in_progress', 'done'] as PortalTaskStatus[])");
  });

  it('uses realtime subscriptions with focus, visibility, and interval fallback', () => {
    expect(refreshHook).toContain("channel(`portal-dashboard:");
    expect(refreshHook).toContain("table: 'portal_tasks'");
    expect(refreshHook).toContain("table: 'portal_notifications'");
    expect(refreshHook).toContain("table: 'portal_user_permissions'");
    expect(refreshHook).toContain("window.addEventListener('focus'");
    expect(refreshHook).toContain("document.addEventListener('visibilitychange'");
    expect(refreshHook).toContain('window.setInterval');
  });

  it('wires notifications into admin actions', () => {
    expect(notifications).toContain('createPortalNotification');
    expect(workflows).toContain("type: decision === 'approved' ? 'invoice_approved' : 'invoice_rejected'");
    expect(workflows).toContain("type: decision === 'approved' ? 'expense_approved' : 'expense_rejected'");
    expect(cash).toContain("type: 'cash_collection_reviewed'");
  });

  it('adds permission-scoped portal navigation and routes', () => {
    expect(portalLayout).toContain('PORTAL_NAV');
    expect(portalLayout).toContain("page: 'dashboard'");
    expect(portalLayout).toContain("page: 'budgets'");
    expect(portalLayout).toContain("page: 'restricted_funds'");
    expect(portalLayout).toContain('access.permissions.pages[item.page]');
  });
});
