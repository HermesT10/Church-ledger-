'use client';

import { useState, useCallback, useTransition } from 'react';
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
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Info,
  TrendingUp,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
  DashboardOverview,
  DashboardOverviewSeries,
  CategoryBreakdown,
  TodoItem,
} from '@/lib/reports/types';
import type { WidgetConfig, WidgetId } from '@/lib/dashboard/widgetRegistry';
import { saveDashboardLayout } from '@/lib/dashboard/actions';
import { CustomizePanel } from './customize-panel';
import {
  CashPositionWidget,
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

function fmtPounds(pence: number): string {
  const abs = Math.abs(pence);
  const pounds = abs / 100;
  const sign = pence < 0 ? '-' : '';
  if (pounds >= 1000) {
    return `${sign}£${(pounds / 1000).toFixed(1)}k`;
  }
  return `${sign}£${pounds.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

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
    <div className="flex items-center gap-1 rounded-lg bg-muted/50 p-1">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          disabled={disabled}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            value === p.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Todo Item Row                                                      */
/* ------------------------------------------------------------------ */

function TodoRow({ item }: { item: TodoItem }) {
  const iconMap = {
    warning: <AlertTriangle size={14} className="text-amber-500 shrink-0" />,
    action: <CheckCircle2 size={14} className="text-blue-500 shrink-0" />,
    info: <Info size={14} className="text-muted-foreground shrink-0" />,
  };

  return (
    <Link
      href={item.href}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-muted/50 group"
    >
      {iconMap[item.type]}
      <span className="flex-1 truncate">{item.label}</span>
      <ChevronRight
        size={14}
        className="text-muted-foreground/50 shrink-0 group-hover:text-foreground transition-colors"
      />
    </Link>
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
              isLast ? 'bg-emerald-100/70 text-emerald-600 font-semibold dark:bg-emerald-900/20 dark:text-emerald-400' : 'text-muted-foreground'
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
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  data: DashboardOverview;
  period: string;
  canEdit: boolean;
  initialLayout: WidgetConfig[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DashboardClient({ data: initialData, period: initialPeriod, canEdit, initialLayout }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [data] = useState(initialData);
  const [period, setPeriod] = useState(initialPeriod);
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
      router.push(`/dashboard?period=${newPeriod}`);
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

  const hasChartData = data.series.some((s) => s.income > 0 || s.expense > 0);

  /* ---------------------------------------------------------------- */
  /*  Render a widget by ID                                            */
  /* ---------------------------------------------------------------- */

  function renderWidget(id: WidgetId): React.ReactNode {
    if (!isVisible(id)) return null;

    switch (id) {
      case 'overview-chart':
        return (
          <Card key={id} className="lg:col-span-2 rounded-2xl bg-emerald-100/80 border-emerald-200/50 shadow-sm dark:bg-emerald-950/25 dark:border-emerald-800/25">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold">Overview</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">{data.periodLabel}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {hasChartData ? (
                <>
                  <div className="h-[320px] w-full min-w-0 -ml-2">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                      <AreaChart data={data.series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.2} />
                            <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.2} />
                            <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
                        <XAxis dataKey="dateLabel" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={fmtChartValue} width={60} />
                        <Tooltip content={<ChartTooltip />} />
                        <Area type="monotone" dataKey="income" name="Income" stroke="hsl(var(--chart-1))" strokeWidth={2.5} fill="url(#incomeGrad)" dot={false} activeDot={{ r: 5, strokeWidth: 2, fill: 'hsl(var(--background))' }} />
                        <Area type="monotone" dataKey="expense" name="Expenses" stroke="hsl(var(--chart-2))" strokeWidth={2.5} fill="url(#expenseGrad)" dot={false} activeDot={{ r: 5, strokeWidth: 2, fill: 'hsl(var(--background))' }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-emerald-200/50 dark:border-emerald-800/25">
                    <div>
                      <p className="text-xs text-muted-foreground">Peak date</p>
                      <p className="text-sm font-semibold mt-0.5">{data.peakDate ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Income</p>
                      <p className="text-sm font-semibold mt-0.5">{fmtPoundsExact(data.totals.incomePence)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Net Movement</p>
                      <p className={`text-sm font-semibold mt-0.5 ${data.totals.netPence >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {data.totals.netPence >= 0 ? '+' : ''}{fmtPoundsExact(data.totals.netPence)}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                    <TrendingUp className="h-6 w-6 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm text-muted-foreground">No transactions yet for this period.</p>
                  <Button asChild variant="outline" size="sm" className="mt-4">
                    <Link href="/journals/new">Add First Journal</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );

      case 'income-kpi':
        return (
          <Card key={id} className="rounded-2xl bg-emerald-100/70 border-emerald-200/50 shadow-sm relative overflow-hidden dark:bg-emerald-950/20 dark:border-emerald-800/20">
            <CardContent className="pt-5 pb-4 px-5">
              <p className="text-xs font-medium text-muted-foreground">Income</p>
              <p className="text-2xl font-bold tracking-tight mt-1">{fmtPounds(data.totals.incomePence)}</p>
              {incDelta && (
                <Badge variant="secondary" className={`mt-2 text-[10px] font-semibold ${incDelta.startsWith('+') ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}`}>
                  {incDelta}
                </Badge>
              )}
              <div className="absolute top-3 right-3">
                <Link href="/reports/income-statement" className="w-6 h-6 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-500 dark:text-emerald-400 hover:text-foreground transition-colors">
                  <Plus size={12} />
                </Link>
              </div>
            </CardContent>
          </Card>
        );

      case 'expense-kpi':
        return (
          <Card key={id} className="rounded-2xl bg-rose-100/70 border-rose-200/50 shadow-sm relative overflow-hidden dark:bg-rose-950/20 dark:border-rose-800/20">
            <CardContent className="pt-5 pb-4 px-5">
              <p className="text-xs font-medium text-muted-foreground">Expenses</p>
              <p className="text-2xl font-bold tracking-tight mt-1">{fmtPounds(data.totals.expensePence)}</p>
              {expDelta && (
                <Badge variant="secondary" className={`mt-2 text-[10px] font-semibold ${expDelta.startsWith('+') ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                  {expDelta}
                </Badge>
              )}
              <div className="absolute top-3 right-3">
                <Link href="/reports/income-statement" className="w-6 h-6 rounded-full bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center text-rose-500 dark:text-rose-400 hover:text-foreground transition-colors">
                  <Plus size={12} />
                </Link>
              </div>
            </CardContent>
          </Card>
        );

      case 'todo-list':
        return (
          <Card key={id} className="rounded-2xl bg-slate-100/80 border-slate-200/50 shadow-sm flex-1 dark:bg-slate-900/25 dark:border-slate-700/25">
            <CardHeader className="pb-1 pt-5 px-5">
              <CardTitle className="text-sm font-semibold">To Do</CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-3">
              {data.todoItems.length === 0 ? (
                <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  All caught up!
                </div>
              ) : (
                <div className="space-y-0.5">
                  {data.todoItems.map((item, i) => (
                    <TodoRow key={i} item={item} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );

      case 'breakdown':
        if (data.incomeBreakdown.length === 0 && data.expenseBreakdown.length === 0) return null;
        return (
          <Card key={id} className="lg:col-span-3 rounded-2xl bg-teal-100/65 border-teal-200/50 shadow-sm dark:bg-teal-950/18 dark:border-teal-800/18">
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
                    <div className="divide-y divide-teal-200/50 dark:divide-teal-800/25">
                      {data.incomeBreakdown.map((item, i) => (
                        <BreakdownRow key={item.name} item={item} color={INCOME_COLORS[i] ?? 'bg-emerald-200'} />
                      ))}
                    </div>
                  </div>
                )}
                {data.expenseBreakdown.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Expenses</p>
                    <div className="divide-y divide-teal-200/50 dark:divide-teal-800/25">
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
          <Card key={id} className="lg:col-span-3 rounded-2xl bg-stone-100/65 border-stone-200/50 shadow-sm dark:bg-stone-950/15 dark:border-stone-800/18">
            <CardContent className="py-3 px-4">
              <MonthTimeline series={data.series} />
            </CardContent>
          </Card>
        );

      /* ---- Optional widgets ---- */

      case 'cash-position':
        if (!data.cashPosition || data.cashPosition.length === 0) return null;
        return <CashPositionWidget key={id} data={data.cashPosition} />;

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

  // Separate the "top row" widgets that have the fixed 2/3 + 1/3 layout
  const TOP_ROW_IDS: WidgetId[] = ['overview-chart', 'income-kpi', 'expense-kpi', 'todo-list'];
  const FULL_WIDTH_IDS: WidgetId[] = ['breakdown', 'month-timeline'];

  // Get ordered list of all visible widgets in user's preferred order
  const orderedWidgets = layout.filter((w) => w.visible).map((w) => w.id);

  // Partition into groups
  const topRowWidgets = orderedWidgets.filter((id) => TOP_ROW_IDS.includes(id));
  const fullWidthWidgets = orderedWidgets.filter((id) => FULL_WIDTH_IDS.includes(id));
  const optionalWidgets = orderedWidgets.filter(
    (id) => !TOP_ROW_IDS.includes(id) && !FULL_WIDTH_IDS.includes(id)
  );

  return (
    <div className="space-y-6">
      {/* ---- Header ---- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.periodLabel} &bull; {data.orgName}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PeriodSelector
            value={period}
            onChange={handlePeriodChange}
            disabled={isPending}
          />
          <CustomizePanel layout={layout} onChange={handleLayoutChange} />
          {canEdit && (
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="icon" className="h-9 w-9" asChild>
                <Link href="/journals/new">
                  <Plus size={16} />
                </Link>
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9" asChild>
                <Link href="/reports/export-pack">
                  <Upload size={16} />
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ---- Top Row: Chart (2/3) + Right Column (1/3) ---- */}
      {topRowWidgets.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Overview Chart (takes 2 cols) */}
          {renderWidget('overview-chart')}

          {/* Right column: KPIs + Todo */}
          {(isVisible('income-kpi') || isVisible('expense-kpi') || isVisible('todo-list')) && (
            <div className="flex flex-col gap-6">
              {(isVisible('income-kpi') || isVisible('expense-kpi')) && (
                <div className="grid grid-cols-2 gap-4">
                  {renderWidget('income-kpi')}
                  {renderWidget('expense-kpi')}
                </div>
              )}
              {renderWidget('todo-list')}
            </div>
          )}
        </div>
      )}

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
