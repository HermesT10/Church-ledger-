'use client';

import Link from 'next/link';
import { CalendarDays, CheckCircle2, Circle, Clock, WalletCards } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { updatePortalTaskStatus } from '@/lib/portal/tasks';
import type { PortalDashboardData, PortalSubmission, PortalTaskStatus } from '@/lib/portal/types';
import { usePortalRefresh } from '../use-portal-refresh';

function money(pence: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

function formatDate(value: string | null) {
  if (!value) return 'No date';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function statusVariant(status: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (['approved', 'posted', 'paid', 'banked', 'done'].includes(status)) return 'default';
  if (['rejected', 'voided', 'cancelled'].includes(status)) return 'destructive';
  if (['pending', 'in_progress', 'submitted'].includes(status)) return 'secondary';
  return 'outline';
}

export function PortalDashboardClient({
  data,
  userId,
  workspaceId,
}: {
  data: PortalDashboardData;
  userId: string;
  workspaceId: string;
}) {
  usePortalRefresh(userId, workspaceId);

  const unreadCount = data.notifications.filter((notification) => !notification.readAt).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Assigned budgets" value={data.assignedBudgets.length} href="/portal/budgets" />
        <MetricCard label="Open tasks" value={data.tasks.filter((task) => task.status !== 'done').length} href="/portal/calendar" />
        <MetricCard label="Unread notifications" value={unreadCount} href="/portal/dashboard" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="rounded-3xl border-border/70 bg-card shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <WalletCards size={18} />
              My Assigned Budgets
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.assignedBudgets.length > 0 ? data.assignedBudgets.map((budget) => {
              const usedPercent = budget.budgetPence > 0 ? Math.min(100, Math.max(0, (budget.usedPence / budget.budgetPence) * 100)) : 0;
              return (
                <Link key={budget.id} href="/portal/budgets" className="block rounded-2xl border border-border/70 p-4 transition hover:bg-muted/30">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{budget.name}</p>
                      <p className="text-xs text-muted-foreground">{budget.year} · {budget.status}</p>
                    </div>
                    <Badge variant={budget.canSubmitAgainst ? 'secondary' : 'outline'}>
                      {budget.canSubmitAgainst ? 'Can submit' : 'View only'}
                    </Badge>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${usedPercent}%` }} />
                  </div>
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                    <span>Budget {money(budget.budgetPence)}</span>
                    <span>Used {money(budget.usedPence)}</span>
                    <span>Remaining {money(budget.remainingPence)}</span>
                  </div>
                </Link>
              );
            }) : <EmptyState label="No assigned budgets yet." />}
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 bg-card shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 size={18} />
              My Tasks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.tasks.length > 0 ? data.tasks.map((task) => (
              <div key={task.id} className="rounded-2xl border border-border/70 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{task.title}</p>
                    <p className="text-xs text-muted-foreground">Due {formatDate(task.dueAt)}</p>
                    {task.calendarEvent ? (
                      <Link href={task.calendarEvent.href} className="mt-1 inline-flex text-xs text-primary hover:underline">
                        Linked event: {task.calendarEvent.title}
                      </Link>
                    ) : null}
                  </div>
                  <Badge variant={statusVariant(task.status)}>{task.status.replaceAll('_', ' ')}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(['open', 'in_progress', 'done'] as PortalTaskStatus[]).map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={task.status === status ? 'default' : 'outline'}
                      onClick={() => updatePortalTaskStatus(task.id, status)}
                    >
                      {status.replaceAll('_', ' ')}
                    </Button>
                  ))}
                </div>
              </div>
            )) : <EmptyState label="No tasks assigned." />}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ListCard title="Upcoming Events" icon={<CalendarDays size={18} />}>
          {data.upcomingEvents.length > 0 ? data.upcomingEvents.map((event) => (
            <Link key={event.id} href={event.href} className="block rounded-xl px-3 py-2 hover:bg-muted/40">
              <p className="font-medium">{event.title}</p>
              <p className="text-xs text-muted-foreground">{formatDate(event.startAt)}</p>
            </Link>
          )) : <EmptyState label="No upcoming events." />}
        </ListCard>

        <ListCard title="Pending Submissions" icon={<Clock size={18} />}>
          <SubmissionList items={data.pendingSubmissions} empty="No pending submissions." />
        </ListCard>

        <ListCard title="Approved/Paid Updates" icon={<Circle size={18} />}>
          <SubmissionList items={data.approvedPaidUpdates} empty="No recent updates." />
        </ListCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {data.restrictedFunds.length > 0 ? (
          <ListCard title="Restricted Funds Summary">
            {data.restrictedFunds.map((fund) => (
              <div key={fund.id} className="flex items-center justify-between rounded-xl px-3 py-2">
                <div>
                  <p className="font-medium">{fund.name}</p>
                  <p className="text-xs text-muted-foreground">{fund.canSubmitAgainst ? 'Submissions allowed' : 'View only'}</p>
                </div>
                <p className="font-semibold">{money(fund.balancePence)}</p>
              </div>
            ))}
          </ListCard>
        ) : null}

        <ListCard title="Admin Notifications">
          {data.notifications.length > 0 ? data.notifications.map((notification) => (
            <Link key={notification.id} href={notification.href ?? '/portal/dashboard'} className="block rounded-xl px-3 py-2 hover:bg-muted/40">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{notification.title}</p>
                {!notification.readAt ? <Badge variant="secondary">New</Badge> : null}
              </div>
              {notification.body ? <p className="text-xs text-muted-foreground">{notification.body}</p> : null}
            </Link>
          )) : <EmptyState label="No notifications yet." />}
        </ListCard>
      </div>
    </div>
  );
}

function MetricCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="rounded-3xl border border-border/70 bg-card p-5 shadow-card transition hover:bg-muted/20">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </Link>
  );
}

function ListCard({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="rounded-3xl border-border/70 bg-card shadow-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">{children}</CardContent>
    </Card>
  );
}

function SubmissionList({ items, empty }: { items: PortalSubmission[]; empty: string }) {
  if (items.length === 0) return <EmptyState label={empty} />;
  return items.map((item) => (
    <Link key={`${item.type}-${item.id}`} href={item.href} className="block rounded-xl px-3 py-2 hover:bg-muted/40">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{item.title}</p>
        <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">{item.type.replaceAll('_', ' ')} · {money(item.amountPence)}</p>
    </Link>
  ));
}

function EmptyState({ label }: { label: string }) {
  return <p className="rounded-2xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">{label}</p>;
}
