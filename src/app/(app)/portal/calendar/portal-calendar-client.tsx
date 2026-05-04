'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { CalendarEventCategory, CalendarEventView } from '@/lib/calendar/types';
import type { PortalTask, PortalTaskStatus } from '@/lib/portal/types';
import type { PortalCalendarUserOption } from '@/lib/portal/calendar';
import {
  createPortalCalendarEvent,
  invitePortalCalendarAttendee,
  updatePortalCalendarTaskStatus,
} from '@/lib/portal/calendar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

function formatDateTime(value: string, allDay?: boolean) {
  if (allDay) return new Date(value).toLocaleDateString('en-GB');
  return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

function label(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function PortalCalendarClient({
  events,
  tasks,
  users,
  canCreate,
  canInvite,
}: {
  events: CalendarEventView[];
  tasks: PortalTask[];
  users: PortalCalendarUserOption[];
  canCreate: boolean;
  canInvite: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<CalendarEventView | null>(events[0] ?? null);
  const [inviteUserId, setInviteUserId] = useState('');
  const [isPending, startTransition] = useTransition();

  const groupedEvents = useMemo(() => {
    return events.reduce<Record<string, CalendarEventView[]>>((groups, event) => {
      const key = event.startAt.slice(0, 10);
      groups[key] = groups[key] ?? [];
      groups[key].push(event);
      return groups;
    }, {});
  }, [events]);

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await createPortalCalendarEvent({
        title: String(formData.get('title') ?? ''),
        description: String(formData.get('description') ?? '') || null,
        category: String(formData.get('category') ?? 'general') as CalendarEventCategory,
        startAt: new Date(String(formData.get('start_at') ?? '')).toISOString(),
        endAt: formData.get('end_at') ? new Date(String(formData.get('end_at'))).toISOString() : null,
        allDay: formData.get('all_day') === 'on',
        location: String(formData.get('location') ?? '') || null,
        visibility: 'selected_users',
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Event created.');
      setOpen(false);
      router.refresh();
    });
  }

  function handleInvite() {
    if (!selected || !inviteUserId) return;
    startTransition(async () => {
      const result = await invitePortalCalendarAttendee({ eventId: selected.id, attendeeUserId: inviteUserId });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('User invited.');
      setInviteUserId('');
      router.refresh();
    });
  }

  function handleTaskStatus(taskId: string, status: PortalTaskStatus) {
    startTransition(async () => {
      const result = await updatePortalCalendarTaskStatus(taskId, status);
      if (result.error) toast.error(result.error);
      else {
        toast.success('Task updated.');
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-border/70 bg-card shadow-card">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>My Calendar</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Events and linked tasks your admin has made visible to your portal account.
            </p>
          </div>
          {canCreate ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>Create event</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create portal event</DialogTitle>
                  <DialogDescription>Events sync to the admin calendar.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreate} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Title *</Label>
                    <Input id="title" name="title" required />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="start_at">Start *</Label>
                      <Input id="start_at" name="start_at" type="datetime-local" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="end_at">End</Label>
                      <Input id="end_at" name="end_at" type="datetime-local" />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="category">Category</Label>
                      <select id="category" name="category" className={SELECT_CLASS} defaultValue="general">
                        {['general', 'worship', 'trustee_meeting', 'letting', 'finance_deadline', 'budget_review', 'reminder'].map((category) => (
                          <option key={category} value={category}>{label(category)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="location">Location</Label>
                      <Input id="location" name="location" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea id="description" name="description" />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="all_day" className="h-4 w-4 rounded border-border" />
                    All day
                  </label>
                  <Button type="submit" disabled={isPending}>{isPending ? 'Saving...' : 'Save event'}</Button>
                </form>
              </DialogContent>
            </Dialog>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="space-y-4">
            {Object.entries(groupedEvents).map(([date, dayEvents]) => (
              <div key={date} className="rounded-2xl border border-border/70 p-4">
                <p className="mb-3 text-sm font-semibold text-muted-foreground">{new Date(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                <div className="space-y-2">
                  {dayEvents.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => setSelected(event)}
                      className="w-full rounded-xl border border-border/70 p-3 text-left transition hover:border-primary/40 hover:bg-muted/30"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{event.title}</p>
                        <Badge variant="outline">{label(event.category)}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{formatDateTime(event.startAt, event.allDay)}</p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {events.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
                No visible events in this range.
              </div>
            ) : null}
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold">My tasks</p>
            {tasks.map((task) => (
              <div key={task.id} className="rounded-2xl border border-border/70 p-3">
                <p className="font-medium">{task.title}</p>
                <p className="text-xs text-muted-foreground">{task.dueAt ? formatDateTime(task.dueAt) : 'No due date'}</p>
                <select
                  className={`${SELECT_CLASS} mt-3`}
                  value={task.status}
                  disabled={isPending}
                  onChange={(event) => handleTaskStatus(task.id, event.target.value as PortalTaskStatus)}
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="done">Done</option>
                </select>
              </div>
            ))}
            {tasks.length === 0 ? <p className="text-sm text-muted-foreground">No linked tasks assigned.</p> : null}
          </div>
        </CardContent>
      </Card>

      <Sheet open={Boolean(selected)} onOpenChange={(value) => !value && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.title}</SheetTitle>
                <SheetDescription>{formatDateTime(selected.startAt, selected.allDay)} · {label(selected.status)}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4 text-sm">
                <div className="rounded-2xl border border-border/70 p-4">
                  <p><span className="text-muted-foreground">Category:</span> {label(selected.category)}</p>
                  <p><span className="text-muted-foreground">Location:</span> {selected.location ?? 'Not set'}</p>
                  <p><span className="text-muted-foreground">Visibility:</span> {label(selected.visibility ?? 'selected_users')}</p>
                  {selected.description ? <p className="mt-3">{selected.description}</p> : null}
                </div>
                {canInvite ? (
                  <div className="space-y-3 rounded-2xl border border-border/70 p-4">
                    <Label htmlFor="invite_user">Invite organisation user</Label>
                    <select id="invite_user" className={SELECT_CLASS} value={inviteUserId} onChange={(event) => setInviteUserId(event.target.value)}>
                      <option value="">Choose user</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>{user.name} ({user.role})</option>
                      ))}
                    </select>
                    <Button size="sm" disabled={!inviteUserId || isPending} onClick={handleInvite}>Invite user</Button>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
