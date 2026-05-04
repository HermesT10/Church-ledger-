'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { createCalendarEvent, updateCalendarEvent } from '@/lib/calendar/actions';
import type { CalendarResource } from '@/lib/calendar/types';
import {
  CALENDAR_CATEGORY_LABELS,
  CALENDAR_EVENT_CATEGORIES,
  CALENDAR_EVENT_STATUSES,
  CALENDAR_RECURRENCE_LABELS,
  CALENDAR_RECURRENCE_RULES,
  CALENDAR_STATUS_LABELS,
  CALENDAR_VISIBILITY_LABELS,
  CALENDAR_VISIBILITIES,
  type CalendarEventDetail,
  type CalendarEventCategory,
  type CalendarRecurrenceRule,
  type CalendarVisibility,
} from '@/lib/calendar/types';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function isoToLocalDateOnly(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isoToDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function addOneHourIso(iso: string): string {
  const d = new Date(iso);
  d.setHours(d.getHours() + 1);
  return d.toISOString();
}

export type CalendarEventFormProps = {
  resources: Pick<CalendarResource, 'id' | 'name'>[];
  funds: { id: string; name: string }[];
  accounts: { id: string; code: string; name: string }[];
  detail?: CalendarEventDetail | null;
  defaultStartAt?: string;
  defaultEndAt?: string;
  /** When creating from chooser (e.g. letting / finance deadline shortcut). */
  defaultCategory?: CalendarEventCategory;
};

export function CalendarEventForm({
  resources,
  funds,
  accounts,
  detail,
  defaultStartAt,
  defaultEndAt,
  defaultCategory,
}: CalendarEventFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const resolvedStart = detail?.startAt ?? defaultStartAt ?? new Date().toISOString();
  const resolvedEnd = detail?.endAt ?? defaultEndAt ?? addOneHourIso(resolvedStart);

  const [allDay, setAllDay] = useState(detail?.allDay ?? false);
  const [startDay, setStartDay] = useState(() => isoToLocalDateOnly(resolvedStart));
  const [endDay, setEndDay] = useState(() => isoToLocalDateOnly(resolvedEnd));
  const [startTimed, setStartTimed] = useState(() => isoToDatetimeLocalValue(resolvedStart));
  const [endTimed, setEndTimed] = useState(() => isoToDatetimeLocalValue(resolvedEnd));
  const [category, setCategory] = useState<CalendarEventCategory>(
    detail?.category ?? defaultCategory ?? 'general',
  );
  const [recurrenceRule, setRecurrenceRule] = useState<CalendarRecurrenceRule>(
    detail?.recurrenceRule ?? 'none',
  );

  const categoryHint = useMemo(() => {
    if (category === 'letting') {
      return 'For lettings invoices or charges, link the record after saving from the event detail panel, or set fund/account links below in Advanced.';
    }
    if (
      category === 'finance_deadline' ||
      category === 'payment_run' ||
      category === 'payroll' ||
      category === 'gift_aid' ||
      category === 'budget_review' ||
      category === 'bank_reconciliation' ||
      category === 'month_end_close'
    ) {
      return 'Finance-related events often mirror modules (bills, payment runs). Use Advanced to link a fund or account; detailed source links can be added after saving.';
    }
    return null;
  }, [category]);

  function appendStandardFields(fd: FormData, form: HTMLFormElement) {
    const title = (form.querySelector('[name="title"]') as HTMLInputElement)?.value?.trim() ?? '';
    fd.set('title', title);

    const description = (form.querySelector('[name="description"]') as HTMLTextAreaElement)?.value?.trim();
    if (description) fd.set('description', description);

    const location = (form.querySelector('[name="location"]') as HTMLInputElement)?.value?.trim();
    if (location) fd.set('location', location);

    fd.set('category', category);

    const status = (form.querySelector('[name="status"]') as HTMLSelectElement)?.value ?? 'scheduled';
    fd.set('status', status);

    const visibility =
      (form.querySelector('[name="visibility"]') as HTMLSelectElement)?.value ?? 'workspace';
    fd.set('visibility', visibility);

    const resourceId = (form.querySelector('[name="resource_id"]') as HTMLSelectElement)?.value?.trim();
    if (resourceId) fd.set('resource_id', resourceId);

    fd.set('recurrence_rule', recurrenceRule);

    const recurrenceUntil = (form.querySelector('[name="recurrence_until"]') as HTMLInputElement)?.value;
    if (recurrenceRule !== 'none' && recurrenceUntil?.trim()) {
      fd.set('recurrence_until', new Date(recurrenceUntil).toISOString());
    }

    const fundId = (form.querySelector('[name="linked_fund_id"]') as HTMLSelectElement)?.value?.trim();
    if (fundId) fd.set('linked_fund_id', fundId);

    const accountId = (form.querySelector('[name="linked_account_id"]') as HTMLSelectElement)?.value?.trim();
    if (accountId) fd.set('linked_account_id', accountId);

    fd.set('all_day', allDay ? 'true' : 'false');

    if (allDay) {
      fd.set('start_at', `${startDay}T00:00:00.000Z`);
      fd.set('end_at', `${endDay}T23:59:59.999Z`);
    } else {
      fd.set('start_at', new Date(startTimed).toISOString());
      if (endTimed?.trim()) {
        fd.set('end_at', new Date(endTimed).toISOString());
      }
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;

    startTransition(async () => {
      const fd = new FormData();
      if (detail?.id) fd.append('event_id', detail.id);
      appendStandardFields(fd, form);

      if (detail?.id) {
        const result = await updateCalendarEvent(detail.id, fd);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success('Event updated.');
        router.refresh();
        return;
      }

      const result = await createCalendarEvent(fd);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Event created.');
      router.push('/calendar');
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Event details</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Required fields to place this on the calendar.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="calendar-title">Title</Label>
          <Input
            id="calendar-title"
            name="title"
            placeholder="Add title"
            defaultValue={detail?.title ?? ''}
            required
            autoComplete="off"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
          <div className="space-y-0.5">
            <Label htmlFor="all-day" className="text-sm font-medium">
              All day
            </Label>
            <p className="text-xs text-muted-foreground">No start/end times — runs across full days.</p>
          </div>
          <Switch id="all-day" checked={allDay} onCheckedChange={setAllDay} />
        </div>

        {allDay ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="start-day">Start</Label>
              <Input
                id="start-day"
                type="date"
                value={startDay}
                onChange={(ev) => setStartDay(ev.target.value)}
                required
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-day">End</Label>
              <Input
                id="end-day"
                type="date"
                value={endDay}
                onChange={(ev) => setEndDay(ev.target.value)}
                required
                min={startDay}
                className="w-full"
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="start-datetime">Start</Label>
              <Input
                id="start-datetime"
                type="datetime-local"
                value={startTimed}
                onChange={(ev) => setStartTimed(ev.target.value)}
                required
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-datetime">End</Label>
              <Input
                id="end-datetime"
                type="datetime-local"
                value={endTimed}
                onChange={(ev) => setEndTimed(ev.target.value)}
                className="w-full"
              />
            </div>
          </div>
        )}
      </section>

      <Separator />

      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Optional details</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Location, notes, and event type.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="event-type">Event type</Label>
          <select
            id="event-type"
            value={category}
            onChange={(ev) => setCategory(ev.target.value as CalendarEventCategory)}
            className={cn(
              'flex h-10 w-full rounded-xl border border-input bg-card px-3 text-sm shadow-xs',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
            )}
          >
            {CALENDAR_EVENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CALENDAR_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        {categoryHint ? (
          <p className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground leading-relaxed">
            {categoryHint}
          </p>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            name="location"
            placeholder="Room, address, or video link"
            defaultValue={detail?.location ?? ''}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="attendees-placeholder">Attendees</Label>
          <Input
            id="attendees-placeholder"
            disabled
            placeholder="Coming soon — invite from the event after saving"
            className="bg-muted/40"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Notes</Label>
          <Textarea
            id="description"
            name="description"
            placeholder="Agenda, setup notes, or reminders"
            rows={3}
            defaultValue={detail?.description ?? ''}
          />
        </div>
      </section>

      <Separator />

      <details className="group rounded-2xl border border-border/70 bg-muted/10 open:bg-muted/20">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden flex items-center justify-between gap-2">
          Advanced
          <span className="text-xs font-normal text-muted-foreground group-open:hidden">
            Scheduling, visibility, links
          </span>
        </summary>
        <div className="border-t border-border/60 px-4 py-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                defaultValue={detail?.status ?? 'scheduled'}
                className="flex h-10 w-full rounded-xl border border-input bg-card px-3 text-sm shadow-xs"
              >
                {CALENDAR_EVENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {CALENDAR_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="visibility">Who can see this</Label>
              <select
                id="visibility"
                name="visibility"
                defaultValue={(detail?.visibility ?? 'workspace') as CalendarVisibility}
                className="flex h-10 w-full rounded-xl border border-input bg-card px-3 text-sm shadow-xs"
              >
                {CALENDAR_VISIBILITIES.map((v) => (
                  <option key={v} value={v}>
                    {CALENDAR_VISIBILITY_LABELS[v]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="resource_id">Room / resource</Label>
            <select
              id="resource_id"
              name="resource_id"
              defaultValue={detail?.resourceId ?? ''}
              className="flex h-10 w-full rounded-xl border border-input bg-card px-3 text-sm shadow-xs"
            >
              <option value="">None</option>
              {resources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="recurrence_rule">Repeat</Label>
              <select
                id="recurrence_rule"
                value={recurrenceRule}
                onChange={(ev) => setRecurrenceRule(ev.target.value as CalendarRecurrenceRule)}
                className="flex h-10 w-full rounded-xl border border-input bg-card px-3 text-sm shadow-xs"
              >
                {CALENDAR_RECURRENCE_RULES.map((r) => (
                  <option key={r} value={r}>
                    {CALENDAR_RECURRENCE_LABELS[r]}
                  </option>
                ))}
              </select>
            </div>
            <div className={cn('space-y-2', recurrenceRule === 'none' && 'opacity-50 pointer-events-none')}>
              <Label htmlFor="recurrence_until">Repeat ends</Label>
              <Input
                id="recurrence_until"
                name="recurrence_until"
                type="datetime-local"
                defaultValue={
                  detail?.recurrenceUntil ? isoToDatetimeLocalValue(detail.recurrenceUntil) : ''
                }
                disabled={recurrenceRule === 'none'}
              />
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="linked_fund_id">Linked fund</Label>
              <select
                id="linked_fund_id"
                name="linked_fund_id"
                defaultValue={detail?.linkedFundId ?? ''}
                className="flex h-10 w-full rounded-xl border border-input bg-card px-3 text-sm shadow-xs"
              >
                <option value="">None</option>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="linked_account_id">Linked account</Label>
              <select
                id="linked_account_id"
                name="linked_account_id"
                defaultValue={detail?.linkedAccountId ?? ''}
                className="flex h-10 w-full rounded-xl border border-input bg-card px-3 text-sm shadow-xs"
              >
                <option value="">None</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {detail?.linkedSourceType && detail?.linkedSourceId ? (
            <p className="text-xs text-muted-foreground rounded-lg bg-muted/40 px-3 py-2">
              Linked record:{' '}
              <span className="font-medium text-foreground">
                {detail.linkedSourceType.replace(/_/g, ' ')}
              </span>{' '}
              · manage extra links from the event detail panel after saving.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Source links (bills, letting charges, etc.) can be added under Linked records after the event is created.
            </p>
          )}
        </div>
      </details>

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? 'Saving…' : detail?.id ? 'Save changes' : 'Create event'}
      </Button>
    </form>
  );
}
