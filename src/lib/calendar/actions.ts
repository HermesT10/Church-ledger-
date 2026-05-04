'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logAuditEvent } from '@/lib/audit';
import { getActiveOrg } from '@/lib/org';
import { canPerform } from '@/lib/permissions';
import { enforcePortalPermissionForContext } from '@/lib/portal-permissions';
import { createPortalNotification } from '@/lib/portal/notifications';
import { createClient } from '@/lib/supabase/server';
import {
  CALENDAR_ATTENDEE_RESPONSES,
  CALENDAR_ATTENDEE_ROLES,
  CALENDAR_EVENT_CATEGORIES,
  CALENDAR_EVENT_STATUSES,
  CALENDAR_RECURRENCE_RULES,
  CALENDAR_VISIBILITIES,
  type CalendarActionResult,
  type CalendarAttendee,
  type CalendarEventDetail,
  type CalendarEventLink,
  type CalendarEventRow,
  type CalendarEventView,
  type CalendarRangeFilters,
  type CalendarReminder,
  type CalendarResource,
  type CalendarUser,
} from './types';
import { eventsOverlap, expandRecurringEvent } from './utils';

const eventInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(160),
  description: z.string().trim().optional().nullable(),
  category: z.enum(CALENDAR_EVENT_CATEGORIES).default('general'),
  status: z.enum(CALENDAR_EVENT_STATUSES).default('scheduled'),
  visibility: z.enum(CALENDAR_VISIBILITIES).default('workspace'),
  start_at: z.string().datetime(),
  end_at: z.string().datetime().optional().nullable(),
  all_day: z.boolean().default(false),
  location: z.string().trim().optional().nullable(),
  resource_id: z.string().uuid().optional().nullable(),
  recurrence_rule: z.enum(CALENDAR_RECURRENCE_RULES).default('none'),
  recurrence_until: z.string().datetime().optional().nullable(),
  linked_fund_id: z.string().uuid().optional().nullable(),
  linked_account_id: z.string().uuid().optional().nullable(),
  linked_source_type: z.string().trim().optional().nullable(),
  linked_source_id: z.string().uuid().optional().nullable(),
}).refine((value) => !value.end_at || value.end_at >= value.start_at, {
  message: 'End date must be after the start date.',
  path: ['end_at'],
});

const attendeeInputSchema = z.object({
  event_id: z.string().uuid(),
  attendee_user_id: z.string().uuid().optional().nullable(),
  attendee_email: z.string().email().optional().nullable(),
  attendee_name: z.string().trim().optional().nullable(),
  role: z.enum(CALENDAR_ATTENDEE_ROLES).default('attendee'),
  response: z.enum(CALENDAR_ATTENDEE_RESPONSES).default('pending'),
  notes: z.string().trim().optional().nullable(),
}).refine((value) => value.attendee_user_id || value.attendee_email, {
  message: 'Choose a user or enter an email address.',
});

const reminderInputSchema = z.object({
  event_id: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(160),
  due_at: z.string().datetime(),
  assigned_to: z.string().uuid().optional().nullable(),
});

const resourceInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().optional().nullable(),
  location: z.string().trim().optional().nullable(),
  capacity: z.coerce.number().int().nonnegative().optional().nullable(),
  allow_double_booking: z.boolean().default(false),
});

const linkInputSchema = z.object({
  event_id: z.string().uuid(),
  source_type: z.string().trim().min(1),
  source_id: z.string().uuid(),
  label: z.string().trim().optional().nullable(),
  href: z.string().trim().optional().nullable(),
});

type BillDerivedRow = {
  id: string;
  bill_number: string | null;
  due_date: string;
  status: string;
  suppliers?: { name: string | null } | { name: string | null }[] | null;
};

type PaymentRunDerivedRow = {
  id: string;
  run_date: string;
  status: string;
};

type GiftAidBatchDerivedRow = {
  id: string;
  status: string;
  submitted_at: string | null;
  expected_payment_date: string | null;
};

type BudgetDerivedRow = {
  id: string;
  name: string | null;
  year: number;
  created_at: string;
};

type LettingChargeDerivedRow = {
  id: string;
  due_date: string;
  status: string;
  description: string | null;
  lettings_hirers?: { name: string | null; default_room_name: string | null } | { name: string | null; default_room_name: string | null }[] | null;
};

type PayrollRunDerivedRow = {
  id: string;
  payroll_month: string;
  status: string;
};

