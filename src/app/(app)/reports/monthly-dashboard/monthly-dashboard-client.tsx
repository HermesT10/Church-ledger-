'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { InsightSnapshot } from '@/lib/insights/types';
import { IndicatorList } from '@/components/insights/indicator-list';
import { AnomalyList } from '@/components/insights/anomaly-list';
import { MonthEndCard } from '@/components/insights/month-end-card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ReportEmptyState } from '@/components/reports/report-empty-state';
import { ReportShell } from '@/components/reports/report-shell';
import { TrusteePackPanel } from '@/components/reports/trustee-packs';
import { getDashboardOverview } from '@/lib/reports/dashboard';
import type { DashboardOverview } from '@/lib/reports/types';
import type { TrusteePack } from '@/lib/reports/trustee-packs/types';
import {
  formatCurrencyFromPence,
  type ReportDefinition,
  type ReportInsight,
  type ReportKpi,
  type ReportMetadata,
  type ReportTone,
} from '@/lib/reports/framework';

interface Props {
  orgId: string;
  initialData: DashboardOverview;
  initialPack?: TrusteePack | null;
  guidance: InsightSnapshot | null;
  error?: string | null;
}

function mapNarrativeToneToReportTone(
  severity: InsightSnapshot['narratives'][number]['severity'],
): ReportTone {
  switch (severity) {
    case 'critical':
      return 'critical';
    case 'caution':
      return 'caution';
    case 'positive':
      return 'positive';
    default:
      return 'neutral';
  }
}

const PERIODS = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'ytd', label: 'Year to date' },
] as const;

const DEFAULT_WIDGETS = [
  'cash-position',
  'fund-balances',
  'budget-vs-actual',
  'gift-aid-summary',
  'recent-transactions',
  'supplier-spend',
  'payroll-summary',
];

type DashboardPeriod = (typeof PERIODS)[number]['value'];

function buildInsights(data: DashboardOverview): ReportInsight[] {
  const netPositive = data.totals.netPence >= 0;

  return [
    {
      title: netPositive ? 'Operations are positive for the selected period' : 'Operations are under pressure',
      body: `${data.periodLabel} closed at ${formatCurrencyFromPence(data.totals.netPence)}. Review the category breakdown and Budget vs Actual reports for the drivers.`,
      tone: netPositive ? 'positive' : 'critical',
    },
    {
      title: 'This dashboard is leadership-facing',
      body: 'All numbers are derived from posted finance activity, but the dashboard is intentionally summarised. Use the linked reports when trustees or finance users need full detail.',
      tone: 'neutral',
    },
  ];
}

