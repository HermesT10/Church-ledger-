'use server';

import { getActiveOrg } from '@/lib/org';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePortalPermissions } from '@/lib/portal-permissions';
import type {
  EmployeeBudgetUsageRow,
  EmployeeMonitoringActivityItem,
  EmployeeMonitoringCalendarItem,
  EmployeeMonitoringCard,
  EmployeeMonitoringData,
  EmployeeMonitoringSubmission,
  EmployeeMonitoringTransaction,
} from './monitoring-types';

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

function emptyMonitoringData(): EmployeeMonitoringData {
  return {
    overview: {
      monitoredUserId: null,
      latestInviteStatus: null,
      enabledPageCount: 0,
      enabledActionCount: 0,
      enabledScopeCount: 0,
      budgetAssignmentCount: 0,
      fundAssignmentCount: 0,
      cardAssignmentCount: 0,
    },
    permissions: null,
    budgetUsage: [],
    submissions: [],
    transactions: [],
    cards: [],
    calendar: [],
    activity: [],
  };
}

function pence(value: unknown) {
  return Number(value ?? 0);
}

function rowAmount(row: Record<string, unknown>, accountType?: string | null) {
  if (accountType === 'income') return pence(row.credit_pence) - pence(row.debit_pence);
  return pence(row.debit_pence) - pence(row.credit_pence);
}

function enabledCount(value: Record<string, boolean> | undefined) {
  return Object.values(value ?? {}).filter(Boolean).length;
}

function activityItem(params: {
  id: string;
  type: string;
  title: string;
  occurredAt: string | null | undefined;
  description?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  severity?: EmployeeMonitoringActivityItem['severity'];
  href?: string | null;
}): EmployeeMonitoringActivityItem | null {
  if (!params.occurredAt) return null;
  return {
    id: params.id,
    type: params.type,
    title: params.title,
    description: params.description ?? null,
    occurredAt: params.occurredAt,
    sourceType: params.sourceType ?? null,
    sourceId: params.sourceId ?? null,
    severity: params.severity ?? 'info',
    href: params.href ?? null,
  };
}