type CalendarReminderDerivedRow = {
  id: string;
  title: string;
  due_at: string;
  event_id: string | null;
};

type MembershipUserRow = {
  user_id: string;
  role: string;
  profiles?: { full_name: string | null } | { full_name: string | null }[] | null;
};

function valueFromForm(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function booleanFromForm(formData: FormData, key: string): boolean {
  return formData.get(key) === 'on' || formData.get(key) === 'true';
}

function dateTimeFromForm(formData: FormData, key: string): string | null {
  const value = valueFromForm(formData, key);
  if (!value) return null;
  return new Date(value).toISOString();
}

function eventInputFromForm(formData: FormData) {
  return {
    title: valueFromForm(formData, 'title') ?? '',
    description: valueFromForm(formData, 'description'),
    category: valueFromForm(formData, 'category') ?? 'general',
    status: valueFromForm(formData, 'status') ?? 'scheduled',
    visibility: valueFromForm(formData, 'visibility') ?? 'workspace',
    start_at: dateTimeFromForm(formData, 'start_at') ?? '',
    end_at: dateTimeFromForm(formData, 'end_at'),
    all_day: booleanFromForm(formData, 'all_day'),
    location: valueFromForm(formData, 'location'),
    resource_id: valueFromForm(formData, 'resource_id'),
    recurrence_rule: valueFromForm(formData, 'recurrence_rule') ?? 'none',
    recurrence_until: dateTimeFromForm(formData, 'recurrence_until'),
    linked_fund_id: valueFromForm(formData, 'linked_fund_id'),
    linked_account_id: valueFromForm(formData, 'linked_account_id'),
    linked_source_type: valueFromForm(formData, 'linked_source_type'),
    linked_source_id: valueFromForm(formData, 'linked_source_id'),
  };
}

async function getCalendarContext(action: 'read' | 'create' | 'update' | 'delete' = 'read') {
  const ctx = await getActiveOrg();
  const permission = canPerform(ctx.role, action, 'calendar');
  if (!permission.allowed) {
    throw new Error(permission.reason ?? 'You do not have permission to use the calendar.');
  }
  await enforcePortalPermissionForContext(
    ctx,
    'calendar',
    action === 'read' ? 'view' : action === 'create' ? 'create' : action === 'delete' ? 'delete_own' : 'edit_own',
  );
  return ctx;
}

function rowToEvent(row: CalendarEventRow): CalendarEventView {
  return {
    id: row.id,
    source: 'stored',
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    visibility: row.visibility,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: row.all_day,
    location: row.location,
    resourceId: row.resource_id,
    resourceName: row.calendar_resources?.name ?? null,
    recurrenceRule: row.recurrence_rule,
    recurrenceUntil: row.recurrence_until,
    linkedFundId: row.linked_fund_id,
    linkedAccountId: row.linked_account_id,
    linkedSourceType: row.linked_source_type,
    linkedSourceId: row.linked_source_id,
  };
}

function matchesFilters(event: CalendarEventView, filters: CalendarRangeFilters): boolean {
  if (filters.category && filters.category !== 'all' && event.category !== filters.category) return false;
  if (filters.status && filters.status !== 'all' && event.status !== filters.status) return false;
  if (filters.resourceId && filters.resourceId !== 'all' && event.resourceId !== filters.resourceId) return false;
  if (filters.query) {
    const haystack = `${event.title} ${event.description ?? ''} ${event.location ?? ''}`.toLowerCase();
    if (!haystack.includes(filters.query.toLowerCase())) return false;
  }
  return true;
}

async function eventIdsForAttendeeUser(userId: string): Promise<Set<string>> {
  const ctx = await getCalendarContext('read');
  const supabase = await createClient();
  const { data } = await supabase
    .from('calendar_event_attendees')
    .select('event_id')
    .eq('workspace_id', ctx.orgId)
    .eq('attendee_user_id', userId);

  return new Set((data ?? []).map((row) => row.event_id).filter(Boolean));
}

async function derivedEventsForRange(filters: CalendarRangeFilters): Promise<CalendarEventView[]> {
  const ctx = await getCalendarContext('read');
  const supabase = await createClient();
  const startDate = filters.start.slice(0, 10);
  const endDate = filters.end.slice(0, 10);
  const events: CalendarEventView[] = [];

  if (filters.includeFinance !== false) {
    const [{ data: bills }, { data: paymentRuns }, { data: giftAidBatches }, { data: budgets }] = await Promise.all([
      supabase
        .from('bills')
        .select('id, bill_number, due_date, status, total_pence, suppliers(name)')
        .eq('organisation_id', ctx.orgId)
        .not('due_date', 'is', null)
        .gte('due_date', startDate)
        .lte('due_date', endDate),
      supabase
        .from('payment_runs')
        .select('id, run_date, status, total_pence')
        .eq('organisation_id', ctx.orgId)
        .gte('run_date', startDate)
        .lte('run_date', endDate),
      supabase
        .from('gift_aid_claim_batches')
        .select('id, status, claim_total_pence, submitted_at, expected_payment_date')
        .eq('workspace_id', ctx.orgId)
        .or(`expected_payment_date.gte.${startDate},submitted_at.gte.${filters.start}`)
        .limit(50),
      supabase
        .from('budgets')
        .select('id, name, year, status, created_at')
        .eq('organisation_id', ctx.orgId)
        .eq('status', 'draft')
        .gte('created_at', filters.start)
        .lte('created_at', filters.end)
        .limit(20),
    ]);

    for (const bill of (bills ?? []) as BillDerivedRow[]) {
      const supplier = Array.isArray(bill.suppliers) ? bill.suppliers[0] : bill.suppliers;
      events.push({
        id: `bill:${bill.id}`,
        source: 'derived',
        title: `Bill due: ${supplier?.name ?? bill.bill_number ?? 'Supplier bill'}`,
        description: bill.status,
        category: 'finance_deadline',
        status: bill.status === 'paid' ? 'completed' : 'scheduled',
        startAt: `${bill.due_date}T09:00:00.000Z`,
        endAt: null,
        allDay: true,
        linkedSourceType: 'bill',
        linkedSourceId: bill.id,
        href: `/bills/${bill.id}`,
      });
    }

    for (const run of (paymentRuns ?? []) as PaymentRunDerivedRow[]) {
      events.push({
        id: `payment_run:${run.id}`,
        source: 'derived',
        title: `Payment run: ${run.status}`,
        category: 'payment_run',
        status: run.status === 'posted' ? 'completed' : 'scheduled',
        startAt: `${run.run_date}T10:00:00.000Z`,
        endAt: null,
        allDay: true,
        linkedSourceType: 'payment_run',
        linkedSourceId: run.id,
        href: `/payment-runs/${run.id}`,
      });
    }

    for (const batch of (giftAidBatches ?? []) as GiftAidBatchDerivedRow[]) {
      const date = batch.expected_payment_date ?? batch.submitted_at?.slice(0, 10);
      if (date && date >= startDate && date <= endDate) {
        events.push({
          id: `gift_aid_claim_batch:${batch.id}`,
          source: 'derived',
          title: batch.expected_payment_date ? 'Gift Aid payment expected' : 'Gift Aid claim submitted',
          description: batch.status,
          category: 'gift_aid',
          status: batch.status === 'paid' ? 'completed' : 'scheduled',
          startAt: `${date}T09:00:00.000Z`,
          endAt: null,
          allDay: true,
          linkedSourceType: 'gift_aid_claim_batch',
          linkedSourceId: batch.id,
          href: `/gift-aid/${batch.id}`,
        });
      }
    }

    for (const budget of (budgets ?? []) as BudgetDerivedRow[]) {
      events.push({
        id: `budget:${budget.id}`,
        source: 'derived',
        title: `Budget review: ${budget.name ?? budget.year}`,
        category: 'budget_review',
        status: 'scheduled',
        startAt: budget.created_at,
        endAt: null,
        allDay: true,
        linkedSourceType: 'budget',
        linkedSourceId: budget.id,
        href: '/budgets',
      });
    }

    const monthEnd = new Date(Date.UTC(new Date(filters.start).getUTCFullYear(), new Date(filters.start).getUTCMonth() + 1, 5, 9));
    if (monthEnd >= new Date(filters.start) && monthEnd <= new Date(filters.end)) {
      events.push({
        id: `month_end_close:${monthEnd.toISOString().slice(0, 7)}`,
        source: 'derived',
        title: 'Month-end close target',
        category: 'month_end_close',
        status: 'scheduled',
        startAt: monthEnd.toISOString(),
        endAt: null,
        allDay: true,
        linkedSourceType: 'month_end_review',
        linkedSourceId: null,
        href: '/month-end',
      });
    }

    const bankRec = new Date(Date.UTC(new Date(filters.start).getUTCFullYear(), new Date(filters.start).getUTCMonth(), new Date(filters.start).getUTCDate() + 7, 9));
    if (bankRec <= new Date(filters.end)) {
      events.push({
        id: `bank_reconciliation:${bankRec.toISOString().slice(0, 10)}`,
        source: 'derived',
        title: 'Bank reconciliation check',
        category: 'bank_reconciliation',
        status: 'scheduled',
        startAt: bankRec.toISOString(),
        endAt: null,
        allDay: true,
        linkedSourceType: 'bank_reconciliation',
        linkedSourceId: null,
        href: '/banking',
      });
    }
  }

  if (filters.includeLettings !== false) {
    const { data: lettings } = await supabase
      .from('lettings_charges')
      .select('id, due_date, status, description, expected_amount_pence, lettings_hirers(name, default_room_name)')
      .eq('organisation_id', ctx.orgId)
      .not('due_date', 'is', null)
      .gte('due_date', startDate)
      .lte('due_date', endDate)
      .limit(100);

    for (const letting of (lettings ?? []) as LettingChargeDerivedRow[]) {
      const hirer = Array.isArray(letting.lettings_hirers) ? letting.lettings_hirers[0] : letting.lettings_hirers;
      events.push({
        id: `letting_charge:${letting.id}`,
        source: 'derived',
        title: `Letting due: ${hirer?.name ?? 'Hall hire'}`,
        description: letting.description,
        category: 'letting',
        status: letting.status === 'paid' ? 'completed' : 'scheduled',
        startAt: `${letting.due_date}T10:00:00.000Z`,
        endAt: null,
        allDay: true,
        location: hirer?.default_room_name ?? null,
        linkedSourceType: 'letting_charge',
        linkedSourceId: letting.id,
        href: '/lettings',
      });
    }
  }

  const { data: payroll } = await supabase
    .from('payroll_runs')
    .select('id, payroll_month, status, total_gross_pence')
    .eq('organisation_id', ctx.orgId)
    .gte('payroll_month', startDate.slice(0, 7))
    .lte('payroll_month', endDate.slice(0, 7))
    .limit(50);

  for (const run of (payroll ?? []) as PayrollRunDerivedRow[]) {
    const payrollDate = new Date(`${String(run.payroll_month).slice(0, 7)}-25T09:00:00.000Z`);
    events.push({
      id: `payroll:${run.id}`,
      source: 'derived',
      title: `Payroll run: ${String(run.payroll_month).slice(0, 7)}`,
      category: 'payroll',
      status: run.status === 'posted' ? 'completed' : 'scheduled',
      startAt: payrollDate.toISOString(),
      endAt: null,
      allDay: true,
      linkedSourceType: 'payroll_run',
      linkedSourceId: run.id,
      href: '/payroll',
    });
  }

  if (filters.includeReminders !== false) {
    const { data: reminders } = await supabase
      .from('calendar_reminders')
      .select('id, title, due_at, state, event_id')
      .eq('workspace_id', ctx.orgId)
      .in('state', ['scheduled', 'sent'])
      .gte('due_at', filters.start)
      .lte('due_at', filters.end)
      .limit(50);

    for (const reminder of (reminders ?? []) as CalendarReminderDerivedRow[]) {
      events.push({
        id: `reminder:${reminder.id}`,
        source: 'derived',
        title: `Reminder: ${reminder.title}`,
        category: 'reminder',
        status: 'scheduled',
        startAt: reminder.due_at,
        endAt: null,
        allDay: false,
        linkedSourceType: reminder.event_id ? 'calendar_event' : 'manual',
        linkedSourceId: reminder.event_id,
        href: reminder.event_id ? `/calendar?event=${reminder.event_id}` : '/calendar',
      });
    }
  }

  return events.filter((event) => matchesFilters(event, filters));
}

export async function getCalendarResources(): Promise<CalendarResource[]> {
  const ctx = await getCalendarContext('read');
  const supabase = await createClient();
  const { data } = await supabase
    .from('calendar_resources')
    .select('*')
    .eq('workspace_id', ctx.orgId)
    .eq('is_active', true)
    .order('name');
  return (data ?? []) as CalendarResource[];
}

export async function getCalendarUsers(): Promise<CalendarUser[]> {
  const ctx = await getCalendarContext('read');
  const supabase = await createClient();
  const { data } = await supabase
    .from('memberships')
    .select('user_id, role, profiles(full_name)')
    .eq('organisation_id', ctx.orgId)
    .eq('status', 'active')
    .order('role');

  return ((data ?? []) as MembershipUserRow[]).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return {
      id: row.user_id,
      name: profile?.full_name ?? row.user_id,
      role: row.role,
    };
  });
}

