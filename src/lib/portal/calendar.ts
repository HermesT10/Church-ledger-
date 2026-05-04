'use server';

import { revalidatePath } from 'next/cache';
import { assertWriteAllowed } from '@/lib/demo';
import { logAuditEvent } from '@/lib/audit';
import { getActiveOrg } from '@/lib/org';
import { createAdminClient } from '@/lib/supabase/admin';
import { createPortalNotification } from '@/lib/portal/notifications';
import { updatePortalTaskStatus } from '@/lib/portal/tasks';
import {
  enforcePortalPermissionForContext,
  PortalPermissionError,
} from '@/lib/portal-permissions';
import {
  CALENDAR_EVENT_CATEGORIES,
  CALENDAR_EVENT_STATUSES,
  CALENDAR_RECURRENCE_RULES,
  CALENDAR_VISIBILITIES,
  type CalendarAttendee,
  type CalendarEventCategory,
  type CalendarEventDetail,
  type CalendarEventStatus,
  type CalendarEventView,
  type CalendarRecurrenceRule,
  type CalendarVisibility,
} from '@/lib/calendar/types';
import type { PortalTask, PortalTaskStatus } from '@/lib/portal/types';

type ActionResult<T = null> = { data: T | null; error: string | null };

export interface PortalCalendarEventInput {
  title: string;
  description?: string | null;
  category?: CalendarEventCategory;
  status?: CalendarEventStatus;
  visibility?: CalendarVisibility;
  startAt: string;
  endAt?: string | null;
  allDay?: boolean;
  location?: string | null;
  recurrenceRule?: CalendarRecurrenceRule;
  recurrenceUntil?: string | null;
}

export interface PortalCalendarUserOption {
  id: string;
  name: string;
  role: string;
}

function permissionMessage(error: unknown) {
  return error instanceof PortalPermissionError || error instanceof Error
    ? error.message
    : 'Permission denied.';
}

function normalizeDateRange(input?: { start?: string; end?: string }) {
  const now = new Date();
  const start = input?.start ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const end = input?.end ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  return { start, end };
}

function rowToEvent(row: Record<string, unknown>): CalendarEventView {
  const resource = Array.isArray(row.calendar_resources)
    ? row.calendar_resources[0]
    : row.calendar_resources as { name?: string | null } | null;

  return {
    id: row.id as string,
    source: 'stored',
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    category: row.category as CalendarEventCategory,
    status: row.status as CalendarEventStatus,
    visibility: row.visibility as CalendarVisibility,
    startAt: row.start_at as string,
    endAt: (row.end_at as string | null) ?? null,
    allDay: Boolean(row.all_day),
    location: (row.location as string | null) ?? null,
    resourceId: (row.resource_id as string | null) ?? null,
    resourceName: resource?.name ?? null,
    recurrenceRule: row.recurrence_rule as CalendarRecurrenceRule,
    recurrenceUntil: (row.recurrence_until as string | null) ?? null,
    linkedSourceType: (row.linked_source_type as string | null) ?? null,
    linkedSourceId: (row.linked_source_id as string | null) ?? null,
    attendeeCount: Number(row.attendee_count ?? 0),
  };
}

function validateEventInput(input: PortalCalendarEventInput): string | null {
  if (!input.title?.trim()) return 'Event title is required.';
  if (!input.startAt) return 'Start date is required.';
  if (input.endAt && input.endAt < input.startAt) return 'End date must be after the start date.';
  if (input.category && !CALENDAR_EVENT_CATEGORIES.includes(input.category)) return 'Invalid event category.';
  if (input.status && !CALENDAR_EVENT_STATUSES.includes(input.status)) return 'Invalid event status.';
  if (input.visibility && !CALENDAR_VISIBILITIES.includes(input.visibility)) return 'Invalid event visibility.';
  if (input.recurrenceRule && !CALENDAR_RECURRENCE_RULES.includes(input.recurrenceRule)) return 'Invalid recurrence.';
  return null;
}