async function resolveMonitoredUser(params: {
  employeeId: string;
  workspaceId: string;
}) {
  const admin = createAdminClient();
  const [permissionRes, inviteRes] = await Promise.all([
    admin
      .from('portal_user_permissions')
      .select('id, user_id, permissions, employee_id, permission_preset_id')
      .eq('workspace_id', params.workspaceId)
      .eq('employee_id', params.employeeId)
      .order('user_id', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('organisation_invites')
      .select('id, status, accepted_by, accepted_at, created_at, sent_at, revoked_at, invited_email, invited_full_name')
      .eq('workspace_id', params.workspaceId)
      .eq('employee_id', params.employeeId)
      .order('created_at', { ascending: false }),
  ]);

  const latestInvite = inviteRes.data?.[0] ?? null;
  const acceptedInvite = inviteRes.data?.find((invite) => invite.accepted_by) ?? null;
  const userId = permissionRes.data?.user_id ?? acceptedInvite?.accepted_by ?? null;
  const permissions = permissionRes.data?.permissions ? normalizePortalPermissions(permissionRes.data.permissions) : null;

  return {
    userId,
    permissions,
    latestInvite,
    invites: inviteRes.data ?? [],
  };
}

async function loadBudgetUsage(params: {
  workspaceId: string;
  userId: string | null;
}): Promise<EmployeeBudgetUsageRow[]> {
  if (!params.userId) return [];
  const admin = createAdminClient();
  const { data: assignments } = await admin
    .from('user_budget_assignments')
    .select('id, budget_id, budget_category_id, spending_limit, budgets(id, name)')
    .eq('workspace_id', params.workspaceId)
    .eq('user_id', params.userId);
  const rows = (assignments ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return [];

  const budgetIds = [...new Set(rows.map((row) => row.budget_id as string).filter(Boolean))];
  const accountIds = [...new Set(rows.map((row) => row.budget_category_id as string).filter(Boolean))];
  const [{ data: lines }, { data: actuals }, { data: pendingExpenses }, { data: pendingInvoices }] = await Promise.all([
    admin
      .from('budget_lines')
      .select('budget_id, account_id, fund_id, m01_pence, m02_pence, m03_pence, m04_pence, m05_pence, m06_pence, m07_pence, m08_pence, m09_pence, m10_pence, m11_pence, m12_pence, accounts(id, code, name)')
      .in('budget_id', budgetIds),
    accountIds.length
      ? admin
          .from('journal_lines')
          .select('id, journal_id, account_id, fund_id, description, debit_pence, credit_pence, journals!inner(journal_date, memo, status)')
          .eq('organisation_id', params.workspaceId)
          .eq('journals.status', 'posted')
          .in('account_id', accountIds)
      : Promise.resolve({ data: [] }),
    admin
      .from('portal_expense_submissions')
      .select('id, budget_id, account_id, amount_pence, detail, status, created_at')
      .eq('workspace_id', params.workspaceId)
      .eq('submitted_by', params.userId)
      .in('status', ['submitted', 'approved', 'awaiting_bank_match']),
    admin
      .from('invoice_submissions')
      .select('id, budget_id, account_id, amount_pence, supplier_name, status, created_at')
      .eq('organisation_id', params.workspaceId)
      .eq('submitted_by', params.userId)
      .in('status', ['submitted', 'under_review', 'approved', 'scheduled_for_payment']),
  ]);

  const budgetLines = (lines ?? []) as Record<string, unknown>[];
  const actualLines = (actuals ?? []) as Record<string, unknown>[];
  const pendingRows = [
    ...((pendingExpenses ?? []) as Record<string, unknown>[]),
    ...((pendingInvoices ?? []) as Record<string, unknown>[]),
  ];

  return rows.map((assignment) => {
    const budget = Array.isArray(assignment.budgets) ? assignment.budgets[0] : assignment.budgets as { name?: string | null } | null;
    const budgetId = assignment.budget_id as string;
    const categoryId = (assignment.budget_category_id as string | null) ?? null;
    const matchingLines = budgetLines.filter((line) =>
      line.budget_id === budgetId && (!categoryId || line.account_id === categoryId),
    );
    const monthlyAllocationPence = MONTH_KEYS.map((key) =>
      matchingLines.reduce((sum, line) => sum + pence(line[key]), 0),
    );
    const annualAllocationPence = monthlyAllocationPence.reduce((sum, month) => sum + month, 0);
    const usedActualLines = actualLines.filter((line) => !categoryId || line.account_id === categoryId);
    const usedPence = usedActualLines.reduce((sum, line) => sum + Math.abs(rowAmount(line)), 0);
    const pendingPence = pendingRows
      .filter((row) => row.budget_id === budgetId && (!categoryId || row.account_id === categoryId))
      .reduce((sum, row) => sum + pence(row.amount_pence), 0);
    const remainingPence = annualAllocationPence - usedPence - pendingPence;
    const account = matchingLines
      .map((line) => Array.isArray(line.accounts) ? line.accounts[0] : line.accounts)
      .find(Boolean) as { code?: string | null; name?: string | null } | undefined;
    const linkedTransactions: EmployeeMonitoringTransaction[] = usedActualLines.slice(0, 8).map((line) => {
      const journal = Array.isArray(line.journals) ? line.journals[0] : line.journals as { journal_date?: string; memo?: string | null } | null;
      return {
        id: line.id as string,
        type: 'journal_line',
        date: journal?.journal_date ?? '',
        description: (line.description as string | null) ?? journal?.memo ?? 'Posted transaction',
        amountPence: Math.abs(rowAmount(line)),
        status: 'posted',
        reconciled: true,
        href: line.journal_id ? `/journals/${line.journal_id as string}` : null,
      };
    });

    return {
      assignmentId: assignment.id as string,
      budgetId,
      budgetName: budget?.name ?? 'Assigned budget',
      categoryId,
      categoryName: account ? `${account.code ?? ''} ${account.name ?? ''}`.trim() : null,
      annualAllocationPence,
      monthlyAllocationPence,
      usedPence,
      pendingPence,
      remainingPence,
      overspendRisk: remainingPence < 0 ? 'overspent' : remainingPence < annualAllocationPence * 0.1 ? 'attention' : 'ok',
      linkedTransactions,
    };
  });
}

async function loadAssignmentCounts(params: {
  workspaceId: string;
  userId: string | null;
}) {
  if (!params.userId) return { fundAssignmentCount: 0 };
  const admin = createAdminClient();
  const { count } = await admin
    .from('user_fund_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', params.workspaceId)
    .eq('user_id', params.userId);
  return { fundAssignmentCount: count ?? 0 };
}

async function loadSubmissions(params: {
  workspaceId: string;
  userId: string | null;
}): Promise<EmployeeMonitoringSubmission[]> {
  if (!params.userId) return [];
  const admin = createAdminClient();
  const [invoices, expenses, cash] = await Promise.all([
    admin
      .from('invoice_submissions')
      .select('id, supplier_name, amount_pence, status, created_at, submitted_at, admin_note, request_changes_note')
      .eq('organisation_id', params.workspaceId)
      .eq('submitted_by', params.userId)
      .order('created_at', { ascending: false }),
    admin
      .from('portal_expense_submissions')
      .select('id, detail, amount_pence, status, created_at, admin_notes, change_request_note')
      .eq('workspace_id', params.workspaceId)
      .eq('submitted_by', params.userId)
      .order('created_at', { ascending: false }),
    admin
      .from('cash_collection_submissions')
      .select('id, detail, amount_pence, status, created_at, admin_notes')
      .eq('workspace_id', params.workspaceId)
      .eq('submitted_by', params.userId)
      .order('created_at', { ascending: false }),
  ]);

  return [
    ...((invoices.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      type: 'invoice' as const,
      title: row.supplier_name as string,
      amountPence: pence(row.amount_pence),
      status: row.status as string,
      submittedAt: (row.submitted_at as string | null) ?? row.created_at as string,
      note: (row.admin_note as string | null) ?? (row.request_changes_note as string | null) ?? null,
      href: '/workflows/invoices',
    })),
    ...((expenses.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      type: 'expense' as const,
      title: row.detail as string,
      amountPence: pence(row.amount_pence),
      status: row.status as string,
      submittedAt: row.created_at as string,
      note: (row.admin_notes as string | null) ?? (row.change_request_note as string | null) ?? null,
      href: '/workflows/portal-expenses',
    })),
    ...((cash.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      type: 'cash_collection' as const,
      title: row.detail as string,
      amountPence: pence(row.amount_pence),
      status: row.status as string,
      submittedAt: row.created_at as string,
      note: (row.admin_notes as string | null) ?? null,
      href: '/cash/collection-submissions',
    })),
  ].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

