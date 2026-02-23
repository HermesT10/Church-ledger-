'use client';

import Link from 'next/link';
import { toast } from 'sonner';
import { Landmark } from 'lucide-react';
import type {
  STrusteeSnapshot,
  STrusteeVariance,
} from '@/lib/reports/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/stat-card';
import { ReportShell } from '@/components/reports/report-shell';
import { ReportSection } from '@/components/reports/report-section';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatPounds(pence: number): string {
  const pounds = pence / 100;
  const prefix = pounds < 0 ? '-£' : '£';
  return `${prefix}${Math.abs(pounds).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function penceToPounds(pence: number): string {
  if (pence === 0) return '—';
  return formatPounds(pence);
}

function pctDisplay(pct: number | null): string {
  if (pct === null) return '—';
  return `${(pct * 100).toFixed(1)}%`;
}

/* ------------------------------------------------------------------ */
/*  CSV export                                                         */
/* ------------------------------------------------------------------ */

function buildCsv(data: STrusteeSnapshot): string {
  const lines: string[] = ['Section,Item,Value'];

  // Cash
  for (const item of data.cash.items) {
    lines.push(`Cash,"${item.accountName}",${formatPounds(item.balance)}`);
  }
  lines.push(`Cash,Total,${formatPounds(data.cash.total)}`);

  // Funds
  lines.push(`Funds,Restricted,${formatPounds(data.funds.restrictedTotal)}`);
  lines.push(
    `Funds,Unrestricted,${formatPounds(data.funds.unrestrictedTotal)}`,
  );
  lines.push(`Funds,Designated,${formatPounds(data.funds.designatedTotal)}`);

  // I&E MTD
  lines.push(
    `"I&E MTD",Income,${formatPounds(data.incomeExpenditure.mtd.income)}`,
  );
  lines.push(
    `"I&E MTD",Expense,${formatPounds(data.incomeExpenditure.mtd.expense)}`,
  );
  lines.push(
    `"I&E MTD",Surplus,${formatPounds(data.incomeExpenditure.mtd.surplus)}`,
  );

  // I&E YTD
  lines.push(
    `"I&E YTD",Income,${formatPounds(data.incomeExpenditure.ytd.income)}`,
  );
  lines.push(
    `"I&E YTD",Expense,${formatPounds(data.incomeExpenditure.ytd.expense)}`,
  );
  lines.push(
    `"I&E YTD",Surplus,${formatPounds(data.incomeExpenditure.ytd.surplus)}`,
  );

  // Variances
  for (const v of data.topVariances) {
    lines.push(
      `Variances,"${v.accountName} (${v.accountType})",${formatPounds(v.adverseVariancePence)}`,
    );
  }

  // Forecast
  lines.push(`Forecast,Baseline YE,${formatPounds(data.forecast.baselineYE)}`);
  lines.push(`Forecast,Trend YE,${formatPounds(data.forecast.trendYE)}`);
  lines.push(`Forecast,Risk Level,${data.forecast.riskLevel}`);

  return lines.join('\n');
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

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  initialData: STrusteeSnapshot | null;
  role: string;
  error?: string | null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TrusteeSnapshotClient({ initialData: data, role, error }: Props) {
  const canNavigate = role === 'admin' || role === 'treasurer';

  const handleExportCsv = () => {
    if (!data) return;
    const csv = buildCsv(data);
    downloadCsv(csv, `trustee-snapshot-${data.asOfDate}.csv`);
    toast.success('CSV downloaded.');
  };

  if (!data && !error) {
    return (
      <ReportShell
        title="Trustee Snapshot"
        description="Executive summary of cash, funds, income & expenditure, variances, and forecast risk."
        activeReport="/reports/trustee-snapshot"
        error={error}
      >
        <p className="text-sm text-muted-foreground">
          No snapshot data available. Post journals and create budgets to populate
          this report.
        </p>
      </ReportShell>
    );
  }

  return (
    <ReportShell
      title="Trustee Snapshot"
      asOfDate={data?.asOfDate}
      description="Executive summary of cash, funds, income & expenditure, variances, and forecast risk."
      activeReport="/reports/trustee-snapshot"
      action={
        <Button variant="outline" size="sm" onClick={handleExportCsv}>
          Export CSV
        </Button>
      }
      error={error}
    >
      <div className="space-y-6">
        {/* ==== 1. Cash Position ==== */}
        <ReportSection
          title="Cash Position"
          viewLink="/reports/balance-sheet"
          viewLabel="View Balance Sheet"
          canNavigate={canNavigate}
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {data.cash.items.map((item) => (
            <StatCard
              key={item.accountId}
              title={item.accountName}
              value={formatPounds(item.balance)}
              href={canNavigate ? '/reports/balance-sheet' : '#'}
              gradient="bg-gradient-to-br from-sky-500 to-sky-700"
              icon={<Landmark size={20} />}
            />
          ))}
          <StatCard
            title="Total Cash"
            value={formatPounds(data.cash.total)}
            href={canNavigate ? '/reports/balance-sheet' : '#'}
            gradient="bg-gradient-to-br from-violet-500 to-violet-700"
            icon={<Landmark size={20} />}
          />
        </div>
        </ReportSection>

        {/* ==== 2. Fund Balances ==== */}
        <ReportSection
          title="Fund Balances"
          viewLink="/reports/fund-movements"
          viewLabel="View Fund Movements"
          canNavigate={canNavigate}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FundCard
            label="Restricted"
            amount={data.funds.restrictedTotal}
            colorClass="text-blue-600 dark:text-blue-400"
            bgClass="bg-blue-50 dark:bg-blue-950/30"
          />
          <FundCard
            label="Unrestricted"
            amount={data.funds.unrestrictedTotal}
            colorClass="text-emerald-600 dark:text-emerald-400"
            bgClass="bg-emerald-50 dark:bg-emerald-950/30"
          />
          <FundCard
            label="Designated"
            amount={data.funds.designatedTotal}
            colorClass="text-amber-600 dark:text-amber-400"
            bgClass="bg-amber-50 dark:bg-amber-950/30"
          />
        </div>
        </ReportSection>

        {/* ==== 3. Income vs Expenditure ==== */}
        <ReportSection
          title="Income vs Expenditure"
          viewLink="/reports/budget-vs-actual"
          viewLabel="View Budget vs Actual"
          canNavigate={canNavigate}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <IECard
            title="Month to Date"
            income={data.incomeExpenditure.mtd.income}
            expense={data.incomeExpenditure.mtd.expense}
            surplus={data.incomeExpenditure.mtd.surplus}
          />
          <IECard
            title="Year to Date"
            income={data.incomeExpenditure.ytd.income}
            expense={data.incomeExpenditure.ytd.expense}
            surplus={data.incomeExpenditure.ytd.surplus}
          />
        </div>
        </ReportSection>

        {/* ==== 4. Top Variances ==== */}
        <ReportSection
          title="Top Variances"
          viewLink="/reports/budget-vs-actual"
          viewLabel="View Report"
          canNavigate={canNavigate}
        >
          <Card className="rounded-2xl shadow-sm border">
          <CardContent className="pt-6">
            {data.topVariances.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No adverse variances. All accounts are within budget.
              </p>
            ) : (
              <div className="space-y-3">
                {data.topVariances.map((v) => (
                  <VarianceRow
                    key={v.accountId}
                    variance={v}
                    canNavigate={canNavigate}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </ReportSection>

        {/* ==== 5. Forecast Risk Summary ==== */}
        <ReportSection
          title="Forecast Risk"
          viewLink="/reports/forecast"
          viewLabel="View Forecast"
          canNavigate={canNavigate}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="rounded-2xl shadow-sm border">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Baseline Year-End</p>
              <p className="text-xl font-bold tabular-nums">
                {formatPounds(data.forecast.baselineYE)}
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm border">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Trend Year-End</p>
              <p className="text-xl font-bold tabular-nums">
                {formatPounds(data.forecast.trendYE)}
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm border">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Risk Level</p>
              <div className="mt-1">
                {data.forecast.riskLevel === 'ON_TRACK' ? (
                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 text-xs">
                    On Track
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-xs">
                    At Risk
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        </ReportSection>

        {/* Footer */}
        <p className="text-xs text-muted-foreground">
          Trustee Snapshot as of {data.asOfDate}
        </p>
      </div>
    </ReportShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function FundCard({
  label,
  amount,
  colorClass,
  bgClass,
}: {
  label: string;
  amount: number;
  colorClass: string;
  bgClass: string;
}) {
  return (
    <Card className={bgClass}>
      <CardContent className="pt-6">
        <p className={`text-sm font-medium ${colorClass}`}>{label}</p>
        <p className="text-xl font-bold tabular-nums mt-1">
          {formatPounds(amount)}
        </p>
      </CardContent>
    </Card>
  );
}

function IECard({
  title,
  income,
  expense,
  surplus,
}: {
  title: string;
  income: number;
  expense: number;
  surplus: number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Income</span>
            <span className="tabular-nums font-medium">
              {penceToPounds(income)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Expenditure</span>
            <span className="tabular-nums font-medium">
              {penceToPounds(expense)}
            </span>
          </div>
          <div className="border-t pt-2 flex justify-between text-sm font-semibold">
            <span>{surplus >= 0 ? 'Surplus' : 'Deficit'}</span>
            <span
              className={`tabular-nums ${
                surplus > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : surplus < 0
                    ? 'text-red-600 dark:text-red-400'
                    : ''
              }`}
            >
              {penceToPounds(surplus)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function VarianceRow({
  variance: v,
  canNavigate,
}: {
  variance: STrusteeVariance;
  canNavigate: boolean;
}) {
  const inner = (
    <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <Badge
          variant={
            v.accountType === 'expense' ? 'destructive' : 'secondary'
          }
          className="text-[10px] px-1.5 py-0 leading-tight shrink-0"
        >
          {v.accountType === 'expense' ? 'overspend' : 'under-income'}
        </Badge>
        <span className="truncate font-medium">{v.accountName}</span>
      </div>
      <div className="flex items-center gap-4 shrink-0 ml-4">
        <span className="tabular-nums font-medium text-destructive">
          {penceToPounds(v.adverseVariancePence)}
        </span>
        <span className="tabular-nums text-muted-foreground w-16 text-right">
          {pctDisplay(v.adverseVariancePct)}
        </span>
      </div>
    </div>
  );

  if (canNavigate) {
    return (
      <Link key={v.accountId} href="/reports/budget-vs-actual">
        {inner}
      </Link>
    );
  }

  return <div key={v.accountId}>{inner}</div>;
}