async function portalVisibilitySets(workspaceId: string, userId: string) {
  const admin = createAdminClient();
  const [attendeesRes, tasksRes, fundAssignmentsRes, categoryAssignmentsRes] = await Promise.all([
    admin
      .from('calendar_event_attendees')
      .select('event_id')
      .eq('workspace_id', workspaceId)
      .eq('attendee_user_id', userId),
    admin
      .from('portal_tasks')
      .select('calendar_event_id')
      .eq('workspace_id', workspaceId)
      .eq('assigned_to', userId)
      .not('calendar_event_id', 'is', null),
    admin
      .from('user_fund_assignments')
      .select('fund_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .eq('can_view', true),
    admin
      .from('user_category_assignments')
      .select('category_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .eq('can_view', true),
  ]);

  return {
    attendeeEventIds: new Set((attendeesRes.data ?? []).map((row) => row.event_id as string)),
    taskEventIds: new Set((tasksRes.data ?? []).map((row) => row.calendar_event_id as string).filter(Boolean)),
    fundIds: new Set((fundAssignmentsRes.data ?? []).map((row) => row.fund_id as string)),
    accountIds: new Set((categoryAssignmentsRes.data ?? []).map((row) => row.category_id as string)),
  };
}

function canSeeEvent(params: {
  row: Record<string, unknown>;
  userId: string;
  allWorkspace: boolean;
  attendeeEventIds: Set<string>;
  taskEventIds: Set<string>;
  fundIds: Set<string>;
  accountIds: Set<string>;
}) {
  const id = params.row.id as string;
  const createdBy = (params.row.created_by as string | null) ?? null;
  const visibility = params.row.visibility as CalendarVisibility;
  const linkedFundId = (params.row.linked_fund_id as string | null) ?? null;
  const linkedAccountId = (params.row.linked_account_id as string | null) ?? null;

  const directlyVisible =
    createdBy === params.userId ||
    params.attendeeEventIds.has(id) ||
    params.taskEventIds.has(id) ||
    (params.allWorkspace && visibility === 'workspace');

  if (!directlyVisible) return false;
  if (linkedFundId && !params.allWorkspace && !params.fundIds.has(linkedFundId)) return false;
  if (linkedAccountId && !params.allWorkspace && !params.accountIds.has(linkedAccountId)) return false;
  return true;
}

export async function listPortalCalendarEvents(filters: {
  start?: string;
  end?: string;
  query?: string;
} = {}): Promise<{ data: CalendarEventView[]; error: string | null }> {
  const ctx = await getActiveOrg();
  try {
    await enforcePortalPermissionForContext(ctx, 'calendar', 'view');
  } catch (error) {
    return { data: [], error: permissionMessage(error) };
  }

  const range = normalizeDateRange(filters);
  const admin = createAdminClient();
  const access = await portalVisibilitySets(ctx.orgId, ctx.user.id);
  const { data, error } = await admin
    .from('calendar_events')
    .select('*, calendar_resources(id, name)')
    .eq('workspace_id', ctx.orgId)
    .lte('start_at', range.end)
    .or(`end_at.gte.${range.start},end_at.is.null,recurrence_rule.neq.none`)
    .order('start_at');

  if (error) return { data: [], error: error.message };

  const rows = ((data ?? []) as Record<string, unknown>[])
    .filter((row) => canSeeEvent({
      row,
      userId: ctx.user.id,
      allWorkspace: ctx.role === 'admin' || ctx.role === 'treasurer',
      ...access,
    }))
    .filter((row) => {
      if (!filters.query) return true;
      const haystack = `${row.title ?? ''} ${row.description ?? ''} ${row.location ?? ''}`.toLowerCase();
      return haystack.includes(filters.query.toLowerCase());
    });

  return { data: rows.map(rowToEvent), error: null };
}

export async function getPortalCalendarEventDetail(eventId: string): Promise<{ data: (CalendarEventDetail & { tasks: PortalTask[] }) | null; error: string | null }> {
  const ctx = await getActiveOrg();
  const admin = createAdminClient();
  const visible = await listPortalCalendarEvents();
  if (visible.error) return { data: null, error: visible.error };
  if (!visible.data.some((event) => event.id === eventId)) return { data: null, error: 'Calendar event not found.' };

  const [{ data: event }, { data: attendees }, { data: reminders }, { data: links }, { data: tasks }] = await Promise.all([
    admin.from('calendar_events').select('*, calendar_resources(id, name)').eq('workspace_id', ctx.orgId).eq('id', eventId).maybeSingle(),
    admin.from('calendar_event_attendees').select('id, event_id, attendee_user_id, attendee_email, attendee_name, role, response, notes').eq('workspace_id', ctx.orgId).eq('event_id', eventId),
    admin.from('calendar_reminders').select('id, event_id, title, due_at, state, assigned_to').eq('workspace_id', ctx.orgId).eq('event_id', eventId),
    admin.from('calendar_event_links').select('id, event_id, source_type, source_id, label, href').eq('workspace_id', ctx.orgId).eq('event_id', eventId),
    admin.from('portal_tasks').select('id, title, description, due_at, status, assigned_by, updated_by, calendar_events(id, title, start_at)').eq('workspace_id', ctx.orgId).eq('calendar_event_id', eventId).eq('assigned_to', ctx.user.id),
  ]);

  if (!event) return { data: null, error: 'Calendar event not found.' };
  const mappedTasks = ((tasks ?? []) as Record<string, unknown>[]).map((task) => {
    const linkedEvent = Array.isArray(task.calendar_events) ? task.calendar_events[0] : task.calendar_events as { id?: string; title?: string; start_at?: string } | null;
    return {
      id: task.id as string,
      title: task.title as string,
      description: (task.description as string | null) ?? null,
      dueAt: (task.due_at as string | null) ?? null,
      status: task.status as PortalTaskStatus,
      assignedBy: (task.assigned_by as string | null) ?? null,
      updatedBy: (task.updated_by as string | null) ?? null,
      calendarEvent: linkedEvent?.id ? {
        id: linkedEvent.id,
        title: linkedEvent.title ?? 'Calendar event',
        startAt: linkedEvent.start_at ?? '',
        href: `/portal/calendar?event=${linkedEvent.id}`,
      } : null,
    };
  });

  return {
    data: {
      ...rowToEvent(event as Record<string, unknown>),
      attendees: (attendees ?? []) as CalendarAttendee[],
      reminders: (reminders ?? []) as CalendarEventDetail['reminders'],
      links: (links ?? []) as CalendarEventDetail['links'],
      tasks: mappedTasks,
    },
    error: null,
  };
}

export async function listPortalCalendarUsers(): Promise<{ data: PortalCalendarUserOption[]; error: string | null }> {
  const ctx = await getActiveOrg();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('memberships')
    .select('user_id, role, profiles(full_name, email)')
    .eq('organisation_id', ctx.orgId)
    .eq('status', 'active')
    .order('role');

  if (error) return { data: [], error: error.message };
  return {
    data: ((data ?? []) as Record<string, unknown>[]).map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles as { full_name?: string | null; email?: string | null } | null;
      return {
        id: row.user_id as string,
        role: row.role as string,
        name: profile?.full_name ?? profile?.email ?? row.user_id as string,
      };
    }),
    error: null,
  };
}