async function loadTransactions(params: {
  workspaceId: string;
  userId: string | null;
}) {
  if (!params.userId) return { transactions: [] as EmployeeMonitoringTransaction[], expenseLinks: [] as Record<string, unknown>[] };
  const admin = createAdminClient();
  const [manualRes, expenseRes] = await Promise.all([
    admin
      .from('manual_transactions')
      .select('id, transaction_date, description, amount_pence, status, matched_bank_transaction_id')
      .eq('organisation_id', params.workspaceId)
      .eq('created_by', params.userId)
      .order('transaction_date', { ascending: false })
      .limit(50),
    admin
      .from('portal_expense_submissions')
      .select('id, detail, amount_pence, status, linked_manual_transaction_id, linked_bank_transaction_id, card_assignment_id, expense_date')
      .eq('workspace_id', params.workspaceId)
      .eq('submitted_by', params.userId)
      .not('linked_manual_transaction_id', 'is', null),
  ]);

  const manualIds = [
    ...((manualRes.data ?? []) as Record<string, unknown>[]).map((row) => row.id as string),
    ...((expenseRes.data ?? []) as Record<string, unknown>[]).map((row) => row.linked_manual_transaction_id as string).filter(Boolean),
  ];
  const bankIds = [
    ...((manualRes.data ?? []) as Record<string, unknown>[]).map((row) => row.matched_bank_transaction_id as string).filter(Boolean),
    ...((expenseRes.data ?? []) as Record<string, unknown>[]).map((row) => row.linked_bank_transaction_id as string).filter(Boolean),
  ];
  const [linkedManualRes, bankRes] = await Promise.all([
    manualIds.length
      ? admin
          .from('manual_transactions')
          .select('id, transaction_date, description, amount_pence, status, matched_bank_transaction_id')
          .eq('organisation_id', params.workspaceId)
          .in('id', [...new Set(manualIds)])
      : Promise.resolve({ data: [] }),
    bankIds.length
      ? admin
          .from('bank_lines')
          .select('id, txn_date, description, amount_pence, status, reconciled, allocated')
          .eq('workspace_id', params.workspaceId)
          .in('id', [...new Set(bankIds)])
      : Promise.resolve({ data: [] }),
  ]);

  const manualTransactions: EmployeeMonitoringTransaction[] = ((linkedManualRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    type: 'manual_transaction',
    date: row.transaction_date as string,
    description: row.description as string,
    amountPence: pence(row.amount_pence),
    status: row.status as string,
    reconciled: row.status === 'reconciled' || row.status === 'posted',
    href: `/transactions?transaction=${row.id as string}`,
  }));
  const bankTransactions: EmployeeMonitoringTransaction[] = ((bankRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    type: 'bank_line',
    date: row.txn_date as string,
    description: (row.description as string | null) ?? 'Bank transaction',
    amountPence: pence(row.amount_pence),
    status: row.status as string,
    reconciled: Boolean(row.reconciled || row.allocated),
    href: `/banking?line=${row.id as string}`,
  }));

  const byId = new Map([...manualTransactions, ...bankTransactions].map((row) => [`${row.type}:${row.id}`, row]));
  return { transactions: [...byId.values()].sort((a, b) => b.date.localeCompare(a.date)), expenseLinks: (expenseRes.data ?? []) as Record<string, unknown>[] };
}

