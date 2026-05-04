'use client';

import { useState, useCallback, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import {
  Plus,
  Upload,
  CheckCircle2,
  TrendingUp,
  Wallet,
  ReceiptText,
  Landmark,
  PiggyBank,
  Scale,
  CalendarDays,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import type { InsightSnapshot } from '@/lib/insights/types';
import type { RoleDashboardPreset } from '@/lib/product/role-dashboard-presets';
import type {
  DashboardOverview,
  DashboardOverviewSeries,
  CategoryBreakdown,
  TodoItem,
  DashboardCashPositionRow,
  DashboardRestrictedFundTrackerRow,
} from '@/lib/reports/types';
import type { WidgetConfig, WidgetId } from '@/lib/dashboard/widgetRegistry';
import { saveDashboardLayout } from '@/lib/dashboard/actions';
import { setDashboardTaskCompletion } from './task-actions';
import { IndicatorList } from '@/components/insights/indicator-list';
import { MonthEndCard } from '@/components/insights/month-end-card';
import { cn } from '@/lib/utils';
import { CustomizePanel } from './customize-panel';
import {
  FundBalancesWidget,
  BudgetVsActualWidget,
  GiftAidSummaryWidget,
  RecentTransactionsWidget,
  SupplierSpendWidget,
  PayrollSummaryWidget,
} from './widgets';

/* ------------------------------------------------------------------ */
/*  Formatters                                                         */
/* ------------------------------------------------------------------ */

function fmtPoundsExact(pence: number): string {
  return '£' + (pence / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtChartValue(pounds: number): string {
  if (pounds >= 1000) return `£${(pounds / 1000).toFixed(1)}k`;
  return `£${pounds.toFixed(0)}`;
}

function deltaPct(current: number, prior: number): string | null {
  if (prior === 0) return null;
  const pct = ((current - prior) / Math.abs(prior)) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

/* ------------------------------------------------------------------ */
/*  Period Selector                                                    */
/* ------------------------------------------------------------------ */

const PERIODS = [
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'ytd', label: 'Year to Date' },
] as const;

function PeriodSelector({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1 rounded-2xl border border-border/70 bg-card p-1 shadow-card">
      {PERIODS.map((p) => (
        <Button
          key={p.value}
          type="button"
          variant={value === p.value ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onChange(p.value)}
          disabled={disabled}
          className={cn(
            'rounded-xl',
            value !== p.value && 'text-muted-foreground'
          )}
        >
          {p.label}
        </Button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Breakdown Row                                                      */
/* ------------------------------------------------------------------ */

function BreakdownRow({
  item,
  color,
}: {
  item: CategoryBreakdown;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
      <span className="flex-1 text-sm truncate">{item.name}</span>
      <span className="text-sm font-medium tabular-nums">
        {fmtPoundsExact(item.amountPence)}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
        {item.pct}%
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Custom Tooltip                                                     */
/* ------------------------------------------------------------------ */

function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number; name: string; color: string }[];
  label?: string;
}) {
  if (!active || !payload) return null;
  return (
    <div className="rounded-xl border bg-popover px-4 py-3 shadow-lg">
      <p className="text-xs font-medium text-muted-foreground mb-1.5">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">{fmtChartValue(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Month Timeline                                                     */
/* ------------------------------------------------------------------ */

function MonthTimeline({ series }: { series: DashboardOverviewSeries[] }) {
  if (series.length === 0) return null;
  const total = series.reduce((s, d) => s + d.income, 0);
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {series.map((s, i) => {
        const isLast = i === series.length - 1;
        return (
          <div
            key={s.dateLabel}
            className={`flex flex-col items-center gap-1.5 px-4 py-2 rounded-lg text-xs transition-colors ${
              isLast ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground'
            }`}
          >
            <span>{s.dateLabel}</span>
            {total > 0 && (
              <Badge
                variant={isLast ? 'default' : 'outline'}
                className="text-[10px] px-1.5 py-0"
              >
                {fmtChartValue(s.income)}
              </Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Financial Overview Widgets                                         */
/* ------------------------------------------------------------------ */

const FUND_STATUS_LABELS: Record<DashboardRestrictedFundTrackerRow['status'], string> = {
  healthy: 'Healthy',
  low_remaining: 'Low remaining',
  fully_used: 'Fully used',
  overspent: 'Overspent',
  needs_review: 'Needs review',
};

const FUND_STATUS_VARIANT: Record<DashboardRestrictedFundTrackerRow['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  healthy: 'default',
  low_remaining: 'secondary',
  fully_used: 'outline',
  overspent: 'destructive',
  needs_review: 'secondary',
};

type ActionSeverity = 'critical' | 'warning' | 'info' | 'success';

const TODO_SEVERITY: Record<TodoItem['type'], ActionSeverity> = {
  warning: 'warning',
  action: 'info',
  info: 'info',
};

const SEVERITY_PRIORITY: Record<ActionSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
  success: 3,
};

const SEVERITY_TAG: Record<ActionSeverity, string> = {
  critical: 'Urgent',
  warning: 'Review',
  info: 'Action required',
  success: 'Healthy',
};

function todoPriority(item: TodoItem): number {
  const text = `${item.label} ${item.href}`.toLowerCase();
  if (/overdue|overspent|missing receipt/.test(text)) return 0;
  if (/bank transaction|payment run|payroll|invoice submission|expense request/.test(text)) return 1;
  if (/budget|gift aid|register row mapping/.test(text)) return 2;
  return 3;
}

function taskDueTime(value?: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function sortDashboardTasks(items: TodoItem[]): TodoItem[] {
  return [...items].sort((a, b) => {
    const statusRank = (item: TodoItem) => item.status === 'completed' ? 2 : item.status === 'inactive' ? 1 : 0;
    const statusDelta = statusRank(a) - statusRank(b);
    if (statusDelta !== 0) return statusDelta;
    return todoPriority(a) - todoPriority(b)
      || taskDueTime(a.dueAt) - taskDueTime(b.dueAt)
      || (a.createdAt ?? '').localeCompare(b.createdAt ?? '');
  });
}

function formatTaskDue(value?: string | null): string {
  if (!value) return 'No due date';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatCalendarTime(value: string, allDay: boolean): string {
  if (allDay) return 'All day';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

const DAY_VIEW_HOURS = Array.from({ length: 13 }, (_, index) => index + 7);

function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function dateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function dashboardCalendarHref(date: Date): string {
  return `/calendar?view=day&date=${dateKey(date)}`;
}

function newEventHref(date: Date, hour: number): string {
  return `/calendar?view=day&new=event&date=${dateKey(date)}&start=${dateKey(date)}T${String(hour).padStart(2, '0')}:00`;
}

function DashboardTaskListCard({ items }: { items: TodoItem[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const sortedTasks = sortDashboardTasks(items).slice(0, 9);
  const remainingCount = Math.max(0, items.length - sortedTasks.length);
  const visibleCount = sortedTasks.length;

  function handleCompletion(item: TodoItem, checked: boolean) {
    if (!item.id) return;
    startTransition(async () => {
      await setDashboardTaskCompletion(item.id!, checked);
      router.refresh();
    });
  }

  return (
    <Card className="flex h-full min-h-[620px] self-stretch rounded-3xl border border-border/70 bg-card shadow-card">
      <CardHeader className="border-b border-border/60 px-5 pb-4 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold">To Do & Alerts</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Tick off finance tasks as they are completed</p>
          </div>
          <Badge variant={items.length > 0 ? 'secondary' : 'outline'}>
            {visibleCount === 9 ? '9 tasks' : `${visibleCount} tasks`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 px-3 py-3">
        {sortedTasks.length === 0 ? (
          <div className="flex h-full min-h-64 items-center gap-2 rounded-2xl border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">
            <CheckCircle2 size={16} className="text-success" />
            All caught up!
          </div>
        ) : (
          <div className="space-y-1">
            {sortedTasks.map((item) => {
              const completed = item.status === 'completed';
              const severity = TODO_SEVERITY[item.type];
              return (
                <div
                  key={item.id ?? item.key}
                  className={cn(
                    'group flex min-h-[48px] items-center gap-3 rounded-2xl px-3 py-2 transition hover:bg-accent/45',
                    item.status === 'inactive' && 'bg-muted/15 text-muted-foreground',
                    completed && 'bg-muted/25 text-muted-foreground',
                  )}
                >
                  <Checkbox
                    checked={completed}
                    disabled={!item.id || isPending}
                    aria-label={`Mark ${item.label} ${completed ? 'incomplete' : 'complete'}`}
                    onCheckedChange={(checked) => handleCompletion(item, checked)}
                    className="shrink-0"
                  />
                  <Link href={item.href} className="min-w-0 flex-1">
                    <span className={cn('block truncate text-sm font-semibold', completed && 'line-through decoration-muted-foreground/60')}>
                      {item.label}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 truncate text-xs text-muted-foreground">
                      <Clock size={12} className="shrink-0" />
                      {formatTaskDue(item.dueAt)}
                    </span>
                  </Link>
                  <Badge
                    variant={severity === 'critical' ? 'destructive' : 'secondary'}
                    className="hidden shrink-0 sm:inline-flex"
                  >
                    {completed ? 'Done' : item.status === 'inactive' ? 'Saved' : SEVERITY_TAG[severity]}
                  </Badge>
                </div>
              );
            })}
            {remainingCount > 0 ? (
              <Link
                href="/calendar?view=agenda"
                className="mx-3 block rounded-xl bg-muted/35 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
              >
                {remainingCount} more task{remainingCount === 1 ? '' : 's'} retained in the calendar
              </Link>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DashboardDayCalendarCard({ events }: { events: DashboardOverview['dayCalendarEvents'] }) {
  const visibleEvents = events.slice(0, 6);
  const today = new Date();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(visibleEvents[0]?.id ?? null);
  const selectedEvent = visibleEvents.find((event) => event.id === selectedEventId) ?? visibleEvents[0] ?? null;
  const todayLabel = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
  }).format(today);
  const monthLabel = new Intl.DateTimeFormat('en-GB', {
    month: 'short',
  }).format(today);
  const dayNumber = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
  }).format(today);
  const currentHour = today.getHours();
  return (
    <Card className="flex h-full min-h-[620px] self-stretch rounded-3xl border border-border/70 bg-card shadow-card">
      <CardHeader className="border-b border-border/60 px-5 pb-4 pt-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl border border-border/70 bg-background">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{monthLabel}</span>
              <span className="text-lg font-semibold leading-none">{dayNumber}</span>
            </div>
            <div>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <CalendarDays size={16} />
                Day Calendar View
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Scrollable day schedule with direct time selection</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button asChild variant="outline" size="icon" className="h-8 w-8">
              <Link href={dashboardCalendarHref(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1))} aria-label="Open previous day">
                <ChevronLeft size={14} />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-8">
              <Link href={dashboardCalendarHref(today)}>Today</Link>
            </Button>
            <Button asChild variant="outline" size="icon" className="h-8 w-8">
              <Link href={dashboardCalendarHref(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1))} aria-label="Open next day">
                <ChevronRight size={14} />
              </Link>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 px-3 py-3">
        <div className="grid h-full min-h-[500px] overflow-hidden rounded-2xl border border-border/70 lg:grid-cols-[1fr_12rem]">
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/20 px-4 py-3">
              <div>
                <p className="text-sm font-semibold">{todayLabel}</p>
                <p className="text-xs text-muted-foreground">Select an event or click a time to create one</p>
              </div>
              <Button asChild size="sm" className="h-8">
                <Link href={newEventHref(today, Math.max(9, Math.min(17, currentHour + 1)))}>Add event</Link>
              </Button>
            </div>
            <div className="max-h-[438px] flex-1 overflow-y-auto bg-background">
              {DAY_VIEW_HOURS.map((hour) => {
                const slotEvents = visibleEvents.filter((event) => {
                  if (event.allDay && hour === DAY_VIEW_HOURS[0]) return true;
                  return new Date(event.startAt).getHours() === hour;
                });
                const showEmptyMessage = visibleEvents.length === 0 && hour === 9;
                const isCurrentHour = currentHour === hour;
                return (
                  <div key={hour} className="grid min-h-[72px] grid-cols-[4.5rem_1fr] border-b border-border/60 last:border-b-0">
                    <div className="relative border-r border-border/60 px-3 py-3 text-[11px] font-medium text-muted-foreground">
                      {formatHourLabel(hour)}
                      {isCurrentHour ? (
                        <span className="absolute right-[-5px] top-4 h-2.5 w-2.5 rounded-full bg-primary" />
                      ) : null}
                    </div>
                    <div className="relative min-w-0 px-2 py-2">
                      {isCurrentHour ? <span className="absolute left-0 right-0 top-5 border-t border-primary/50" /> : null}
                      {slotEvents.length > 0 ? (
                        <div className="relative space-y-1.5">
                          {slotEvents.map((event) => {
                            const selected = selectedEvent?.id === event.id;
                            return (
                              <button
                                key={event.id}
                                type="button"
                                onClick={() => setSelectedEventId(event.id)}
                                className={cn(
                                  'flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs shadow-xs transition hover:border-primary/30',
                                  selected
                                    ? 'border-primary/40 bg-primary/10 text-primary'
                                    : 'border-info/20 bg-info/10 text-foreground',
                                )}
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-semibold">{event.title}</span>
                                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                    {formatCalendarTime(event.startAt, event.allDay)}
                                    {event.location ? ` · ${event.location}` : ''}
                                  </span>
                                </span>
                                <Badge variant={event.status === 'completed' ? 'outline' : 'secondary'} className="shrink-0 text-[10px]">
                                  {event.status}
                                </Badge>
                              </button>
                            );
                          })}
                        </div>
                      ) : showEmptyMessage ? (
                        <Link
                          href={newEventHref(today, hour)}
                          className="relative block rounded-xl border border-dashed border-primary/25 bg-primary/5 px-3 py-2 transition hover:border-primary/50 hover:bg-primary/10"
                        >
                          <p className="text-xs font-medium">No events scheduled today</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">Select this time to create one.</p>
                        </Link>
                      ) : (
                        <Link
                          href={newEventHref(today, hour)}
                          className="group relative block h-full rounded-xl border border-dashed border-transparent px-3 py-2 text-[11px] text-muted-foreground transition hover:border-border/80 hover:bg-muted/30"
                        >
                          <span className="opacity-0 transition group-hover:opacity-100">Create event</span>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <aside className="hidden border-l border-border/60 bg-muted/15 p-4 lg:block">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected event</p>
              {selectedEvent ? (
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-sm font-semibold">{selectedEvent.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatCalendarTime(selectedEvent.startAt, selectedEvent.allDay)}
                      {selectedEvent.location ? ` · ${selectedEvent.location}` : ''}
                    </p>
                  </div>
                  {selectedEvent.description ? (
                    <p className="text-xs text-muted-foreground">{selectedEvent.description}</p>
                  ) : null}
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link href={selectedEvent.source === 'stored' ? `/calendar?event=${selectedEvent.id}` : selectedEvent.href ?? '/calendar?view=day'}>
                      View event
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <p className="text-sm font-semibold">No event selected</p>
                  <p className="text-xs text-muted-foreground">Select a time in the schedule to create an event, or select an event to view details.</p>
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link href={newEventHref(today, 9)}>Create 09:00 event</Link>
                  </Button>
                </div>
              )}
            </div>
          </aside>
          {events.length > visibleEvents.length ? (
            <Link
              href="/calendar?view=day"
              className="col-span-full border-t border-border/60 bg-muted/25 px-4 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted/45 hover:text-foreground"
            >
              View {events.length - visibleEvents.length} more calendar item{events.length - visibleEvents.length === 1 ? '' : 's'}
            </Link>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function financialChartData(data: DashboardOverview) {
  return data.financialOverview.monthlyIncomeExpense.map((month) => ({
    month: month.month,
    income: month.incomePence / 100,
    expense: month.expensePence / 100,
    net: month.netPence / 100,
  }));
}

function monthlyInsights(data: DashboardOverview) {
  const monthly = data.financialOverview.monthlyIncomeExpense;
  if (monthly.length === 0) {
    return [
      { label: 'Strongest income month', value: 'No posted activity' },
      { label: 'Highest expense month', value: 'No posted activity' },
      { label: 'Current month net', value: 'No posted activity' },
      { label: 'Biggest net movement', value: 'No posted activity' },
    ];
  }
  const currentMonthNumber = new Date().getFullYear() === data.financialOverview.selectedYear
    ? new Date().getMonth() + 1
    : 12;
  const currentMonth = monthly.find((row) => row.monthNumber === currentMonthNumber) ?? monthly[monthly.length - 1];
  const strongestIncome = monthly.reduce((best, row) => row.incomePence > best.incomePence ? row : best, monthly[0]);
  const highestExpense = monthly.reduce((best, row) => row.expensePence > best.expensePence ? row : best, monthly[0]);
  const biggestChange = monthly.reduce(
    (best, row, index) => {
      if (index === 0) return best;
      const previous = monthly[index - 1];
      const change = Math.abs(row.netPence - previous.netPence);
      return change > best.changePence
        ? { month: row.month, changePence: change }
        : best;
    },
    { month: currentMonth?.month ?? '—', changePence: 0 },
  );

  return [
    { label: 'Strongest income month', value: `${strongestIncome.month} · ${fmtPoundsExact(strongestIncome.incomePence)}` },
    { label: 'Highest expense month', value: `${highestExpense.month} · ${fmtPoundsExact(highestExpense.expensePence)}` },
    { label: 'Current month net', value: currentMonth ? `${currentMonth.month} · ${fmtPoundsExact(currentMonth.netPence)}` : 'No month selected' },
    { label: 'Biggest net movement', value: `${biggestChange.month} · ${fmtPoundsExact(biggestChange.changePence)}` },
  ];
}

function FinancialPerformanceCard({ data }: { data: DashboardOverview }) {
  const chartData = financialChartData(data);
  const hasData = chartData.some((point) => point.income > 0 || point.expense > 0);
  const insights = monthlyInsights(data);

  return (
    <Card className="overflow-hidden rounded-3xl border-border/70 bg-card shadow-card">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-semibold">Monthly Income vs Expenses</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              A clean trustee view of cashflow for {data.financialOverview.selectedYear}.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/reports/income-expense-summary">View full report</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-5">
        {hasData ? (
          <>
            <div className="h-[320px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="financialIncomeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="financialExpenseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.45} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={fmtChartValue} width={58} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="income" name="Income" stroke="hsl(var(--chart-1))" strokeWidth={2.8} fill="url(#financialIncomeGrad)" dot={false} activeDot={{ r: 5, strokeWidth: 2, fill: 'hsl(var(--background))' }} />
                  <Area type="monotone" dataKey="expense" name="Expenses" stroke="hsl(var(--chart-2))" strokeWidth={2.8} fill="url(#financialExpenseGrad)" dot={false} activeDot={{ r: 5, strokeWidth: 2, fill: 'hsl(var(--background))' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid gap-3 border-t border-border/70 pt-4 sm:grid-cols-2 xl:grid-cols-4">
              {insights.map((insight) => (
                <div key={insight.label} className="rounded-2xl bg-muted/35 px-4 py-3">
                  <p className="text-xs text-muted-foreground">{insight.label}</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums">{insight.value}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 text-center">
            <TrendingUp className="mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">No posted income or expenses yet.</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Post journals or import bank activity to populate this chart.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function YearSelector({
  selectedYear,
  comparePreviousYear,
  onYearChange,
  onCompareChange,
  disabled,
}: {
  selectedYear: number;
  comparePreviousYear: boolean;
  onYearChange: (year: number) => void;
  onCompareChange: (compare: boolean) => void;
  disabled?: boolean;
}) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, index) => currentYear - index);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card p-1.5 shadow-card">
      <select
        value={selectedYear}
        onChange={(event) => onYearChange(Number(event.target.value))}
        disabled={disabled}
        className="h-9 rounded-xl border border-border/70 bg-background px-3 text-sm font-medium"
      >
        {years.map((year) => (
          <option key={year} value={year}>{year}</option>
        ))}
      </select>
      <label className="flex h-9 items-center gap-2 rounded-xl px-3 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={comparePreviousYear}
          onChange={(event) => onCompareChange(event.target.checked)}
          disabled={disabled}
          className="accent-primary"
        />
        Compare with previous year
      </label>
    </div>
  );
}

function EmptySetupPrompts({ data }: { data: DashboardOverview }) {
  const prompts = [
    !data.financialOverview.emptyStates.hasBankAccounts
      ? { label: 'Create bank account', href: '/banking/new' }
      : null,
    !data.financialOverview.emptyStates.hasRestrictedFunds
      ? { label: 'Create restricted fund', href: '/funds/new' }
      : null,
    !data.financialOverview.emptyStates.hasPostedActivity
      ? { label: 'Import bank statement', href: '/banking' }
      : null,
    !data.financialOverview.emptyStates.hasPostedActivity
      ? { label: 'Configure accounts', href: '/accounts' }
      : null,
  ].filter(Boolean) as Array<{ label: string; href: string }>;

  if (prompts.length === 0) return null;

  return (
    <Card className="rounded-2xl border-border/70 bg-card">
      <CardContent className="flex flex-col gap-4 py-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold">Complete your dashboard setup</p>
          <p className="text-sm text-muted-foreground">
            Add the missing finance data so the overview can show cash, funds, and activity accurately.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {prompts.map((prompt) => (
            <Button key={prompt.href} asChild variant="outline" size="sm">
              <Link href={prompt.href}>{prompt.label}</Link>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CashPositionOverview({ rows }: { rows: DashboardCashPositionRow[] }) {
  const grouped = rows.reduce<Record<string, DashboardCashPositionRow[]>>((acc, row) => {
    acc[row.categoryLabel] = [...(acc[row.categoryLabel] ?? []), row];
    return acc;
  }, {});
  const orderedGroups = Object.entries(grouped).sort(([a], [b]) => {
    const order = ['Current Accounts', 'Savings / Reserves', 'Restricted Savings', 'Cash'];
    return (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b));
  });
  const totalCashPence = rows.reduce((sum, row) => sum + row.balancePence, 0);
  const availableCashPence = rows
    .filter((row) => row.category === 'current' || row.category === 'savings')
    .reduce((sum, row) => sum + row.balancePence, 0);
  const restrictedCashPence = rows
    .filter((row) => row.category === 'restricted_savings')
    .reduce((sum, row) => sum + row.balancePence, 0);
  const cashInHandPence = rows
    .filter((row) => row.category === 'cash')
    .reduce((sum, row) => sum + row.balancePence, 0);
  const summary = [
    { label: 'Available Cash', value: availableCashPence },
    { label: 'Restricted Cash', value: restrictedCashPence },
    { label: 'Cash in Hand', value: cashInHandPence },
  ];
  const hasImportedStatement = rows.some((row) => row.source === 'bank_balance');
  const hasLedgerBalance = rows.some((row) => row.source === 'ledger_balance');
  const sourceLabel: Record<DashboardCashPositionRow['source'], string> = {
    bank_balance: 'Bank statement balance',
    ledger_balance: 'Book balance',
    opening_balance: 'Opening balance',
  };

  return (
    <Card className="rounded-2xl border-border/70 bg-card shadow-card">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg font-semibold">Cash Position</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Active bank, savings, restricted, and cash balances</p>
          </div>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-info-soft text-info">
            <Landmark size={18} aria-hidden="true" />
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/80 p-5 text-sm text-muted-foreground">
            No active cash or bank accounts found. <Link className="font-medium text-primary" href="/banking/new">Add bank account</Link>.
          </div>
        ) : (
          <>
            <div className="space-y-4 rounded-3xl bg-muted/30 p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total Cash</p>
                <p className={cn(
                  'mt-2 text-3xl font-bold tracking-tight tabular-nums',
                  totalCashPence < 0 ? 'text-danger' : totalCashPence > 1000000 ? 'text-success' : 'text-foreground',
                )}>
                  {fmtPoundsExact(totalCashPence)}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {summary.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-border/70 bg-card px-3 py-3">
                    <p className="text-[11px] font-medium text-muted-foreground">{item.label}</p>
                    <p className={cn(
                      'mt-1 text-sm font-semibold tabular-nums',
                      item.value < 0 ? 'text-danger' : 'text-foreground',
                    )}>
                      {fmtPoundsExact(item.value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {!hasImportedStatement ? (
              <div className="rounded-2xl border border-dashed border-border/80 p-4 text-sm text-muted-foreground">
                No bank statement imported yet. <Link className="font-medium text-primary" href="/banking/import">Upload statement</Link> to compare bank and book balances.
              </div>
            ) : null}
            {!hasLedgerBalance ? (
              <div className="rounded-2xl bg-muted/35 p-4 text-sm text-muted-foreground">
                No reconciliation completed yet. <Link className="font-medium text-primary" href="/reconciliation">Open reconciliation</Link> when statements are imported.
              </div>
            ) : null}
            <div className="space-y-4 border-t border-border/60 pt-5">
              {orderedGroups.map(([label, items]) => (
                <div key={label}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className={cn(
                    'text-sm font-semibold tabular-nums',
                    items.reduce((sum, row) => sum + row.balancePence, 0) < 0 ? 'text-danger' : 'text-foreground',
                  )}>
                    {fmtPoundsExact(items.reduce((sum, row) => sum + row.balancePence, 0))}
                  </p>
                </div>
                <div className="divide-y divide-border/60 rounded-2xl border border-border/70">
                  {items.map((row) => (
                    <Link key={row.id} href={row.href} className="flex items-center gap-3 px-4 py-3 transition hover:bg-accent/45 hover:shadow-soft">
                      <Landmark size={15} className="text-info shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{row.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {sourceLabel[row.source]}{row.lastUpdated ? ` · updated ${row.lastUpdated.slice(0, 10)}` : ''}
                        </p>
                      </div>
                      <p className={cn(
                        'text-sm font-semibold tabular-nums',
                        row.balancePence < 0 ? 'text-danger' : row.balancePence > 1000000 ? 'text-success' : 'text-foreground',
                      )}>
                        {fmtPoundsExact(row.balancePence)}
                      </p>
                    </Link>
                  ))}
                </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RestrictedFundTracker({ rows }: { rows: DashboardRestrictedFundTrackerRow[] }) {
  const visibleRows = rows.slice(0, 10);
  return (
    <Card className="gap-4 rounded-2xl border-border/70 bg-card shadow-card">
      <CardHeader className="border-b border-border/60 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-semibold">Restricted Fund Tracker</CardTitle>
            <p className="text-xs text-muted-foreground">Fund-by-fund restricted fund health, not just the restricted total.</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/funds?type=restricted">View all restricted funds</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="max-h-[520px] overflow-auto">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/80 p-5 text-sm text-muted-foreground">
            No active restricted funds found. <Link className="font-medium text-primary" href="/funds/new">Create a restricted fund</Link>.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fund</TableHead>
                <TableHead className="text-right">Donated</TableHead>
                <TableHead className="text-right">Used</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => (
                <TableRow key={row.fundId}>
                  <TableCell><Link className="font-medium text-primary" href={row.href}>{row.fundName}</Link></TableCell>
                  <TableCell className="text-right tabular-nums">{fmtPoundsExact(row.donatedPence)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtPoundsExact(row.usedPence)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{fmtPoundsExact(row.remainingPence)}</TableCell>
                  <TableCell>
                    <Badge variant={FUND_STATUS_VARIANT[row.status]}>{FUND_STATUS_LABELS[row.status]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function MonthlyIncomeExpense({ data }: { data: DashboardOverview }) {
  const monthly = data.financialOverview.monthlyIncomeExpense;
  return (
    <Card className="gap-4 rounded-2xl border-border/70 bg-card shadow-card">
      <CardHeader className="border-b border-border/60 pb-3">
        <CardTitle className="text-lg font-semibold">Monthly Income vs Expenses</CardTitle>
        <p className="text-xs text-muted-foreground">Selected year: {data.financialOverview.selectedYear}</p>
      </CardHeader>
      <CardContent className="max-h-[520px] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Income</TableHead>
              <TableHead className="text-right">Expenses</TableHead>
              <TableHead className="text-right">Net</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {monthly.map((row) => (
              <TableRow key={row.monthNumber}>
                <TableCell className="font-medium">{row.month}</TableCell>
                <TableCell className="text-right tabular-nums"><Link className="text-primary" href={row.incomeHref}>{fmtPoundsExact(row.incomePence)}</Link></TableCell>
                <TableCell className="text-right tabular-nums"><Link className="text-primary" href={row.expenseHref}>{fmtPoundsExact(row.expensePence)}</Link></TableCell>
                <TableCell className={cn('text-right font-semibold tabular-nums', row.netPence < 0 ? 'text-danger' : 'text-success')}>
                  {fmtPoundsExact(row.netPence)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function PreviousYearComparison({ data }: { data: DashboardOverview }) {
  const comparison = data.financialOverview.previousYearComparison;
  if (!comparison) return null;

  return (
    <Card className="rounded-2xl border-border/70 bg-card shadow-card">
      <CardHeader className="border-b border-border/60 pb-4">
        <CardTitle className="text-lg font-semibold">Previous Year Comparison</CardTitle>
        <p className="text-xs text-muted-foreground">{comparison.currentYear} compared with {comparison.previousYear}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {[
          ['Current income', comparison.currentIncomePence],
          ['Current expenses', comparison.currentExpensePence],
          ['Previous income', comparison.previousIncomePence],
          ['Previous expenses', comparison.previousExpensePence],
          ['Income variance', comparison.incomeVariancePence],
          ['Expense variance', comparison.expenseVariancePence],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between rounded-xl px-3 py-2 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-semibold tabular-nums">{fmtPoundsExact(Number(value))}</span>
          </div>
        ))}
        <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Income variance: {comparison.incomeVariancePct == null ? 'n/a' : `${comparison.incomeVariancePct}%`} · Expense variance: {comparison.expenseVariancePct == null ? 'n/a' : `${comparison.expenseVariancePct}%`}
        </p>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  data: DashboardOverview;
  period: string;
  selectedYear: number;
  comparePreviousYear: boolean;
  canEdit: boolean;
  initialLayout: WidgetConfig[];
  guidance: InsightSnapshot | null;
  rolePreset: RoleDashboardPreset;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DashboardClient({
  data: initialData,
  period: initialPeriod,
  selectedYear: initialSelectedYear,
  comparePreviousYear: initialComparePreviousYear,
  canEdit,
  initialLayout,
  guidance,
  rolePreset,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [data] = useState(initialData);
  const [period, setPeriod] = useState(initialPeriod);
  const [selectedYear, setSelectedYear] = useState(initialSelectedYear);
  const [comparePreviousYear, setComparePreviousYear] = useState(initialComparePreviousYear);
  const [layout, setLayout] = useState(initialLayout);

  const visibleSet = new Set(
    layout.filter((w) => w.visible).map((w) => w.id)
  );
  const isVisible = (id: WidgetId) => visibleSet.has(id);

  const incDelta = data.priorPeriodTotals
    ? deltaPct(data.totals.incomePence, data.priorPeriodTotals.incomePence)
    : null;

  const expDelta = data.priorPeriodTotals
    ? deltaPct(data.totals.expensePence, data.priorPeriodTotals.expensePence)
    : null;

  function handlePeriodChange(newPeriod: string) {
    setPeriod(newPeriod);
    startTransition(() => {
      router.push(`/dashboard?period=${newPeriod}&year=${selectedYear}${comparePreviousYear ? '&comparePreviousYear=1' : ''}`);
    });
  }

  function handleYearChange(newYear: number) {
    setSelectedYear(newYear);
    startTransition(() => {
      router.push(`/dashboard?period=${period}&year=${newYear}${comparePreviousYear ? '&comparePreviousYear=1' : ''}`);
    });
  }

  function handleCompareChange(compare: boolean) {
    setComparePreviousYear(compare);
    startTransition(() => {
      router.push(`/dashboard?period=${period}&year=${selectedYear}${compare ? '&comparePreviousYear=1' : ''}`);
    });
  }

  const handleLayoutChange = useCallback(
    (newLayout: WidgetConfig[]) => {
      setLayout(newLayout);
      saveDashboardLayout(newLayout).then(() => {
        router.refresh();
      });
    },
    [router]
  );

  const INCOME_COLORS = ['bg-emerald-400', 'bg-emerald-300', 'bg-emerald-200', 'bg-teal-300', 'bg-teal-200'];
  const EXPENSE_COLORS = ['bg-rose-400', 'bg-rose-300', 'bg-rose-200', 'bg-orange-300', 'bg-orange-200'];

  /* ---------------------------------------------------------------- */
  /*  Render a widget by ID                                            */
  /* ---------------------------------------------------------------- */

  function renderWidget(id: WidgetId): React.ReactNode {
    if (!isVisible(id)) return null;

    switch (id) {
      case 'overview-chart':
        return <FinancialPerformanceCard key={id} data={data} />;

      case 'income-kpi':
        return null;

      case 'expense-kpi':
        return null;

      case 'todo-list': {
        return <DashboardTaskListCard key={id} items={data.todoItems} />;
      }

      case 'breakdown':
        if (data.incomeBreakdown.length === 0 && data.expenseBreakdown.length === 0) return null;
        return (
          <Card key={id} className="lg:col-span-3 border-border/70 bg-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-semibold">Breakdown</CardTitle>
                <p className="text-xs text-muted-foreground">{data.periodLabel}</p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {data.incomeBreakdown.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Income</p>
                    <div className="divide-y divide-border/70">
                      {data.incomeBreakdown.map((item, i) => (
                        <BreakdownRow key={item.name} item={item} color={INCOME_COLORS[i] ?? 'bg-emerald-200'} />
                      ))}
                    </div>
                  </div>
                )}
                {data.expenseBreakdown.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Expenses</p>
                    <div className="divide-y divide-border/70">
                      {data.expenseBreakdown.map((item, i) => (
                        <BreakdownRow key={item.name} item={item} color={EXPENSE_COLORS[i] ?? 'bg-rose-200'} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );

      case 'month-timeline':
        if (data.series.length <= 1) return null;
        return (
          <Card key={id} className="lg:col-span-3 border-border/70 bg-card">
            <CardContent className="py-3 px-4">
              <MonthTimeline series={data.series} />
            </CardContent>
          </Card>
        );

      /* ---- Optional widgets ---- */

      case 'cash-position':
        return null;

      case 'fund-balances':
        if (!data.fundBalances || data.fundBalances.length === 0) return null;
        return <FundBalancesWidget key={id} data={data.fundBalances} />;

      case 'budget-vs-actual':
        if (!data.budgetVsActual) return null;
        return <BudgetVsActualWidget key={id} data={data.budgetVsActual} />;

      case 'gift-aid-summary':
        if (!data.giftAidSummary) return null;
        return <GiftAidSummaryWidget key={id} data={data.giftAidSummary} />;

      case 'recent-transactions':
        if (!data.recentTransactions || data.recentTransactions.length === 0) return null;
        return <RecentTransactionsWidget key={id} data={data.recentTransactions} />;

      case 'supplier-spend':
        if (!data.supplierSpend || data.supplierSpend.length === 0) return null;
        return <SupplierSpendWidget key={id} data={data.supplierSpend} />;

      case 'payroll-summary':
        if (data.payrollSummary === undefined) return null;
        return <PayrollSummaryWidget key={id} data={data.payrollSummary} />;

      default:
        return null;
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Determine layout groups: top-row (chart + right col),            */
  /*  then remaining widgets in a responsive grid                      */
  /* ---------------------------------------------------------------- */

  // Manually placed widgets support the redesigned dashboard hierarchy.
  const MANUAL_WIDGET_IDS: WidgetId[] = [
    'overview-chart',
    'todo-list',
    'cash-position',
    'fund-balances',
    'gift-aid-summary',
  ];
  const FULL_WIDTH_IDS: WidgetId[] = ['breakdown', 'month-timeline'];

  // Get ordered list of all visible widgets in user's preferred order
  const orderedWidgets = layout.filter((w) => w.visible).map((w) => w.id);

  // Partition into groups
  const fullWidthWidgets = orderedWidgets.filter((id) => FULL_WIDTH_IDS.includes(id));
  const optionalWidgets = orderedWidgets.filter(
    (id) => !MANUAL_WIDGET_IDS.includes(id) && !FULL_WIDTH_IDS.includes(id)
  );
  const priorityFinanceWidgets = [
    isVisible('fund-balances') && data.fundBalances && data.fundBalances.length > 0
      ? <FundBalancesWidget key="fund-balances" data={data.fundBalances} />
      : null,
    isVisible('gift-aid-summary') && data.giftAidSummary
      ? <GiftAidSummaryWidget key="gift-aid-summary" data={data.giftAidSummary} />
      : null,
  ].filter(Boolean);
  const financialCards = [
    {
      key: 'restricted',
      title: 'Restricted Funds Remaining',
      value: fmtPoundsExact(data.financialOverview.kpis.restrictedFundsRemainingPence),
      subtitle: 'Posted restricted donations less restricted spend',
      href: '/funds?type=restricted',
      tint: 'violet',
      icon: <PiggyBank size={18} aria-hidden="true" />,
    },
    {
      key: 'loans',
      title: 'Loans Outstanding',
      value: fmtPoundsExact(data.financialOverview.kpis.loansOutstandingPence),
      subtitle: 'Loan-like balances from liability accounts',
      href: '/accounts?type=liability',
      tint: data.financialOverview.kpis.loansOutstandingPence > 0 ? 'amber' : 'slate',
      icon: <Scale size={18} aria-hidden="true" />,
    },
    isVisible('income-kpi')
      ? {
          key: 'ytd-income',
          title: 'YTD Income',
          value: fmtPoundsExact(data.financialOverview.kpis.ytdIncomePence),
          subtitle: incDelta ? `${incDelta} against the selected period` : `For ${data.financialOverview.selectedYear}`,
          href: '/income/register',
          tint: 'emerald',
          icon: <TrendingUp size={18} aria-hidden="true" />,
        }
      : null,
    isVisible('expense-kpi')
      ? {
          key: 'ytd-expenses',
          title: 'YTD Expenses',
          value: fmtPoundsExact(data.financialOverview.kpis.ytdExpensePence),
          subtitle: expDelta ? `${expDelta} against the selected period` : `For ${data.financialOverview.selectedYear}`,
          href: '/expenses/register',
          tint: 'rose',
          icon: <ReceiptText size={18} aria-hidden="true" />,
        }
      : null,
    {
      key: 'net',
      title: 'Net Position',
      value: fmtPoundsExact(data.financialOverview.kpis.netPositionPence),
      subtitle:
        data.financialOverview.kpis.netPositionPence >= 0
          ? 'YTD surplus for the selected year'
          : 'YTD deficit for the selected year',
      href: '/reports/income-statement',
      tint: data.financialOverview.kpis.netPositionPence >= 0 ? 'teal' : 'amber',
      icon: <Wallet size={18} aria-hidden="true" />,
    },
  ].filter(Boolean) as Array<{
    key: string;
    title: string;
    value: string | number;
    subtitle: string;
    href: string;
    tint: string;
    icon: ReactNode;
  }>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={`Monitor cash, funds, income, expenses, and finance workflow for ${data.orgName}.`}
        actions={
          <>
            <PeriodSelector
              value={period}
              onChange={handlePeriodChange}
              disabled={isPending}
            />
            <YearSelector
              selectedYear={selectedYear}
              comparePreviousYear={comparePreviousYear}
              onYearChange={handleYearChange}
              onCompareChange={handleCompareChange}
              disabled={isPending}
            />
            <CustomizePanel layout={layout} onChange={handleLayoutChange} />
            {canEdit ? (
              <Button asChild variant="outline">
                <Link href="/journals/new">
                  <Plus size={14} aria-hidden="true" />
                  New journal
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href="/reports/export-pack">
                <Upload size={14} aria-hidden="true" />
                Export pack
              </Link>
            </Button>
          </>
        }
      />

      <EmptySetupPrompts data={data} />

      {/* ---- Primary workspace ---- */}
      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        {renderWidget('overview-chart')}

        <CashPositionOverview rows={data.financialOverview.cashPosition} />
      </div>

      {financialCards.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {financialCards.map((card) => (
            <StatCard
              key={card.key}
              title={card.title}
              value={card.value}
              subtitle={card.subtitle}
              href={card.href}
              tint={card.tint}
              icon={card.icon}
            />
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <RestrictedFundTracker rows={data.financialOverview.restrictedFundTracker} />
        <MonthlyIncomeExpense data={data} />
      </div>

      <Card className="rounded-3xl border-border/70 bg-card">
        <CardContent className="flex flex-col gap-4 py-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold">{rolePreset.title}</p>
            <p className="text-sm text-muted-foreground">{rolePreset.summary}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {rolePreset.primaryActions.map((action) => (
              <Button
                key={`${action.href}::${action.label}`}
                asChild
                variant="outline"
                size="sm"
              >
                <Link href={action.href}>{action.label}</Link>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        {isVisible('todo-list') ? renderWidget('todo-list') : null}
        <DashboardDayCalendarCard events={data.dayCalendarEvents} />
      </div>

      {priorityFinanceWidgets.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {priorityFinanceWidgets}
        </div>
      ) : null}

      {guidance && (
        <div className="grid gap-6 lg:grid-cols-2">
          <MonthEndCard checklist={guidance.monthEnd} />
          <IndicatorList
            title="Financial Health"
            items={guidance.indicators.slice(0, 3)}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <PreviousYearComparison data={data} />
      </div>

      {/* ---- Optional widgets in a responsive 3-column grid ---- */}
      {optionalWidgets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {optionalWidgets.map((id) => renderWidget(id))}
        </div>
      )}

      {/* ---- Full-width widgets (breakdown, timeline) ---- */}
      {fullWidthWidgets.map((id) => renderWidget(id))}
    </div>
  );
}
