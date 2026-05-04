import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getCurrentPortalAccess, canUsePortalFeature } from '@/lib/portal/current-user';
import { listPortalNotifications } from '@/lib/portal/notifications';
import { listPortalTasks } from '@/lib/portal/tasks';
import type {
  PortalAssignedBudget,
  PortalDashboardData,
  PortalRestrictedFundSummary,
  PortalSubmission,
  PortalUpcomingEvent,
} from '@/lib/portal/types';

const MONTH_KEYS = [
  'm01_pence',
  'm02_pence',
  'm03_pence',
  'm04_pence',
  'm05_pence',
  'm06_pence',
  'm07_pence',
  'm08_pence',
  'm09_pence',
  'm10_pence',
  'm11_pence',
  'm12_pence',
] as const;

function sumBudgetLine(row: Record<string, unknown>) {
  return MONTH_KEYS.reduce((sum, key) => sum + Number(row[key] ?? 0), 0);
}

async function getAssignedBudgets(workspaceId: string, userId: string): Promise<PortalAssignedBudget[]> {
  const supabase = await createClient();
  const { data: assignments } = await supabase
    .from('user_budget_assignments')
    .select('budget_id, can_view, can_submit_against, spending_limit, budgets(id, name, year, status)')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .eq('can_view', true);

  const budgetIds = [...new Set((assignments ?? []).map((row) => row.budget_id as string).filter(Boolean))];
  if (budgetIds.length === 0) return [];

  const { data: budgetLines } = await supabase
    .from('budget_lines')
    .select('budget_id, account_id, fund_id, m01_pence, m02_pence, m03_pence, m04_pence, m05_pence, m06_pence, m07_pence, m08_pence, m09_pence, m10_pence, m11_pence, m12_pence')
    .in('budget_id', budgetIds);

  const budgetTotals = new Map<string, number>();
  for (const line of (budgetLines ?? []) as Record<string, unknown>[]) {
    const budgetId = line.budget_id as string;
    budgetTotals.set(budgetId, (budgetTotals.get(budgetId) ?? 0) + sumBudgetLine(line));
  }

  const lineRows = (budgetLines ?? []) as Record<string, unknown>[];
  const budgetMatches = new Map<string, { budgetId: string; fundId: string | null }[]>();
  for (const line of lineRows) {
    const accountId = line.account_id as string;
    const matches = budgetMatches.get(accountId) ?? [];
    matches.push({ budgetId: line.budget_id as string, fundId: (line.fund_id as string) ?? null });
    budgetMatches.set(accountId, matches);
  }

  const accountIds = [...budgetMatches.keys()];
  const { data: actualLines } = accountIds.length
    ? await supabase
        .from('journal_lines')
        .select('account_id, fund_id, debit_pence, credit_pence, journals!inner(status)')
        .eq('organisation_id', workspaceId)
        .eq('journals.status', 'posted')
        .in('account_id', accountIds)
    : { data: [] };

  const actualTotals = new Map<string, number>();
  for (const line of (actualLines ?? []) as Record<string, unknown>[]) {
    const matches = budgetMatches.get(line.account_id as string) ?? [];
    for (const match of matches) {
      if (match.fundId && match.fundId !== line.fund_id) continue;
      const net = Number(line.debit_pence ?? 0) - Number(line.credit_pence ?? 0);
      actualTotals.set(match.budgetId, (actualTotals.get(match.budgetId) ?? 0) + Math.abs(net));
    }
  }

  return (assignments ?? []).map((row) => {
    const budget = Array.isArray(row.budgets) ? row.budgets[0] : row.budgets;
    const budgetId = row.budget_id as string;
    const budgetPence = budgetTotals.get(budgetId) ?? 0;
    const usedPence = actualTotals.get(budgetId) ?? 0;
    return {
      id: budgetId,
      name: budget?.name ?? 'Assigned budget',
      year: budget?.year ?? new Date().getFullYear(),
      status: budget?.status ?? 'active',
      canView: Boolean(row.can_view),
      canSubmitAgainst: Boolean(row.can_submit_against),
      spendingLimit: row.spending_limit === null ? null : Number(row.spending_limit ?? 0),
      budgetPence,
      usedPence,
      remainingPence: budgetPence - usedPence,
    };
  });
}

async function getUpcomingEvents(workspaceId: string, userId: string): Promise<PortalUpcomingEvent[]> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const end = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('calendar_events')
    .select('id, title, start_at, end_at, status, calendar_event_attendees(response, attendee_user_id)')
    .eq('workspace_id', workspaceId)
    .gte('start_at', now)
    .lte('start_at', end)
    .neq('status', 'cancelled')
    .order('start_at', { ascending: true })
    .limit(8);

  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const attendees = (row.calendar_event_attendees ?? []) as { response?: string; attendee_user_id?: string }[];
    const attendee = attendees.find((item) => item.attendee_user_id === userId);
    return {
      id: row.id as string,
      title: row.title as string,
      startAt: row.start_at as string,
      endAt: (row.end_at as string) ?? null,
      status: row.status as string,
      response: attendee?.response ?? null,
      href: `/portal/calendar?event=${row.id as string}`,
    };
  });
}