async function loadCards(params: {
  workspaceId: string;
  userId: string | null;
  expenseLinks: Record<string, unknown>[];
  transactions: EmployeeMonitoringTransaction[];
}): Promise<EmployeeMonitoringCard[]> {
  if (!params.userId) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from('user_card_assignments')
    .select('id, card_name, last_four, spending_limit, status, bank_account_id, bank_accounts(name)')
    .eq('workspace_id', params.workspaceId)
    .eq('user_id', params.userId)
    .order('created_at', { ascending: false });

  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const bankAccount = Array.isArray(row.bank_accounts) ? row.bank_accounts[0] : row.bank_accounts as { name?: string | null } | null;
    const linkedExpenseRows = params.expenseLinks.filter((expense) => expense.card_assignment_id === row.id);
    const spentPence = linkedExpenseRows.reduce((sum, expense) => sum + pence(expense.amount_pence), 0);
    const linkedIds = new Set(linkedExpenseRows.flatMap((expense) => [
      expense.linked_manual_transaction_id ? `manual_transaction:${expense.linked_manual_transaction_id as string}` : null,
      expense.linked_bank_transaction_id ? `bank_line:${expense.linked_bank_transaction_id as string}` : null,
    ].filter(Boolean)));
    const linkedTransactions = params.transactions.filter((transaction) => linkedIds.has(`${transaction.type}:${transaction.id}`));
    const limit = row.spending_limit == null ? null : pence(row.spending_limit);
    return {
      id: row.id as string,
      cardName: row.card_name as string,
      lastFour: (row.last_four as string | null) ?? null,
      bankAccountName: bankAccount?.name ?? null,
      spendingLimitPence: limit,
      spentPence,
      remainingPence: limit == null ? null : limit - spentPence,
      status: row.status as string,
      linkedTransactions,
    };
  });
}

