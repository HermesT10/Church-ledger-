'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import type { SLeadershipSnapshotReport } from '@/lib/reports/types';
import type { TrusteePack } from '@/lib/reports/trustee-packs/types';
import { buildLeadershipInsights } from '@/lib/reports/insights';
import {
  formatCurrencyFromPence,
  type ReportDefinition,
  type ReportKpi,
  type ReportMetadata,
} from '@/lib/reports/framework';
import { getLeadershipSnapshotReport } from '@/lib/reports/summaryReports';

interface Props {
  orgId: string;
  initialData: SLeadershipSnapshotReport | null;
  initialPack?: TrusteePack | null;
  guidance: InsightSnapshot | null;
  error?: string | null;
}

const PERIODS = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'ytd', label: 'Year to date' },
] as const;

type LeadershipPeriod = (typeof PERIODS)[number]['value'];

function buildCsv(data: SLeadershipSnapshotReport): string {
  return [
    'Section,Item,Value',
    `Summary,"Plain English","${data.plainEnglishSummary.replace(/"/g, '""')}"`,
    `Cash,Total,${formatCurrencyFromPence(data.trusteeSnapshot.cash.total)}`,
    `Funds,Restricted,${formatCurrencyFromPence(data.trusteeSnapshot.funds.restrictedTotal)}`,
    `Funds,Unrestricted,${formatCurrencyFromPence(data.trusteeSnapshot.funds.unrestrictedTotal)}`,
    `Operations,YTD result,${formatCurrencyFromPence(data.trusteeSnapshot.incomeExpenditure.ytd.surplus)}`,
    `Forecast,Risk,${data.trusteeSnapshot.forecast.riskLevel}`,
    ...data.recommendedActions.map((action) => `Action,"Recommended","${action.replace(/"/g, '""')}"`),
  ].join('\n');
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function LeadershipSnapshotClient({ orgId, initialData, initialPack, guidance, error }: Props) {
  const [data, setData] = useState(initialData);
  const [period, setPeriod] = useState<LeadershipPeriod>('this_month');
  const [isPending, startTransition] = useTransition();

  const reload = (newPeriod: LeadershipPeriod) => {
    setPeriod(newPeriod);
    startTransition(async () => {
      if (!data) return;
      const { data: nextData } = await getLeadershipSnapshotReport({
        organisationId: orgId,
        period: newPeriod,
      });
      if (nextData) {
        setData(nextData);
      }
    });
  };

  const metadata: ReportMetadata | undefined = data
    ? {
        scope: `${data.dashboard.periodLabel} leadership summary for trustees and non-finance stakeholders.`,
        source: 'Trustee snapshot, posted ledger dashboard aggregates, and finance control indicators.',
        filters: [{ label: 'Period', value: data.dashboard.periodLabel }],
        footnotes: [
          {
            text: 'This report intentionally uses plain language and should be paired with detailed finance reports for investigation.',
          },
        ],
      }
    : undefined;

  const kpis: ReportKpi[] | undefined = data
    ? [
        {
          label: 'Net Result',
          value: formatCurrencyFromPence(data.dashboard.totals.netPence),
          helper: 'Income less expenditure for the selected period.',
          tone: data.dashboard.totals.netPence >= 0 ? 'positive' : 'critical',
        },
        {
          label: 'Cash',
          value: formatCurrencyFromPence(data.trusteeSnapshot.cash.total),
          helper: 'Total cash held across bank balances in the snapshot.',
          tone: 'neutral',
        },
        {
          label: 'Restricted Funds',
          value: formatCurrencyFromPence(data.trusteeSnapshot.funds.restrictedTotal),
          helper: 'Balance reserved for restricted purposes.',
          tone: data.trusteeSnapshot.funds.restrictedTotal >= 0 ? 'positive' : 'critical',
        },
        {
          label: 'Forecast',
          value: data.trusteeSnapshot.forecast.riskLevel === 'AT_RISK' ? 'At Risk' : 'On Track',
          helper: 'Year-end view based on current forecast logic.',
          tone: data.trusteeSnapshot.forecast.riskLevel === 'AT_RISK' ? 'caution' : 'positive',
        },
      ]
    : undefined;

  const definitions: ReportDefinition[] = [
    {
      term: 'Restricted funds',
      meaning: 'Money that can only be used for the purpose specified by the donor or grant conditions.',
    },
    {
      term: 'Net result',
      meaning: 'Income less expenditure for the selected period; a positive result is a surplus and a negative result is a deficit.',
    },
    {
      term: 'Forecast risk',
      meaning: 'An indicator showing whether the year-end position appears on track or likely to miss plan.',
    },
  ];

  return (
    <ReportShell
      title="Leadership Snapshot"
      description="Board-ready, plain-English financial summary with clear actions and links back to detailed finance reports."
      activeReport="/reports/leadership-snapshot"
      error={error}
      metadata={metadata}
      kpis={kpis}
      insights={data ? buildLeadershipInsights(data.trusteeSnapshot) : undefined}
      definitions={definitions}
      action={
        data ? (
          <div className="flex flex-wrap gap-3">
            <Select value={period} onValueChange={(value) => reload(value as LeadershipPeriod)}>
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
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  buildCsv(data),
                  `leadership-snapshot-${data.generatedAt.slice(0, 10)}.csv`,
                )
              }
            >
              Export CSV
            </Button>
          </div>
        ) : undefined
      }
    >
      {isPending && (
        <p className="text-sm text-muted-foreground">Refreshing snapshot...</p>
      )}

      {!data ? (
        <ReportEmptyState
          title="No leadership snapshot available"
          description="Post finance activity and create budgets so the system can generate leadership commentary."
        />
      ) : (
        <div className="space-y-6">
          <TrusteePackPanel pack={initialPack ?? null} />

          {guidance && (
            <div className="grid gap-6 lg:grid-cols-3">
              <MonthEndCard checklist={guidance.monthEnd} />
              <IndicatorList
                title="Trustee risk indicators"
                items={guidance.indicators.slice(0, 3)}
              />
              <AnomalyList
                title="Notable changes"
                items={guidance.anomalies.slice(0, 3)}
              />
            </div>
          )}

          <Card className="rounded-2xl border shadow-sm">
            <CardContent className="p-6">
              <h2 className="text-base font-semibold">Plain-English summary</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {data.plainEnglishSummary}
              </p>
              {guidance && guidance.narratives.length > 0 && (
                <div className="mt-4 space-y-2">
                  {guidance.narratives.slice(0, 2).map((item) => (
                    <div key={item.id} className="rounded-lg border bg-muted/20 p-3 text-sm">
                      <p className="font-medium">{item.title}</p>
                      <p className="mt-1 text-muted-foreground">{item.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="rounded-2xl border shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-semibold">Recommended next actions</h2>
                  <Badge variant="secondary">{data.recommendedActions.length}</Badge>
                </div>
                <div className="mt-4 space-y-3">
                  {data.recommendedActions.map((action) => (
                    <div key={action} className="rounded-xl border bg-muted/20 p-4 text-sm">
                      {action}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border shadow-sm">
              <CardContent className="p-6">
                <h2 className="text-base font-semibold">Leadership metrics</h2>
                <div className="mt-4 space-y-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total income</span>
                    <span className="font-mono">
                      {formatCurrencyFromPence(data.dashboard.totals.incomePence)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total expenditure</span>
                    <span className="font-mono">
                      {formatCurrencyFromPence(data.dashboard.totals.expensePence)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Gift Aid outstanding</span>
                    <span className="font-mono">
                      {formatCurrencyFromPence(
                        data.dashboard.giftAidSummary?.outstandingPence ?? 0,
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Missing Gift Aid declarations</span>
                    <span className="font-mono">
                      {data.dashboard.giftAidSummary?.donorsMissingDeclarations ?? 0}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline" size="sm">
              <Link href="/reports/trustee-snapshot">Open trustee snapshot</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/reports/monthly-dashboard">Open monthly dashboard</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/reports/annual">Open annual pack</Link>
            </Button>
          </div>
        </div>
      )}
    </ReportShell>
  );
}
