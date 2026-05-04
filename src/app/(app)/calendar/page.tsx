import Link from 'next/link';
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PageShell } from '@/components/page-shell';
import {
  addEventAttendee,
  cancelCalendarEvent,
  createReminder,
  getCalendarEventDetail,
  getCalendarEvents,
  getCalendarFundsAndAccounts,
  getCalendarResources,
  getCalendarUsers,
  linkEventToRecord,
} from '@/lib/calendar/actions';
import {
  CALENDAR_CATEGORY_LABELS,
  CALENDAR_EVENT_CATEGORIES,
  CALENDAR_EVENT_STATUSES,
  type CalendarEventCategory,
  type CalendarEventStatus,
  type CalendarEventView,
  type CalendarRangeFilters,
} from '@/lib/calendar/types';
import { buildCalendarRange } from '@/lib/calendar/utils';
import { cn } from '@/lib/utils';
import { CalendarChooserSheet, CALENDAR_CHOOSER_ICONS } from './calendar-chooser-sheet';
import { CalendarEventForm } from './calendar-event-form';
import { CalendarReminderQuickSheet } from './calendar-reminder-quick-sheet';

type SearchParams = {
  date?: string;
  view?: string;
  category?: CalendarEventCategory | 'all';
  status?: string;
  resource?: string;
  user?: string;
  q?: string;
  event?: string;
  new?: string;
  create?: string;
  reminder?: string;
  prefill_category?: string;
  start?: string;
  end?: string;
  finance?: string;
  lettings?: string;
  reminders?: string;
};

function isoDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(new Date(value));
}

function formatTime(value: string, allDay: boolean): string {
  if (allDay) return 'All day';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function navHref(params: SearchParams, overrides: Partial<SearchParams>): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...overrides })) {
    if (value && value !== 'all') next.set(key, String(value));
  }
  const query = next.toString();
  return query ? `/calendar?${query}` : '/calendar';
}

/** Clears sheets / create flows when navigating the calendar chrome. */
function clearOverlayParams(base: Partial<SearchParams> = {}): Partial<SearchParams> {
  return {
    create: undefined,
    new: undefined,
    event: undefined,
    reminder: undefined,
    prefill_category: undefined,
    ...base,
  };
}

/** Value for `datetime-local` inputs from an ISO or parseable date string. */
function toDatetimeLocalInput(isoUtc: string): string {
  const d = new Date(isoUtc);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Opens the add chooser for this calendar date (optional hour for week/day grids). */
function menuAnchorHref(params: SearchParams, dateKey: string, hour = 9): string {
  return navHref(params, {
    date: dateKey,
    create: 'menu',
    start: slotIso(dateKey, hour),
    event: undefined,
    new: undefined,
    reminder: undefined,
    prefill_category: undefined,
  });
}

function shiftDate(anchor: string, view: string, direction: number): string {
  const date = new Date(`${anchor}T12:00:00.000Z`);
  if (view === 'day') date.setUTCDate(date.getUTCDate() + direction);
  else if (view === 'week') date.setUTCDate(date.getUTCDate() + 7 * direction);
  else date.setUTCMonth(date.getUTCMonth() + direction);
  return isoDate(date);
}

function addMinutes(value: string, minutes: number): string {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

function slotIso(day: string, hour = 9): string {
  return `${day}T${String(hour).padStart(2, '0')}:00`;
}

function monthLabel(value: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function rangeLabel(view: string, range: { start: string; end: string }): string {
  const start = new Date(range.start);
  const end = new Date(range.end);
  const formatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (view === 'day') return formatter.format(start);
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function weekdayShort(value: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(new Date(`${value}T12:00:00.000Z`));
}

function dayNumber(value: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric' }).format(new Date(`${value}T12:00:00.000Z`));
}

function buildMonthDays(anchor: string) {
  const monthDate = new Date(`${anchor.slice(0, 7)}-01T12:00:00.000Z`);
  const firstDay = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1));
  const mondayOffset = (firstDay.getUTCDay() + 6) % 7;
  const gridStart = new Date(firstDay);
  gridStart.setUTCDate(firstDay.getUTCDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setUTCDate(gridStart.getUTCDate() + index);
    const key = isoDate(date);
    return {
      key,
      inMonth: date.getUTCMonth() === monthDate.getUTCMonth(),
      isToday: key === isoDate(),
    };
  });
}

function buildWeekDays(rangeStart: string) {
  const start = new Date(rangeStart);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const key = isoDate(date);
    return {
      key,
      label: weekdayShort(key),
      day: dayNumber(key),
      isToday: key === isoDate(),
    };
  });
}