async function loadCalendar(params: {
  workspaceId: string;
  userId: string | null;
}): Promise<EmployeeMonitoringCalendarItem[]> {
  if (!params.userId) return [];
  const admin = createAdminClient();
  const [created, attended, tasks] = await Promise.all([
    admin
      .from('calendar_events')
      .select('id, title, start_at, status')
      .eq('workspace_id', params.workspaceId)
      .eq('created_by', params.userId)
      .order('start_at', { ascending: false })
      .limit(25),
    admin
      .from('calendar_event_attendees')
      .select('event_id, response, calendar_events(id, title, start_at, status)')
      .eq('workspace_id', params.workspaceId)
      .eq('attendee_user_id', params.userId)
      .limit(25),
    admin
      .from('portal_tasks')
      .select('id, title, due_at, status, calendar_event_id')
      .eq('workspace_id', params.workspaceId)
      .eq('assigned_to', params.userId)
      .order('due_at', { ascending: false, nullsFirst: false })
      .limit(25),
  ]);

  return [
    ...((created.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      type: 'created_event' as const,
      title: row.title as string,
      date: (row.start_at as string | null) ?? null,
      status: row.status as string,
      href: `/calendar?event=${row.id as string}`,
    })),
    ...((attended.data ?? []) as Record<string, unknown>[]).map((row) => {
      const event = Array.isArray(row.calendar_events) ? row.calendar_events[0] : row.calendar_events as { id?: string; title?: string; start_at?: string; status?: string } | null;
      return {
        id: `${row.event_id as string}:attendee`,
        type: 'attended_event' as const,
        title: event?.title ?? 'Calendar event',
        date: event?.start_at ?? null,
        status: (row.response as string | null) ?? event?.status ?? 'pending',
        href: event?.id ? `/calendar?event=${event.id}` : null,
      };
    }),
    ...((tasks.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      type: 'task' as const,
      title: row.title as string,
      date: (row.due_at as string | null) ?? null,
      status: row.status as string,
      href: row.calendar_event_id ? `/calendar?event=${row.calendar_event_id as string}` : null,
    })),
  ].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
}

async function loadActivity(params: {
  workspaceId: string;
  userId: string | null;
  employeeId: string;
  invites: Record<string, unknown>[];
  submissions: EmployeeMonitoringSubmission[];
  calendar: EmployeeMonitoringCalendarItem[];
}): Promise<EmployeeMonitoringActivityItem[]> {
  const admin = createAdminClient();
  const [auditRes, notificationsRes] = await Promise.all([
    admin
      .from('audit_log')
      .select('id, action, entity_type, entity_id, metadata, created_at')
      .eq('organisation_id', params.workspaceId)
      .or(`entity_id.eq.${params.employeeId}${params.userId ? `,user_id.eq.${params.userId}` : ''}`)
      .order('created_at', { ascending: false })
      .limit(80),
    params.userId
      ? admin
          .from('portal_notifications')
          .select('id, type, title, body, source_type, source_id, href, created_at')
          .eq('workspace_id', params.workspaceId)
          .eq('user_id', params.userId)
          .order('created_at', { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] }),
  ]);

  const timeline = [
    ...params.invites.flatMap((invite) => [
      activityItem({
        id: `${invite.id as string}:created`,
        type: 'invite_sent',
        title: `Invite ${invite.status as string}`,
        description: invite.invited_email as string | null,
        occurredAt: (invite.sent_at as string | null) ?? (invite.created_at as string | null),
        sourceType: 'organisation_invite',
        sourceId: invite.id as string,
      }),
      activityItem({
        id: `${invite.id as string}:accepted`,
        type: 'invite_accepted',
        title: 'Invite accepted',
        description: invite.invited_email as string | null,
        occurredAt: invite.accepted_at as string | null,
        sourceType: 'organisation_invite',
        sourceId: invite.id as string,
        severity: 'success',
      }),
    ]),
    ...params.submissions.map((submission) => activityItem({
      id: `${submission.type}:${submission.id}`,
      type: `${submission.type}_submitted`,
      title: submission.title,
      description: submission.status,
      occurredAt: submission.submittedAt,
      sourceType: submission.type,
      sourceId: submission.id,
      href: submission.href,
    })),
    ...params.calendar.map((item) => activityItem({
      id: `${item.type}:${item.id}`,
      type: item.type,
      title: item.title,
      description: item.status,
      occurredAt: item.date,
      sourceType: item.type,
      sourceId: item.id,
      href: item.href,
    })),
    ...((notificationsRes.data ?? []) as Record<string, unknown>[]).map((row) => activityItem({
      id: row.id as string,
      type: row.type as string,
      title: row.title as string,
      description: (row.body as string | null) ?? null,
      occurredAt: row.created_at as string,
      sourceType: (row.source_type as string | null) ?? 'portal_notification',
      sourceId: (row.source_id as string | null) ?? null,
      href: (row.href as string | null) ?? null,
      severity: String(row.type ?? '').includes('rejected') ? 'warning' : 'info',
    })),
    ...((auditRes.data ?? []) as Record<string, unknown>[]).map((row) => activityItem({
      id: row.id as string,
      type: row.action as string,
      title: String(row.action ?? '').replace(/_/g, ' '),
      description: null,
      occurredAt: row.created_at as string,
      sourceType: (row.entity_type as string | null) ?? 'audit_log',
      sourceId: (row.entity_id as string | null) ?? null,
      severity: row.action === 'update_portal_permissions' ? 'success' : 'info',
    })),
  ].filter((item): item is EmployeeMonitoringActivityItem => Boolean(item));

  return timeline.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 100);
}