export async function createPortalCalendarEvent(input: PortalCalendarEventInput): Promise<ActionResult<{ id: string }>> {
  await assertWriteAllowed();
  const ctx = await getActiveOrg();
  const validation = validateEventInput(input);
  if (validation) return { data: null, error: validation };

  try {
    await enforcePortalPermissionForContext(ctx, 'calendar', 'create');
  } catch (error) {
    return { data: null, error: permissionMessage(error) };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('calendar_events')
    .insert({
      workspace_id: ctx.orgId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      category: input.category ?? 'general',
      status: input.status ?? 'scheduled',
      visibility: input.visibility ?? 'selected_users',
      start_at: input.startAt,
      end_at: input.endAt ?? null,
      all_day: Boolean(input.allDay),
      location: input.location?.trim() || null,
      recurrence_rule: input.recurrenceRule ?? 'none',
      recurrence_until: input.recurrenceUntil ?? null,
      created_by: ctx.user.id,
      updated_by: ctx.user.id,
    })
    .select('id')
    .single();

  if (error || !data) return { data: null, error: error?.message ?? 'Could not create event.' };

  await admin.from('calendar_event_attendees').insert({
    workspace_id: ctx.orgId,
    event_id: data.id,
    attendee_user_id: ctx.user.id,
    role: 'organiser',
    response: 'accepted',
    invited_by: ctx.user.id,
  });
  await logAuditEvent({ orgId: ctx.orgId, userId: ctx.user.id, action: 'portal_calendar_event_created', entityType: 'calendar_event', entityId: data.id });
  revalidatePath('/portal/calendar');
  revalidatePath('/calendar');
  return { data: { id: data.id }, error: null };
}

export async function invitePortalCalendarAttendee(input: {
  eventId: string;
  attendeeUserId: string;
  note?: string | null;
}): Promise<ActionResult> {
  await assertWriteAllowed();
  const ctx = await getActiveOrg();
  try {
    await enforcePortalPermissionForContext(ctx, 'calendar', 'comment');
  } catch (error) {
    return { data: null, error: permissionMessage(error) };
  }

  const detail = await getPortalCalendarEventDetail(input.eventId);
  if (detail.error || !detail.data) return { data: null, error: detail.error ?? 'Calendar event not found.' };

  const admin = createAdminClient();
  const { data: membership } = await admin
    .from('memberships')
    .select('user_id, profiles(full_name)')
    .eq('organisation_id', ctx.orgId)
    .eq('user_id', input.attendeeUserId)
    .eq('status', 'active')
    .maybeSingle();
  if (!membership) return { data: null, error: 'Choose an active organisation user.' };

  const profile = Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles as { full_name?: string | null } | null;
  const { error } = await admin.from('calendar_event_attendees').insert({
    workspace_id: ctx.orgId,
    event_id: input.eventId,
    attendee_user_id: input.attendeeUserId,
    attendee_name: profile?.full_name ?? null,
    role: 'attendee',
    response: 'pending',
    notes: input.note?.trim() || null,
    invited_by: ctx.user.id,
  });
  if (error) return { data: null, error: error.message };

  await createPortalNotification({
    workspaceId: ctx.orgId,
    userId: input.attendeeUserId,
    type: 'event_assigned',
    title: 'Event assigned',
    body: `You were added to ${detail.data.title}.`,
    sourceType: 'calendar_event',
    sourceId: input.eventId,
    href: `/portal/calendar?event=${input.eventId}`,
  });
  revalidatePath('/portal/calendar');
  revalidatePath('/calendar');
  return { data: null, error: null };
}

export async function updatePortalCalendarTaskStatus(taskId: string, status: PortalTaskStatus) {
  return updatePortalTaskStatus(taskId, status);
}