const HOUR_SLOTS = Array.from({ length: 11 }, (_, index) => index + 8);

const CATEGORY_TONE: Record<CalendarEventCategory, string> = {
  general: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/30 dark:text-slate-300',
  worship: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-violet-300',
  trustee_meeting: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300',
  letting: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300',
  finance_deadline: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300',
  payroll: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/40 dark:bg-orange-950/30 dark:text-orange-300',
  gift_aid: 'border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-900/40 dark:bg-pink-950/30 dark:text-pink-300',
  month_end_close: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-300',
  payment_run: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/40 dark:bg-cyan-950/30 dark:text-cyan-300',
  budget_review: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300',
  bank_reconciliation: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-300',
  reminder: 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/40 dark:bg-purple-950/30 dark:text-purple-300',
};

function EventChip({ event, compact = false }: { event: CalendarEventView; compact?: boolean }) {
  return (
    <Link
      href={event.source === 'stored' ? `/calendar?event=${event.id}` : event.href ?? '/calendar'}
      className={cn(
        'relative z-10 block rounded-lg border px-2.5 py-1.5 shadow-xs transition hover:border-primary/30',
        CATEGORY_TONE[event.category],
        event.status === 'cancelled' && 'opacity-60'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn('truncate font-semibold', compact ? 'text-xs' : 'text-sm')}>{event.title}</span>
        {!compact ? <Badge variant={event.source === 'stored' ? 'default' : 'outline'} className="shrink-0 text-[10px]">
          {event.source}
        </Badge> : null}
      </div>
      <div className={cn('mt-1 flex flex-wrap items-center gap-2 text-xs', compact && 'text-[11px]')}>
        <span>{formatTime(event.startAt, event.allDay)}</span>
        {!compact ? <span>{CALENDAR_CATEGORY_LABELS[event.category]}</span> : null}
        {!compact && event.resourceName ? <span>{event.resourceName}</span> : null}
      </div>
    </Link>
  );
}

function MonthView({ events, anchorDate, params }: { events: CalendarEventView[]; anchorDate: string; params: SearchParams }) {
  const days = buildMonthDays(anchorDate);

  return (
    <Card className="overflow-hidden rounded-3xl border-border/70 bg-card shadow-card">
      <div className="grid grid-cols-7 border-b border-border/70 bg-muted/25">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <div key={day} className="px-3 py-3 text-center text-xs font-medium text-muted-foreground">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-7">
        {days.map((day) => {
          const dayEvents = events.filter((event) => event.startAt.slice(0, 10) === day.key);
          return (
            <div key={day.key} className={cn('group relative min-h-36 border-b border-r border-border/60 p-2.5', !day.inMonth && 'bg-muted/20 text-muted-foreground')}>
              <Link
                href={menuAnchorHref(params, day.key, 9)}
                className="absolute inset-0 z-0 rounded-sm"
                aria-label={`Add calendar item on ${day.key}`}
              />
              <div className="relative z-10 flex flex-col gap-1.5 pointer-events-none">
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className={cn(
                      'inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
                      day.isToday && 'bg-primary text-primary-foreground',
                    )}
                    aria-hidden
                  >
                    {dayNumber(day.key)}
                  </span>
                  <span className="text-[11px] font-medium text-muted-foreground opacity-60 md:opacity-70">Add</span>
                </div>
                <div className="pointer-events-auto space-y-1.5">
                  {dayEvents.slice(0, 3).map((event) => <EventChip key={event.id} event={event} compact />)}
                  {dayEvents.length > 3 ? (
                    <p className="pointer-events-none px-2 text-[11px] text-muted-foreground">+{dayEvents.length - 3} more</p>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function TimeSlotEvent({ event }: { event: CalendarEventView }) {
  return (
    <EventChip event={event} compact />
  );
}

function WeekView({ events, rangeStart, params }: { events: CalendarEventView[]; rangeStart: string; params: SearchParams }) {
  const days = buildWeekDays(rangeStart);

  return (
    <Card className="overflow-hidden rounded-3xl border-border/70 bg-card shadow-card">
      <div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] border-b border-border/70 bg-muted/25">
        <div />
        {days.map((day) => (
          <div key={day.key} className="relative border-l border-border/60 px-3 py-3 text-center">
            <Link
              href={menuAnchorHref(params, day.key, 9)}
              className="absolute inset-0 z-0"
              aria-label={`Add calendar item on ${day.key}`}
            />
            <div className="relative z-10 pointer-events-none space-y-1">
              <p className="text-xs text-muted-foreground">{day.label}</p>
              <span
                className={cn(
                  'mt-1 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold',
                  day.isToday && 'bg-primary text-primary-foreground',
                )}
                aria-hidden
              >
                {day.day}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div>
        {HOUR_SLOTS.map((hour) => (
          <div key={hour} className="grid min-h-20 grid-cols-[72px_repeat(7,minmax(0,1fr))] border-b border-border/60">
            <div className="px-3 py-3 text-right text-xs text-muted-foreground">{hour > 12 ? `${hour - 12} pm` : `${hour} am`}</div>
            {days.map((day) => {
              const slotEvents = events.filter((event) => event.startAt.slice(0, 10) === day.key && new Date(event.startAt).getHours() === hour);
              return (
                <div
                  key={`${day.key}-${hour}`}
                  className="relative min-h-20 border-l border-border/60 p-1.5 transition hover:bg-accent/35"
                >
                  <Link
                    href={menuAnchorHref(params, day.key, hour)}
                    className="absolute inset-0 z-0"
                    aria-label={`Add calendar item on ${day.key} at ${hour}:00`}
                  />
                  <div className="relative z-10 pointer-events-auto space-y-1.5">
                    {slotEvents.map((event) => <TimeSlotEvent key={event.id} event={event} />)}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}

function DayView({ events, anchorDate, params }: { events: CalendarEventView[]; anchorDate: string; params: SearchParams }) {
  const dayEvents = events.filter((event) => event.startAt.slice(0, 10) === anchorDate);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="overflow-hidden rounded-3xl border-border/70 bg-card shadow-card">
        {HOUR_SLOTS.map((hour) => {
          const slotEvents = dayEvents.filter((event) => new Date(event.startAt).getHours() === hour);
          return (
            <div key={hour} className="grid min-h-24 grid-cols-[72px_1fr] border-b border-border/60">
              <div className="px-3 py-3 text-right text-xs text-muted-foreground">{hour > 12 ? `${hour - 12} pm` : `${hour} am`}</div>
              <div className="relative min-h-24 border-l border-border/60 p-2 transition hover:bg-accent/35">
                <Link
                  href={menuAnchorHref(params, anchorDate, hour)}
                  className="absolute inset-0 z-0"
                  aria-label={`Add calendar item on ${anchorDate} at ${hour}:00`}
                />
                <div className="relative z-10 pointer-events-auto space-y-2">
                  {slotEvents.map((event) => <EventChip key={event.id} event={event} />)}
                </div>
              </div>
            </div>
          );
        })}
      </Card>
      <Card className="h-fit rounded-3xl border-border/70 bg-card shadow-card">
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Selected day</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {dayEvents.length > 0 ? dayEvents.map((event) => <EventChip key={event.id} event={event} />) : (
            <p className="rounded-2xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
              No events yet. Click a time slot to add one.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AgendaList({ events }: { events: CalendarEventView[] }) {
  if (events.length === 0) {
    return (
      <Card className="shadow-card">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No calendar items match this range.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <Card key={event.id} className="shadow-card">
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{CALENDAR_CATEGORY_LABELS[event.category]}</Badge>
                <Badge variant={event.status === 'scheduled' ? 'default' : 'secondary'}>{event.status}</Badge>
                {event.source === 'derived' && <Badge variant="outline">source linked</Badge>}
              </div>
              <h3 className="mt-2 truncate text-base font-semibold">{event.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDate(event.startAt)} · {formatTime(event.startAt, event.allDay)}
                {event.location ? ` · ${event.location}` : ''}
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={event.source === 'stored' ? `/calendar?event=${event.id}` : event.href ?? '/calendar'}>
                View
              </Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const view = params.view === 'week' || params.view === 'day' || params.view === 'agenda' ? params.view : 'month';
  const anchorDate = params.date ?? isoDate();
  const range = buildCalendarRange(view, anchorDate);
  const statusFilter: CalendarEventStatus | 'all' = CALENDAR_EVENT_STATUSES.some((status) => status === params.status)
    ? (params.status as CalendarEventStatus)
    : 'all';
  const filters: CalendarRangeFilters = {
    start: range.start,
    end: range.end,
    category: params.category ?? 'all',
    status: statusFilter,
    resourceId: params.resource ?? 'all',
    userId: params.user ?? 'all',
    query: params.q,
    includeFinance: params.finance !== '0',
    includeLettings: params.lettings !== '0',
    includeReminders: params.reminders !== '0',
  };

  const [events, resources, users, detail, ledgerPicklists] = await Promise.all([
    getCalendarEvents(filters),
    getCalendarResources(),
    getCalendarUsers(),
    params.event ? getCalendarEventDetail(params.event) : Promise.resolve(null),
    getCalendarFundsAndAccounts(),
  ]);

  const upcoming = events.filter((event) => new Date(event.startAt) >= new Date()).slice(0, 6);

  const menuDate = params.date ?? anchorDate;
  const menuStartStr = params.start ?? slotIso(menuDate, 9);
  const menuEndStr = addMinutes(menuStartStr, 60);
  const menuStartIso = new Date(menuStartStr).toISOString();

  const defaultStartAt = params.start ? new Date(params.start).toISOString() : undefined;
  const defaultEndAt = params.end
    ? new Date(params.end).toISOString()
    : defaultStartAt
      ? addMinutes(defaultStartAt, 60)
      : undefined;

  const openChooser = params.create === 'menu';
  const openReminderSheet = params.reminder === 'new';
  const openCreateSheet = params.new === 'event';

  const defaultCategory =
    params.prefill_category &&
    CALENDAR_EVENT_CATEGORIES.includes(params.prefill_category as CalendarEventCategory)
      ? (params.prefill_category as CalendarEventCategory)
      : undefined;

  const hrefChooserCancel = navHref(params, { create: undefined });
  const reminderCancelHref = navHref(params, { reminder: undefined });

  const reminderDueLocal = toDatetimeLocalInput(menuStartIso);

  const headerSlotStart = slotIso(anchorDate, 9);
  const headerSlotEnd = addMinutes(headerSlotStart, 60);

  const hrefNewEventFromMenu = navHref(params, {
    create: undefined,
    reminder: undefined,
    new: 'event',
    date: menuDate,
    start: menuStartStr,
    end: menuEndStr,
    prefill_category: undefined,
    event: undefined,
  });

  const hrefReminderFromMenu = navHref(params, {
    create: undefined,
    new: undefined,
    reminder: 'new',
    date: menuDate,
    start: menuStartStr,
    prefill_category: undefined,
    event: undefined,
  });

  const hrefLettingFromMenu = navHref(params, {
    create: undefined,
    reminder: undefined,
    new: 'event',
    date: menuDate,
    start: menuStartStr,
    end: menuEndStr,
    prefill_category: 'letting',
    event: undefined,
  });

  const hrefFinanceFromMenu = navHref(params, {
    create: undefined,
    reminder: undefined,
    new: 'event',
    date: menuDate,
    start: menuStartStr,
    end: menuEndStr,
    prefill_category: 'finance_deadline',
    event: undefined,
  });

  return (
    <PageShell>
      <Card className="overflow-hidden rounded-3xl border-border/70 bg-card shadow-card">
        <CardContent className="space-y-5 p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 flex-col items-center justify-center rounded-2xl border border-border/70 bg-background">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(new Date(`${anchorDate}T12:00:00.000Z`))}
                </span>
                <span className="text-2xl font-bold tabular-nums">{dayNumber(anchorDate)}</span>
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight">{monthLabel(anchorDate)}</h1>
                  <Badge variant="outline">Week view ready</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{rangeLabel(view, range)}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <form className="flex min-w-[220px] items-center gap-2 rounded-2xl border border-border/70 bg-background px-3 py-2">
                <input type="hidden" name="view" value={view} />
                <input type="hidden" name="date" value={anchorDate} />
                <input type="hidden" name="category" value={params.category ?? 'all'} />
                <input type="hidden" name="resource" value={params.resource ?? 'all'} />
                <input type="hidden" name="status" value={params.status ?? 'all'} />
                <input type="hidden" name="user" value={params.user ?? 'all'} />
                {params.finance === '0' ? <input type="hidden" name="finance" value="0" /> : null}
                {params.lettings === '0' ? <input type="hidden" name="lettings" value="0" /> : null}
                {params.reminders === '0' ? <input type="hidden" name="reminders" value="0" /> : null}
                <Search size={15} className="text-muted-foreground" />
                <input name="q" defaultValue={params.q ?? ''} placeholder="Search events" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
              </form>
              <div className="flex overflow-hidden rounded-2xl border border-border/70">
                <Button asChild size="icon" variant="ghost" className="rounded-none">
                  <Link href={navHref(params, clearOverlayParams({ date: shiftDate(anchorDate, view, -1) }))}><ChevronLeft size={16} /></Link>
                </Button>
                <Button asChild variant="ghost" className="rounded-none border-x border-border/70 px-4">
                  <Link href={navHref(params, clearOverlayParams({ date: isoDate() }))}>Today</Link>
                </Button>
                <Button asChild size="icon" variant="ghost" className="rounded-none">
                  <Link href={navHref(params, clearOverlayParams({ date: shiftDate(anchorDate, view, 1) }))}><ChevronRight size={16} /></Link>
                </Button>
              </div>
              <select defaultValue={view} className="h-10 rounded-2xl border border-input bg-card px-3 text-sm" aria-label="Calendar view">
                {(['month', 'week', 'day', 'agenda'] as const).map((mode) => (
                  <option key={mode} value={mode}>{mode[0].toUpperCase() + mode.slice(1)} view</option>
                ))}
              </select>
              <Button asChild>
                <Link href={menuAnchorHref(params, anchorDate, 9)}>
                  <CalendarPlus size={16} />
                  Add Event
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link
                  href={navHref(
                    params,
                    clearOverlayParams({
                      reminder: 'new',
                      date: anchorDate,
                      start: headerSlotStart,
                    }),
                  )}
                >
                  Add Reminder
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link
                  href={navHref(
                    params,
                    clearOverlayParams({
                      new: 'event',
                      prefill_category: 'letting',
                      date: anchorDate,
                      start: headerSlotStart,
                      end: headerSlotEnd,
                    }),
                  )}
                >
                  Add Letting
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link
                  href={navHref(
                    params,
                    clearOverlayParams({
                      new: 'event',
                      prefill_category: 'finance_deadline',
                      date: anchorDate,
                      start: headerSlotStart,
                      end: headerSlotEnd,
                    }),
                  )}
                >
                  Add Finance Deadline
                </Link>
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
            <div className="flex flex-wrap gap-2">
              {(['month', 'week', 'day', 'agenda'] as const).map((mode) => (
                <Button key={mode} asChild size="sm" variant={view === mode ? 'default' : 'outline'}>
                  <Link href={navHref(params, clearOverlayParams({ view: mode }))}>{mode[0].toUpperCase() + mode.slice(1)}</Link>
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full bg-muted/35 px-3 py-1.5"><Clock size={13} /> {events.length} items</span>
              <span className="rounded-full bg-muted/35 px-3 py-1.5">{upcoming.length} upcoming</span>
              <Button asChild size="sm" variant="outline">
                <Link href={`/api/calendar/export?start=${range.start}&end=${range.end}`}><Download size={14} /> Export</Link>
              </Button>
            </div>
          </div>

          <form className="grid gap-3 rounded-2xl border border-border/60 bg-muted/20 p-3 md:grid-cols-4 xl:grid-cols-8">
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="date" value={anchorDate} />
            {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground xl:col-span-1">
              <SlidersHorizontal size={15} />
              Filters
            </div>
            <select name="category" defaultValue={params.category ?? 'all'} className="h-10 rounded-xl border border-input bg-card px-3 text-sm">
              <option value="all">All categories</option>
              {CALENDAR_EVENT_CATEGORIES.map((category) => <option key={category} value={category}>{CALENDAR_CATEGORY_LABELS[category]}</option>)}
            </select>
            <select name="resource" defaultValue={params.resource ?? 'all'} className="h-10 rounded-xl border border-input bg-card px-3 text-sm">
              <option value="all">All resources</option>
              {resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}
            </select>
            <select name="status" defaultValue={params.status ?? 'all'} className="h-10 rounded-xl border border-input bg-card px-3 text-sm">
              <option value="all">All statuses</option>
              {CALENDAR_EVENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
            <select name="user" defaultValue={params.user ?? 'all'} className="h-10 rounded-xl border border-input bg-card px-3 text-sm">
              <option value="all">All users</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="hidden" name="finance" value="0" />
              <input type="checkbox" name="finance" value="1" defaultChecked={params.finance !== '0'} /> Finance
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="hidden" name="lettings" value="0" />
              <input type="checkbox" name="lettings" value="1" defaultChecked={params.lettings !== '0'} /> Lettings
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="hidden" name="reminders" value="0" />
              <input type="checkbox" name="reminders" value="1" defaultChecked={params.reminders !== '0'} /> Reminders
            </label>
            <Button type="submit" variant="outline">Apply</Button>
          </form>
        </CardContent>
      </Card>

      {view === 'month' ? <MonthView events={events} anchorDate={anchorDate} params={params} /> : null}
      {view === 'week' ? <WeekView events={events} rangeStart={range.start} params={params} /> : null}
      {view === 'day' ? <DayView events={events} anchorDate={anchorDate} params={params} /> : null}
      {view === 'agenda' ? <AgendaList events={events} /> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card className="rounded-3xl border-border/70 bg-card shadow-card">
          <CardHeader><CardTitle className="text-sm font-semibold">Upcoming</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {upcoming.map((event) => <EventChip key={event.id} event={event} />)}
            {upcoming.length === 0 && <p className="text-sm text-muted-foreground">No upcoming events in this range.</p>}
          </CardContent>
        </Card>
        <Card id="add-reminder" className="rounded-3xl border-border/70 bg-card shadow-card">
          <CardHeader><CardTitle className="text-sm font-semibold">Quick reminder</CardTitle></CardHeader>
          <CardContent>
            <form action={async (formData) => { 'use server'; await createReminder(formData); }} className="grid gap-3">
              <Input name="title" placeholder="Reminder title" required />
              <Input name="due_at" type="datetime-local" required />
              <Button type="submit" variant="outline">Create Reminder</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {openChooser && !detail ? (
        <CalendarChooserSheet
          headline="What would you like to add?"
          subtitle={`${formatDate(menuStartIso)} · ${formatTime(menuStartIso, false)}`}
          cancelHref={hrefChooserCancel}
          choices={[
            {
              title: 'Calendar event',
              description: 'Meetings, bookings, and other dated calendar entries.',
              href: hrefNewEventFromMenu,
              icon: CALENDAR_CHOOSER_ICONS.event,
            },
            {
              title: 'Reminder',
              description: 'A dated reminder task — adjust the due time before saving.',
              href: hrefReminderFromMenu,
              icon: CALENDAR_CHOOSER_ICONS.reminder,
            },
            {
              title: 'Letting',
              description: `Calendar event with category “${CALENDAR_CATEGORY_LABELS.letting}”.`,
              href: hrefLettingFromMenu,
              icon: CALENDAR_CHOOSER_ICONS.letting,
            },
            {
              title: 'Finance deadline',
              description: `Calendar event with category “${CALENDAR_CATEGORY_LABELS.finance_deadline}”.`,
              href: hrefFinanceFromMenu,
              icon: CALENDAR_CHOOSER_ICONS.finance,
            },
          ]}
        />
      ) : null}

      {openReminderSheet && !detail ? (
        <CalendarReminderQuickSheet defaultDueLocal={reminderDueLocal} cancelHref={reminderCancelHref} />
      ) : null}

      {openCreateSheet && !detail ? (
        <Sheet defaultOpen>
          <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
            <SheetHeader>
              <SheetTitle>Create calendar event</SheetTitle>
              <SheetDescription>
                {defaultStartAt ? `Starting ${formatDate(defaultStartAt)} · ${formatTime(defaultStartAt, false)}` : 'Choose the details for this calendar item.'}
              </SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-6">
              <CalendarEventForm
                resources={resources ?? []}
                funds={ledgerPicklists.funds}
                accounts={ledgerPicklists.accounts}
                defaultStartAt={defaultStartAt}
                defaultEndAt={defaultEndAt}
                defaultCategory={defaultCategory}
              />
            </div>
          </SheetContent>
        </Sheet>
      ) : null}

      {detail && (
        <Sheet defaultOpen>
          <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
            <SheetHeader>
              <SheetTitle>{detail.title}</SheetTitle>
              <SheetDescription>{formatDate(detail.startAt)} · {formatTime(detail.startAt, detail.allDay)}</SheetDescription>
            </SheetHeader>
            <div className="space-y-6 px-4 pb-6">
              <section className="space-y-3">
                <h3 className="font-semibold">Overview</h3>
                <CalendarEventForm
                  resources={resources ?? []}
                  funds={ledgerPicklists.funds}
                  accounts={ledgerPicklists.accounts}
                  detail={detail}
                />
                <form action={async () => { 'use server'; await cancelCalendarEvent(detail.id); }}>
                  <Button variant="outline" type="submit">Cancel Event</Button>
                </form>
              </section>
              <section className="space-y-3">
                <h3 className="font-semibold">Attendees</h3>
                {detail.attendees.map((attendee) => (
                  <div key={attendee.id} className="rounded-xl border p-3 text-sm">
                    {attendee.attendee_name ?? attendee.attendee_email ?? attendee.attendee_user_id} · {attendee.response}
                  </div>
                ))}
                <form action={async (formData) => { 'use server'; await addEventAttendee(formData); }} className="grid gap-2">
                  <input type="hidden" name="event_id" value={detail.id} />
                  <Input name="attendee_name" placeholder="Name" />
                  <Input name="attendee_email" type="email" placeholder="Email" />
                  <Button type="submit" size="sm">Invite attendee</Button>
                </form>
              </section>
              <section className="space-y-3">
                <h3 className="font-semibold">Reminders</h3>
                {detail.reminders.map((reminder) => (
                  <div key={reminder.id} className="rounded-xl border p-3 text-sm">
                    {reminder.title} · {formatDate(reminder.due_at)}
                  </div>
                ))}
                <form action={async (formData) => { 'use server'; await createReminder(formData); }} className="grid gap-2">
                  <input type="hidden" name="event_id" value={detail.id} />
                  <Input name="title" placeholder="Reminder title" />
                  <Input name="due_at" type="datetime-local" />
                  <Button type="submit" size="sm">Add reminder</Button>
                </form>
              </section>
              <section className="space-y-3">
                <h3 className="font-semibold">Linked Records</h3>
                {detail.links.map((link) => (
                  <div key={link.id} className="rounded-xl border p-3 text-sm">
                    {link.href ? <Link href={link.href}>{link.label ?? link.source_type}</Link> : link.label ?? link.source_type}
                  </div>
                ))}
                <form action={async (formData) => { 'use server'; await linkEventToRecord(formData); }} className="grid gap-2">
                  <input type="hidden" name="event_id" value={detail.id} />
                  <Input name="source_type" placeholder="Source type e.g. bill" />
                  <Input name="source_id" placeholder="Source record UUID" />
                  <Input name="label" placeholder="Label" />
                  <Input name="href" placeholder="Link path" />
                  <Button type="submit" size="sm">Link record</Button>
                </form>
              </section>
              <section className="space-y-2">
                <h3 className="font-semibold">Documents</h3>
                <p className="text-sm text-muted-foreground">Documents stay in their source modules for now. Linked records above provide the route back to evidence and attachments.</p>
              </section>
              <section className="space-y-2">
                <h3 className="font-semibold">Audit History</h3>
                <p className="text-sm text-muted-foreground">Calendar changes are written to the audit log with event and link identifiers.</p>
              </section>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </PageShell>
  );
}