export async function getEmployeeMonitoringData(
  employeeId: string,
): Promise<{ data: EmployeeMonitoringData | null; error: string | null }> {
  const ctx = await getActiveOrg();
  if (ctx.role !== 'admin') {
    return { data: null, error: 'Only admins can view employee monitoring.' };
  }

  const admin = createAdminClient();
  const { data: employee, error: employeeError } = await admin
    .from('employees')
    .select('id, organisation_id')
    .eq('id', employeeId)
    .maybeSingle();
  if (employeeError) return { data: null, error: employeeError.message };
  if (!employee || employee.organisation_id !== ctx.orgId) {
    return { data: null, error: 'Employee not found in this workspace.' };
  }

  const resolved = await resolveMonitoredUser({ employeeId, workspaceId: ctx.orgId });
  const base = emptyMonitoringData();
  const [budgetUsage, assignmentCounts, submissions, transactionData, calendar] = await Promise.all([
    loadBudgetUsage({ workspaceId: ctx.orgId, userId: resolved.userId }),
    loadAssignmentCounts({ workspaceId: ctx.orgId, userId: resolved.userId }),
    loadSubmissions({ workspaceId: ctx.orgId, userId: resolved.userId }),
    loadTransactions({ workspaceId: ctx.orgId, userId: resolved.userId }),
    loadCalendar({ workspaceId: ctx.orgId, userId: resolved.userId }),
  ]);
  const cards = await loadCards({
    workspaceId: ctx.orgId,
    userId: resolved.userId,
    expenseLinks: transactionData.expenseLinks,
    transactions: transactionData.transactions,
  });
  const activity = await loadActivity({
    workspaceId: ctx.orgId,
    userId: resolved.userId,
    employeeId,
    invites: resolved.invites as Record<string, unknown>[],
    submissions,
    calendar,
  });

  const data: EmployeeMonitoringData = {
    ...base,
    overview: {
      monitoredUserId: resolved.userId,
      latestInviteStatus: resolved.latestInvite?.status ?? null,
      enabledPageCount: enabledCount(resolved.permissions?.pages),
      enabledActionCount: enabledCount(resolved.permissions?.actions),
      enabledScopeCount: enabledCount(resolved.permissions?.scopes),
      budgetAssignmentCount: budgetUsage.length,
      fundAssignmentCount: assignmentCounts.fundAssignmentCount,
      cardAssignmentCount: cards.length,
    },
    permissions: resolved.permissions,
    budgetUsage,
    submissions,
    transactions: transactionData.transactions,
    cards,
    calendar,
    activity,
  };

  return { data, error: null };
}