async function getWorkflowSubmissions(workspaceId: string, userId: string) {
  const supabase = await createClient();
  const [invoicesRes, expensesRes, cashRes] = await Promise.all([
    supabase
      .from('invoice_submissions')
      .select('id, supplier_name, amount_pence, status, created_at')
      .eq('organisation_id', workspaceId)
      .eq('submitted_by', userId)
      .order('created_at', { ascending: false })
      .limit(12),
    supabase
      .from('portal_expense_submissions')
      .select('id, detail, amount_pence, status, created_at')
      .eq('workspace_id', workspaceId)
      .eq('submitted_by', userId)
      .order('created_at', { ascending: false })
      .limit(12),
    supabase
      .from('cash_collection_submissions')
      .select('id, detail, amount_pence, status, created_at')
      .eq('workspace_id', workspaceId)
      .eq('submitted_by', userId)
      .order('created_at', { ascending: false })
      .limit(12),
  ]);

  const invoices: PortalSubmission[] = (invoicesRes.data ?? []).map((row) => ({
    id: row.id,
    type: 'invoice',
    title: row.supplier_name,
    amountPence: row.amount_pence,
    status: row.status,
    createdAt: row.created_at,
    href: '/portal/invoices',
  }));
  const expenses: PortalSubmission[] = (expensesRes.data ?? []).map((row) => ({
    id: row.id,
    type: 'expense',
    title: row.detail,
    amountPence: row.amount_pence,
    status: row.status,
    createdAt: row.created_at,
    href: '/portal/expenses',
  }));
  const cashCollections: PortalSubmission[] = (cashRes.data ?? []).map((row) => ({
    id: row.id,
    type: 'cash_collection',
    title: row.detail,
    amountPence: row.amount_pence,
    status: row.status,
    createdAt: row.created_at,
    href: '/portal/cash-collections',
  }));

  const all = [...invoices, ...expenses, ...cashCollections].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    invoices,
    expenses,
    cashCollections,
    pendingSubmissions: all.filter((item) => ['draft', 'submitted', 'under_review', 'change_requested', 'changes_requested'].includes(item.status)).slice(0, 8),
    approvedPaidUpdates: all.filter((item) => ['approved', 'reviewed', 'rejected', 'scheduled_for_payment', 'posted', 'awaiting_bank_match', 'paid', 'banked', 'reconciled', 'voided'].includes(item.status)).slice(0, 8),
  };
}

async function getRestrictedFunds(workspaceId: string, userId: string): Promise<PortalRestrictedFundSummary[]> {
  const supabase = await createClient();
  const { data: assignments } = await supabase
    .from('user_fund_assignments')
    .select('fund_id, can_submit_against, funds(id, name)')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .eq('can_view', true);
  const fundIds = [...new Set((assignments ?? []).map((row) => row.fund_id as string).filter(Boolean))];
  if (fundIds.length === 0) return [];

  const { data: lines } = await supabase
    .from('journal_lines')
    .select('fund_id, debit_pence, credit_pence, journals!inner(status)')
    .eq('organisation_id', workspaceId)
    .eq('journals.status', 'posted')
    .in('fund_id', fundIds);

  const balances = new Map<string, number>();
  for (const line of (lines ?? []) as Record<string, unknown>[]) {
    const fundId = line.fund_id as string;
    balances.set(fundId, (balances.get(fundId) ?? 0) + Number(line.credit_pence ?? 0) - Number(line.debit_pence ?? 0));
  }

  return (assignments ?? []).map((row) => {
    const fund = Array.isArray(row.funds) ? row.funds[0] : row.funds;
    return {
      id: row.fund_id,
      name: fund?.name ?? 'Restricted fund',
      balancePence: balances.get(row.fund_id) ?? 0,
      canSubmitAgainst: Boolean(row.can_submit_against),
    };
  });
}

export async function getPortalDashboardData(): Promise<PortalDashboardData> {
  const context = await getCurrentPortalAccess();
  const [assignedBudgets, tasks, upcomingEvents, submissions, notifications, restrictedFunds] = await Promise.all([
    canUsePortalFeature(context, 'budgets', 'view') ? getAssignedBudgets(context.orgId, context.user.id) : Promise.resolve([]),
    listPortalTasks(),
    canUsePortalFeature(context, 'calendar', 'view') ? getUpcomingEvents(context.orgId, context.user.id) : Promise.resolve([]),
    getWorkflowSubmissions(context.orgId, context.user.id),
    listPortalNotifications(),
    canUsePortalFeature(context, 'restricted_funds', 'view', 'assigned_funds')
      ? getRestrictedFunds(context.orgId, context.user.id)
      : Promise.resolve([]),
  ]);

  return {
    permissions: context.permissions,
    assignedBudgets,
    tasks,
    upcomingEvents,
    notifications,
    restrictedFunds,
    ...submissions,
  };
}