export async function getCalendarEvents(filters: CalendarRangeFilters): Promise<CalendarEventView[]> {
  const ctx = await getCalendarContext('read');
  const supabase = await createClient();
  const attendeeEventIds = filters.userId && filters.userId !== 'all'
    ? await eventIdsForAttendeeUser(filters.userId)
    : null;
  const { data } = await supabase
    .from('calendar_events')
    .select('*, calendar_resources(id, name, allow_double_booking)')
    .eq('workspace_id', ctx.orgId)
    .lte('start_at', filters.end)
    .or(`end_at.gte.${filters.start},end_at.is.null,recurrence_rule.neq.none`)
    .order('start_at');

  const stored = ((data ?? []) as CalendarEventRow[])
    .flatMap((row) => expandRecurringEvent(rowToEvent(row), filters.start, filters.end))
    .filter((event) => !attendeeEventIds || attendeeEventIds.has(event.id.split(':')[0]))
    .filter((event) => matchesFilters(event, filters));
  const derived = attendeeEventIds ? [] : await derivedEventsForRange(filters);
  return [...stored, ...derived].sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export async function getCalendarFundsAndAccounts(): Promise<{
  funds: { id: string; name: string }[];
  accounts: { id: string; code: string; name: string }[];
}> {
  const ctx = await getCalendarContext('read');
  const supabase = await createClient();
  const [{ data: funds }, { data: accounts }] = await Promise.all([
    supabase
      .from('funds')
      .select('id, name')
      .eq('organisation_id', ctx.orgId)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('accounts')
      .select('id, code, name')
      .eq('organisation_id', ctx.orgId)
      .eq('is_active', true)
      .order('code'),
  ]);
  return {
    funds: funds ?? [],
    accounts: accounts ?? [],
  };
}

export async function getEventsByDateRange(filters: CalendarRangeFilters): Promise<CalendarEventView[]> {
  return getCalendarEvents(filters);
}

export async function getAgendaEvents(limit = 12): Promise<CalendarEventView[]> {
  const start = new Date();
  const end = new Date(start.getTime() + 45 * 24 * 60 * 60 * 1000);
  const events = await getCalendarEvents({
    start: start.toISOString(),
    end: end.toISOString(),
    includeFinance: true,
    includeLettings: true,
    includeReminders: true,
  });
  return events.slice(0, limit);
}

export async function getCalendarEventDetail(eventId: string): Promise<CalendarEventDetail | null> {
  const ctx = await getCalendarContext('read');
  const supabase = await createClient();
  const [{ data: event }, { data: attendees }, { data: reminders }, { data: links }] = await Promise.all([
    supabase
      .from('calendar_events')
      .select('*, calendar_resources(id, name, allow_double_booking)')
      .eq('workspace_id', ctx.orgId)
      .eq('id', eventId)
      .maybeSingle(),
    supabase.from('calendar_event_attendees').select('*').eq('workspace_id', ctx.orgId).eq('event_id', eventId),
    supabase.from('calendar_reminders').select('*').eq('workspace_id', ctx.orgId).eq('event_id', eventId),
    supabase.from('calendar_event_links').select('*').eq('workspace_id', ctx.orgId).eq('event_id', eventId),
  ]);

  if (!event) return null;
  return {
    ...rowToEvent(event as CalendarEventRow),
    attendees: (attendees ?? []) as CalendarAttendee[],
    reminders: (reminders ?? []) as CalendarReminder[],
    links: (links ?? []) as CalendarEventLink[],
  };
}

export async function checkResourceAvailability(input: {
  resourceId: string;
  startAt: string;
  endAt: string;
  excludeEventId?: string | null;
}): Promise<CalendarActionResult<{ available: boolean; conflicts: CalendarEventView[] }>> {
  const ctx = await getCalendarContext('read');
  const supabase = await createClient();
  const { data: resource } = await supabase
    .from('calendar_resources')
    .select('allow_double_booking')
    .eq('workspace_id', ctx.orgId)
    .eq('id', input.resourceId)
    .maybeSingle();

  if (resource?.allow_double_booking) {
    return { data: { available: true, conflicts: [] } };
  }

  const { data } = await supabase
    .from('calendar_events')
    .select('*, calendar_resources(id, name, allow_double_booking)')
    .eq('workspace_id', ctx.orgId)
    .eq('resource_id', input.resourceId)
    .eq('status', 'scheduled')
    .lt('start_at', input.endAt);

  const conflicts = ((data ?? []) as CalendarEventRow[])
    .filter((row) => row.id !== input.excludeEventId)
    .filter((row) => eventsOverlap(row.start_at, row.end_at ?? row.start_at, input.startAt, input.endAt))
    .map(rowToEvent);

  return { data: { available: conflicts.length === 0, conflicts } };
}

export async function createCalendarEvent(input: unknown): Promise<CalendarActionResult<{ id: string }>> {
  const ctx = await getCalendarContext('create');
  const parsed = eventInputSchema.safeParse(input instanceof FormData ? eventInputFromForm(input) : input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid event.' };

  if (parsed.data.resource_id && parsed.data.end_at) {
    const availability = await checkResourceAvailability({
      resourceId: parsed.data.resource_id,
      startAt: parsed.data.start_at,
      endAt: parsed.data.end_at,
    });
    if (availability.data && !availability.data.available) {
      return { error: 'This resource is already booked for that time.' };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('calendar_events')
    .insert({
      ...parsed.data,
      workspace_id: ctx.orgId,
      created_by: ctx.user.id,
      updated_by: ctx.user.id,
    })
    .select('id')
    .single();

  if (error || !data) return { error: error?.message ?? 'Could not create event.' };
  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'calendar_event_created',
    entityType: 'calendar_event',
    entityId: data.id,
    metadata: { title: parsed.data.title, category: parsed.data.category },
  });
  revalidatePath('/calendar');
  return { data: { id: data.id } };
}

export async function updateCalendarEvent(eventId: string, input: unknown): Promise<CalendarActionResult> {
  const ctx = await getCalendarContext('update');
  const parsed = eventInputSchema.safeParse(input instanceof FormData ? eventInputFromForm(input) : input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid event.' };

  if (parsed.data.resource_id && parsed.data.end_at) {
    const availability = await checkResourceAvailability({
      resourceId: parsed.data.resource_id,
      startAt: parsed.data.start_at,
      endAt: parsed.data.end_at,
      excludeEventId: eventId,
    });
    if (availability.data && !availability.data.available) {
      return { error: 'This resource is already booked for that time.' };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('calendar_events')
    .update({ ...parsed.data, updated_by: ctx.user.id })
    .eq('workspace_id', ctx.orgId)
    .eq('id', eventId);
  if (error) return { error: error.message };
  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'calendar_event_updated',
    entityType: 'calendar_event',
    entityId: eventId,
  });
  revalidatePath('/calendar');
  return { data: null };
}

export async function cancelCalendarEvent(eventId: string): Promise<CalendarActionResult> {
  const ctx = await getCalendarContext('update');
  const supabase = await createClient();
  const { error } = await supabase
    .from('calendar_events')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: ctx.user.id, updated_by: ctx.user.id })
    .eq('workspace_id', ctx.orgId)
    .eq('id', eventId);
  if (error) return { error: error.message };
  await logAuditEvent({ orgId: ctx.orgId, userId: ctx.user.id, action: 'calendar_event_cancelled', entityType: 'calendar_event', entityId: eventId });
  revalidatePath('/calendar');
  return { data: null };
}

export async function deleteCalendarEvent(eventId: string): Promise<CalendarActionResult> {
  const ctx = await getCalendarContext('delete');
  const supabase = await createClient();
  const { error } = await supabase.from('calendar_events').delete().eq('workspace_id', ctx.orgId).eq('id', eventId);
  if (error) return { error: error.message };
  await logAuditEvent({ orgId: ctx.orgId, userId: ctx.user.id, action: 'calendar_event_deleted', entityType: 'calendar_event', entityId: eventId });
  revalidatePath('/calendar');
  return { data: null };
}

export async function addEventAttendee(input: unknown): Promise<CalendarActionResult> {
  const ctx = await getCalendarContext('create');
  const parsed = attendeeInputSchema.safeParse(input instanceof FormData ? {
    event_id: valueFromForm(input, 'event_id'),
    attendee_user_id: valueFromForm(input, 'attendee_user_id'),
    attendee_email: valueFromForm(input, 'attendee_email'),
    attendee_name: valueFromForm(input, 'attendee_name'),
    role: valueFromForm(input, 'role') ?? 'attendee',
    response: 'pending',
    notes: valueFromForm(input, 'notes'),
  } : input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid attendee.' };
  const supabase = await createClient();
  const { error } = await supabase.from('calendar_event_attendees').insert({
    ...parsed.data,
    workspace_id: ctx.orgId,
    invited_by: ctx.user.id,
  });
  if (error) return { error: error.message };
  if (parsed.data.attendee_user_id) {
    const { data: event } = await supabase
      .from('calendar_events')
      .select('title')
      .eq('workspace_id', ctx.orgId)
      .eq('id', parsed.data.event_id)
      .maybeSingle();
    await createPortalNotification({
      workspaceId: ctx.orgId,
      userId: parsed.data.attendee_user_id,
      type: 'event_assigned',
      title: 'Event assigned',
      body: event?.title ? `You were added to ${event.title}.` : 'You were added to a calendar event.',
      sourceType: 'calendar_event',
      sourceId: parsed.data.event_id,
      href: `/portal/calendar?event=${parsed.data.event_id}`,
    });
  }
  await logAuditEvent({ orgId: ctx.orgId, userId: ctx.user.id, action: 'calendar_attendee_added', entityType: 'calendar_event', entityId: parsed.data.event_id });
  revalidatePath('/calendar');
  return { data: null };
}

export async function removeEventAttendee(attendeeId: string): Promise<CalendarActionResult> {
  const ctx = await getCalendarContext('delete');
  const supabase = await createClient();
  const { error } = await supabase.from('calendar_event_attendees').delete().eq('workspace_id', ctx.orgId).eq('id', attendeeId);
  if (error) return { error: error.message };
  revalidatePath('/calendar');
  return { data: null };
}

export async function respondToEvent(attendeeId: string, response: string): Promise<CalendarActionResult> {
  const ctx = await getCalendarContext('read');
  const parsed = z.enum(CALENDAR_ATTENDEE_RESPONSES).safeParse(response);
  if (!parsed.success) return { error: 'Invalid response.' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('calendar_event_attendees')
    .update({ response: parsed.data, responded_at: new Date().toISOString() })
    .eq('workspace_id', ctx.orgId)
    .eq('id', attendeeId);
  if (error) return { error: error.message };
  await logAuditEvent({ orgId: ctx.orgId, userId: ctx.user.id, action: 'calendar_attendee_response_updated', entityType: 'calendar_event_attendee', entityId: attendeeId });
  revalidatePath('/calendar');
  return { data: null };
}

export async function listEventAttendees(eventId: string): Promise<CalendarAttendee[]> {
  const ctx = await getCalendarContext('read');
  const supabase = await createClient();
  const { data } = await supabase.from('calendar_event_attendees').select('*').eq('workspace_id', ctx.orgId).eq('event_id', eventId);
  return (data ?? []) as CalendarAttendee[];
}

export async function createReminder(input: unknown): Promise<CalendarActionResult> {
  const ctx = await getCalendarContext('create');
  const parsed = reminderInputSchema.safeParse(input instanceof FormData ? {
    event_id: valueFromForm(input, 'event_id'),
    title: valueFromForm(input, 'title') ?? '',
    due_at: dateTimeFromForm(input, 'due_at') ?? '',
    assigned_to: valueFromForm(input, 'assigned_to'),
  } : input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid reminder.' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('calendar_reminders').insert({
    ...parsed.data,
    workspace_id: ctx.orgId,
    created_by: ctx.user.id,
  }).select('id').single();
  if (error || !data) return { error: error?.message ?? 'Could not create reminder.' };
  await createPortalNotification({
    workspaceId: ctx.orgId,
    userId: parsed.data.assigned_to,
    type: 'task_due',
    title: 'New reminder assigned',
    body: parsed.data.title,
    sourceType: 'calendar_reminder',
    sourceId: data.id,
    href: '/portal/calendar',
  });
  await logAuditEvent({ orgId: ctx.orgId, userId: ctx.user.id, action: 'calendar_reminder_created', entityType: 'calendar_reminder', entityId: data.id });
  revalidatePath('/calendar');
  return { data: null };
}

export async function updateReminder(reminderId: string, input: unknown): Promise<CalendarActionResult> {
  const ctx = await getCalendarContext('update');
  const parsed = reminderInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid reminder.' };
  const supabase = await createClient();
  const { error } = await supabase.from('calendar_reminders').update(parsed.data).eq('workspace_id', ctx.orgId).eq('id', reminderId);
  if (error) return { error: error.message };
  revalidatePath('/calendar');
  return { data: null };
}

export async function cancelReminder(reminderId: string): Promise<CalendarActionResult> {
  const ctx = await getCalendarContext('update');
  const supabase = await createClient();
  const { error } = await supabase.from('calendar_reminders').update({ state: 'cancelled' }).eq('workspace_id', ctx.orgId).eq('id', reminderId);
  if (error) return { error: error.message };
  revalidatePath('/calendar');
  return { data: null };
}

export async function getDueReminders(limit = 10): Promise<CalendarReminder[]> {
  const ctx = await getCalendarContext('read');
  const supabase = await createClient();
  const { data } = await supabase
    .from('calendar_reminders')
    .select('*')
    .eq('workspace_id', ctx.orgId)
    .in('state', ['scheduled', 'sent'])
    .lte('due_at', new Date().toISOString())
    .order('due_at')
    .limit(limit);
  return (data ?? []) as CalendarReminder[];
}

export async function createResource(input: unknown): Promise<CalendarActionResult> {
  const ctx = await getCalendarContext('create');
  const parsed = resourceInputSchema.safeParse(input instanceof FormData ? {
    name: valueFromForm(input, 'name') ?? '',
    description: valueFromForm(input, 'description'),
    location: valueFromForm(input, 'location'),
    capacity: valueFromForm(input, 'capacity'),
    allow_double_booking: booleanFromForm(input, 'allow_double_booking'),
  } : input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid resource.' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('calendar_resources').insert({
    ...parsed.data,
    workspace_id: ctx.orgId,
    created_by: ctx.user.id,
  }).select('id').single();
  if (error || !data) return { error: error?.message ?? 'Could not create resource.' };
  await logAuditEvent({ orgId: ctx.orgId, userId: ctx.user.id, action: 'calendar_resource_created', entityType: 'calendar_resource', entityId: data.id });
  revalidatePath('/calendar');
  return { data: null };
}

export async function updateResource(resourceId: string, input: unknown): Promise<CalendarActionResult> {
  const ctx = await getCalendarContext('update');
  const parsed = resourceInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid resource.' };
  const supabase = await createClient();
  const { error } = await supabase.from('calendar_resources').update(parsed.data).eq('workspace_id', ctx.orgId).eq('id', resourceId);
  if (error) return { error: error.message };
  revalidatePath('/calendar');
  return { data: null };
}

export async function archiveResource(resourceId: string): Promise<CalendarActionResult> {
  const ctx = await getCalendarContext('delete');
  const supabase = await createClient();
  const { error } = await supabase.from('calendar_resources').update({ is_active: false }).eq('workspace_id', ctx.orgId).eq('id', resourceId);
  if (error) return { error: error.message };
  revalidatePath('/calendar');
  return { data: null };
}

export async function linkEventToRecord(input: unknown): Promise<CalendarActionResult> {
  const ctx = await getCalendarContext('create');
  const parsed = linkInputSchema.safeParse(input instanceof FormData ? {
    event_id: valueFromForm(input, 'event_id'),
    source_type: valueFromForm(input, 'source_type'),
    source_id: valueFromForm(input, 'source_id'),
    label: valueFromForm(input, 'label'),
    href: valueFromForm(input, 'href'),
  } : input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid link.' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('calendar_event_links').insert({
    ...parsed.data,
    workspace_id: ctx.orgId,
    created_by: ctx.user.id,
  }).select('id').single();
  if (error || !data) return { error: error?.message ?? 'Could not create link.' };
  await logAuditEvent({ orgId: ctx.orgId, userId: ctx.user.id, action: 'calendar_link_created', entityType: 'calendar_event_link', entityId: data.id });
  revalidatePath('/calendar');
  return { data: null };
}

export async function unlinkEventFromRecord(linkId: string): Promise<CalendarActionResult> {
  const ctx = await getCalendarContext('delete');
  const supabase = await createClient();
  const { error } = await supabase.from('calendar_event_links').delete().eq('workspace_id', ctx.orgId).eq('id', linkId);
  if (error) return { error: error.message };
  revalidatePath('/calendar');
  return { data: null };
}

export async function getLinkedRecordsForEvent(eventId: string) {
  const ctx = await getCalendarContext('read');
  const supabase = await createClient();
  const { data } = await supabase.from('calendar_event_links').select('*').eq('workspace_id', ctx.orgId).eq('event_id', eventId);
  return data ?? [];
}
