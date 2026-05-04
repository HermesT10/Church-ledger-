import type { CalendarEventView, CalendarRecurrenceRule } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export function eventsOverlap(
  startA: string | Date,
  endA: string | Date,
  startB: string | Date,
  endB: string | Date,
): boolean {
  const aStart = new Date(startA).getTime();
  const aEnd = new Date(endA).getTime();
  const bStart = new Date(startB).getTime();
  const bEnd = new Date(endB).getTime();
  return aStart < bEnd && aEnd > bStart;
}

export function addRecurrenceStep(date: Date, rule: CalendarRecurrenceRule): Date {
  const next = new Date(date);
  if (rule === 'daily') next.setUTCDate(next.getUTCDate() + 1);
  if (rule === 'weekly') next.setUTCDate(next.getUTCDate() + 7);
  if (rule === 'monthly') next.setUTCMonth(next.getUTCMonth() + 1);
  if (rule === 'yearly') next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

export function expandRecurringEvent(
  event: CalendarEventView,
  rangeStart: string,
  rangeEnd: string,
): CalendarEventView[] {
  const rule = event.recurrenceRule ?? 'none';
  if (event.source !== 'stored' || rule === 'none') return [event];

  const windowStart = new Date(rangeStart);
  const windowEnd = new Date(rangeEnd);
  const start = new Date(event.startAt);
  const end = event.endAt ? new Date(event.endAt) : new Date(start.getTime() + DAY_MS);
  const durationMs = Math.max(end.getTime() - start.getTime(), 0);
  const recurrenceUntil = event.recurrenceUntil ? new Date(event.recurrenceUntil) : null;
  const hardStop = recurrenceUntil && recurrenceUntil < windowEnd ? recurrenceUntil : windowEnd;

  const expanded: CalendarEventView[] = [];
  let occurrenceStart = start;
  let guard = 0;

  while (occurrenceStart <= hardStop && guard < 370) {
    const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMs);
    if (occurrenceEnd >= windowStart && occurrenceStart <= windowEnd) {
      expanded.push({
        ...event,
        id: `${event.id}:${occurrenceStart.toISOString()}`,
        startAt: occurrenceStart.toISOString(),
        endAt: event.endAt ? occurrenceEnd.toISOString() : null,
      });
    }
    occurrenceStart = addRecurrenceStep(occurrenceStart, rule);
    guard += 1;
  }

  return expanded;
}

export function buildCalendarRange(view: string, anchorDate: string): { start: string; end: string } {
  const anchor = new Date(`${anchorDate}T12:00:00.000Z`);
  if (Number.isNaN(anchor.getTime())) {
    return buildCalendarRange('month', new Date().toISOString().slice(0, 10));
  }

  if (view === 'day') {
    const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()));
    const end = new Date(start.getTime() + DAY_MS - 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  if (view === 'week') {
    const day = anchor.getUTCDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate() + mondayOffset));
    const end = new Date(start.getTime() + 7 * DAY_MS - 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1) - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}