export function MonthlyDashboardClient({ orgId, initialData, initialPack, guidance, error }: Props) {
  const [data, setData] = useState(initialData);
  const [period, setPeriod] = useState<DashboardPeriod>('this_month');
  const [isPending, startTransition] = useTransition();

  const reload = (newPeriod: DashboardPeriod) => {
    setPeriod(newPeriod);
    startTransition(async () => {
      const { data: nextData } = await getDashboardOverview({
        orgId,
        period: newPeriod,
        visibleWidgets: DEFAULT_WIDGETS,
      });
      setData(nextData);
    });
  };

  const metadata: ReportMetadata = {
    scope: data.periodLabel,
    comparison: 'Compared with the prior matching period where available.',
    source: 'Posted journals plus selected operational widgets drawn from reconciliations, budgets, donations, bills, and payroll.',
    filters: [{ label: 'Period', value: data.periodLabel }],
    footnotes: [
      {
        text: 'The dashboard is deterministic for the selected period and recalculates from source records rather than saved snapshots.',
      },
    ],
  };

  const kpis: ReportKpi[] = [
    {
      label: 'Income',
      value: formatCurrencyFromPence(data.totals.incomePence),
      helper: 'Posted income in the selected period.',
      tone: 'positive',
    },
    {
      label: 'Expenditure',
      value: formatCurrencyFromPence(data.totals.expensePence),
      helper: 'Posted expenditure in the selected period.',
      tone: 'neutral',
    },
    {
      label: 'Net Result',
      value: formatCurrencyFromPence(data.totals.netPence),
      helper: 'Income less expenditure.',
      tone: data.totals.netPence >= 0 ? 'positive' : 'critical',
    },
    {
      label: 'Peak Income Month',
      value: data.peakDate ?? 'N/A',
      helper:
        data.peakDate && data.peakIncome
          ? `${formatCurrencyFromPence(Math.round(data.peakIncome * 100))}`
          : 'No peak month recorded',
      tone: 'neutral',
    },
  ];

  const definitions: ReportDefinition[] = [
    {
      term: 'Net result',
      meaning: 'Income less expenditure for the selected period.',
    },
    {
      term: 'Prior period comparison',
      meaning: 'A like-for-like comparison against the immediately preceding month or prior year-to-date window.',
    },
    {
      term: 'To-do items',
      meaning: 'Operational prompts generated from live finance data, such as pending approvals or reconciliation work.',
    },
  ];

  return (
    <ReportShell
      title="Monthly Finance Dashboard"
      description="Decision-ready monthly dashboard for finance teams, trustees, and leadership."
      activeReport="/reports/monthly-dashboard"
      error={error}
      metadata={metadata}
      kpis={kpis}
      insights={[
        ...buildInsights(data),
        ...(guidance?.narratives.map((item) => ({
          title: item.title,
          body: item.body,
          tone: mapNarrativeToneToReportTone(item.severity),
        })) ?? []),
      ]}
      definitions={definitions}
      action={
        <div className="flex flex-wrap gap-3">
          <Select value={period} onValueChange={(value) => reload(value as DashboardPeriod)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            Print / Save as PDF
          </Button>
        </div>
      }
    >
      {isPending && (
        <p className="text-sm text-muted-foreground">Refreshing dashboard...</p>
      )}

      <TrusteePackPanel pack={initialPack ?? null} />

      {!data ? (
        <ReportEmptyState
          title="No dashboard data yet"
          description="Post transactions and complete month-end workflows to populate the finance dashboard."
        />
      ) : (
        <div className="space-y-6">
          {guidance && (
            <div className="grid gap-6 lg:grid-cols-3">
              <MonthEndCard checklist={guidance.monthEnd} />
              <IndicatorList
                title="Health indicators"
                items={guidance.indicators.slice(0, 3)}
              />
              <AnomalyList
                title="Detected anomalies"
                items={guidance.anomalies.slice(0, 3)}
              />
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="rounded-2xl border shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold">Income breakdown</h2>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/reports/income-statement">Open report</Link>
                  </Button>
                </div>
                <div className="mt-4 space-y-3">
                  {data.incomeBreakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No income activity in this period.</p>
                  ) : (
                    data.incomeBreakdown.map((item) => (
                      <div key={item.name} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{item.name}</span>
                        <span className="font-mono">
                          {formatCurrencyFromPence(item.amountPence)} ({item.pct}%)
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold">Expense breakdown</h2>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/reports/budget-vs-actual">Open report</Link>
                  </Button>
                </div>
                <div className="mt-4 space-y-3">
                  {data.expenseBreakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No expenditure activity in this period.</p>
                  ) : (
                    data.expenseBreakdown.map((item) => (
                      <div key={item.name} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{item.name}</span>
                        <span className="font-mono">
                          {formatCurrencyFromPence(item.amountPence)} ({item.pct}%)
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="rounded-2xl border shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold">Operational actions</h2>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/dashboard">Open workspace</Link>
                  </Button>
                </div>
                <div className="mt-4 space-y-3">
                  {data.todoItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No action items are currently flagged.</p>
                  ) : (
                    data.todoItems.map((item) => (
                      <Link
                        key={`${item.href}-${item.label}`}
                        href={item.href}
                        className="block rounded-xl border bg-muted/20 p-4 text-sm hover:bg-muted/30"
                      >
                        {item.label}
                      </Link>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border shadow-sm">
              <CardContent className="p-6">
                <h2 className="text-base font-semibold">Trust indicators</h2>
                <div className="mt-4 space-y-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Gift Aid outstanding</span>
                    <span className="font-mono">
                      {formatCurrencyFromPence(data.giftAidSummary?.outstandingPence ?? 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Budget variance</span>
                    <span className="font-mono">
                      {formatCurrencyFromPence(data.budgetVsActual?.variancePence ?? 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Largest supplier spend</span>
                    <span className="font-mono">
                      {data.supplierSpend?.[0]
                        ? formatCurrencyFromPence(data.supplierSpend[0].totalPence)
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Payroll status</span>
                    <span className="font-mono">
                      {data.payrollSummary?.status ?? 'No payroll data'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </ReportShell>
  );
}
