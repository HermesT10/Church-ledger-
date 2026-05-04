import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { expandRecurringEvent, eventsOverlap, buildCalendarRange } from '../src/lib/calendar/utils';
import type { CalendarEventView } from '../src/lib/calendar/types';

const migration = readFileSync(
  new URL('../supabase/migrations/20260429140400_calendar_feature.sql', import.meta.url),
  'utf8',
);
const types = readFileSync(new URL('../src/lib/calendar/types.ts', import.meta.url), 'utf8');
const actions = readFileSync(new URL('../src/lib/calendar/actions.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/app/(app)/calendar/page.tsx', import.meta.url), 'utf8');
const sidebar = readFileSync(new URL('../src/components/app-sidebar.tsx', import.meta.url), 'utf8');
const dashboard = readFileSync(new URL('../src/lib/reports/dashboard.ts', import.meta.url), 'utf8');
const exportRoute = readFileSync(new URL('../src/app/api/calendar/export/route.ts', import.meta.url), 'utf8');

describe('calendar schema', () => {
  it('adds all calendar tables with RLS and indexes', () => {
    expect(migration).toContain('create table if not exists public.calendar_events');
    expect(migration).toContain('create table if not exists public.calendar_event_attendees');
    expect(migration).toContain('create table if not exists public.calendar_reminders');
    expect(migration).toContain('create table if not exists public.calendar_resources');
    expect(migration).toContain('create table if not exists public.calendar_event_links');
    expect(migration).toContain('alter table public.calendar_events enable row level security');
    expect(migration).toContain('idx_calendar_events_workspace_range');
    expect(migration).toContain('idx_calendar_events_resource_range');
  });

  it('models workspace, private, and selected-user visibility safely', () => {
    expect(migration).toContain("visibility in ('workspace', 'private', 'selected_users')");
    expect(migration).toContain('can_read_calendar_event');
    expect(migration).toContain('is_calendar_event_attendee');
    expect(migration).toContain('created_by = auth.uid()');
  });

  it('seeds default church resources', () => {
    expect(migration).toContain('Main Hall');
    expect(migration).toContain('Small Hall');
    expect(migration).toContain('Sanctuary');
    expect(migration).toContain('Meeting Room');
    expect(migration).toContain('Kitchen');
    expect(migration).toContain('Office');
  });
});

describe('calendar services', () => {
  it('defines categories and labels', () => {
    expect(types).toContain('finance_deadline');
    expect(types).toContain('trustee_meeting');
    expect(types).toContain('gift_aid');
    expect(types).toContain('month_end_close');
    expect(types).toContain('CALENDAR_CATEGORY_LABELS');
  });

  it('derives workspace scope and logs audit events', () => {
    expect(actions).toContain('getActiveOrg');
    expect(actions).toContain('workspace_id: ctx.orgId');
    expect(actions).toContain('calendar_event_created');
    expect(actions).toContain('calendar_event_updated');
    expect(actions).toContain('calendar_attendee_response_updated');
  });

  it('references source modules for derived events without storing duplicates', () => {
    expect(actions).toContain(".from('bills')");
    expect(actions).toContain(".from('lettings_charges')");
    expect(actions).toContain(".from('payroll_runs')");
    expect(actions).toContain(".from('payment_runs')");
    expect(actions).toContain(".from('gift_aid_claim_batches')");
    expect(actions).toContain("id: `month_end_close:");
    expect(actions).toContain("id: `bank_reconciliation:");
  });

  it('checks resource overlaps by date range', () => {
    expect(actions).toContain('checkResourceAvailability');
    expect(actions).toContain("resource?.allow_double_booking");
    expect(actions).toContain('eventsOverlap');
    expect(eventsOverlap('2026-04-29T10:00:00Z', '2026-04-29T11:00:00Z', '2026-04-29T10:30:00Z', '2026-04-29T12:00:00Z')).toBe(true);
    expect(eventsOverlap('2026-04-29T10:00:00Z', '2026-04-29T11:00:00Z', '2026-04-29T11:00:00Z', '2026-04-29T12:00:00Z')).toBe(false);
  });
});

describe('calendar UI and integrations', () => {
  it('exposes calendar navigation, views, forms, and export', () => {
    expect(sidebar).toContain("href: '/calendar'");
    expect(page).toContain('Add Event');
    expect(page).toContain('Add Letting');
    expect(page).toContain('Add Reminder');
    expect(page).toContain('Add Finance Deadline');
    expect(page).toContain('Export');
    expect(page).toContain("['month', 'week', 'day', 'agenda']");
    expect(page).toContain('MonthView');
    expect(page).toContain('WeekView');
    expect(page).toContain('DayView');
    expect(page).toContain('CATEGORY_TONE');
    expect(exportRoute).toContain('text/calendar');
  });

  it('supports click-to-create date and time slot links', () => {
    expect(page).toContain("new: 'event'");
    expect(page).toContain('slotIso(day.key, 9)');
    expect(page).toContain('slotIso(day.key, hour)');
    expect(page).toContain('slotIso(anchorDate, hour)');
    expect(page).toContain('defaultStartAt');
    expect(page).toContain('Create calendar event');
  });

  it('feeds dashboard todo items from calendar events and reminders', () => {
    expect(dashboard).toContain(".from('calendar_events')");
    expect(dashboard).toContain(".from('calendar_reminders')");
    expect(dashboard).toContain('overdue calendar reminder');
    expect(dashboard).toContain('/calendar?view=agenda');
  });
});

describe('calendar pure helpers', () => {
  it('calculates day, week, and month ranges', () => {
    expect(buildCalendarRange('day', '2026-04-29').start).toBe('2026-04-29T00:00:00.000Z');
    expect(buildCalendarRange('week', '2026-04-29').start).toBe('2026-04-27T00:00:00.000Z');
    expect(buildCalendarRange('month', '2026-04-29').start).toBe('2026-04-01T00:00:00.000Z');
  });

  it('expands recurring events inside a range', () => {
    const event: CalendarEventView = {
      id: 'event-1',
      source: 'stored',
      title: 'Weekly rehearsal',
      category: 'general',
      status: 'scheduled',
      startAt: '2026-04-01T10:00:00.000Z',
      endAt: '2026-04-01T11:00:00.000Z',
      allDay: false,
      recurrenceRule: 'weekly',
    };

    const expanded = expandRecurringEvent(event, '2026-04-01T00:00:00.000Z', '2026-04-30T23:59:59.000Z');
    expect(expanded).toHaveLength(5);
    expect(expanded[1].startAt).toBe('2026-04-08T10:00:00.000Z');
  });
});
