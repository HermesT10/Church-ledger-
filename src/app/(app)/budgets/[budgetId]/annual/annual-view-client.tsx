'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  VARIANCE_COLORS,
  VARIANCE_LABELS,
  type BudgetRow,
  type AnnualViewData,
  type AnnualAccountRow,
  type BudgetFundSummary,
  type FundRef,
} from '@/lib/budgets/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StatCard } from '@/components/stat-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertTriangle, TrendingUp, TrendingDown, BarChart3, Lock } from 'lucide-react';

function fmt(pence: number): string {
  return '£' + (Math.abs(pence) / 100).toFixed(2);
}

function fmtSigned(pence: number): string {
  const prefix = pence >= 0 ? '' : '-';
  return prefix + '£' + (Math.abs(pence) / 100).toFixed(2);
}

interface Props {
  budget: BudgetRow;
  annualData: AnnualViewData | null;
  fundSummaries: BudgetFundSummary[];
  fundId: string | null;
  funds: FundRef[];
}

export function AnnualViewClient({
  budget,
  annualData,
  fundSummaries,
  fundId,
  funds,
}: Props) {
  const router = useRouter();
  const isApproved = budget.status === 'approved';

  const restrictedRisks = fundSummaries.filter((f) => f.restrictedOverspendRisk);

  function buildUrl(fund?: string) {
    const base = `/budgets/${budget.id}/annual`;
    if (fund) return `${base}?fund=${fund}`;
    return base;
  }

  function renderAccountTable(
    title: string,
    rows: AnnualAccountRow[],
    totals: { planned: number; actual: number; forecast: number },
  ) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold uppercase tracking-wide">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Account</TableHead>
                  <TableHead className="text-right min-w-[110px]">Annual Budget</TableHead>
                  <TableHead className="text-right min-w-[110px]">YTD Actual</TableHead>
                  <TableHead className="text-right min-w-[110px]">Forecast</TableHead>
                  <TableHead className="text-right min-w-[110px]">Variance</TableHead>
                  <TableHead className="text-center min-w-[90px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                      No {title.toLowerCase()} items budgeted.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.accountId}>
                      <TableCell className="font-medium text-sm">
                        {row.accountCode} — {row.accountName}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(row.annualPlannedPence)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(row.ytdActualPence)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(row.forecastPence)}</TableCell>
                      <TableCell className={`text-right font-mono text-sm ${row.variancePence < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {fmtSigned(row.variancePence)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={VARIANCE_COLORS[row.status]}>
                          {VARIANCE_LABELS[row.status]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}

                {rows.length > 0 && (
                  <TableRow className="border-t-2 font-semibold bg-muted/30">
                    <TableCell>Total {title}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmt(totals.planned)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmt(totals.actual)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmt(totals.forecast)}</TableCell>
                    <TableCell />
                    <TableCell />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">
            {budget.name} — {budget.year} Annual View
          </h1>
          <div className="flex items-center gap-2">
            <Badge variant={budget.status === 'draft' ? 'outline' : budget.status === 'approved' ? 'default' : 'secondary'}>
              {budget.status}
            </Badge>
            <span className="text-xs text-muted-foreground">v{budget.version_number}</span>
            {isApproved && <Lock size={12} className="text-muted-foreground" />}
          </div>
        </div>

        <select
          value={fundId ?? ''}
          onChange={(e) => router.push(buildUrl(e.target.value || undefined))}
          className="flex h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs"
        >
          <option value="">All Funds</option>
          {funds.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
      </div>

      {/* Restricted Fund Alerts */}
      {restrictedRisks.length > 0 && (
        <Card className="border-red-200 bg-red-100/75">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">
                  Restricted Fund Overspend Risk
                </p>
                <ul className="mt-1 text-xs text-red-700 space-y-0.5">
                  {restrictedRisks.map((f) => (
                    <li key={f.fundId}>
                      <strong>{f.fundName}</strong>: Projected deficit of {fmtSigned(f.projectedBalancePence)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Stat Cards */}
      {annualData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Budget Income"
            value={fmt(annualData.totalIncomePlanned)}
            subtitle={`YTD: ${fmt(annualData.totalIncomeActual)}`}
            href={`/budgets/${budget.id}/annual`}
            gradient="bg-gradient-to-br from-emerald-500 to-emerald-700"
            icon={<TrendingUp size={20} />}
          />
          <StatCard
            title="Budget Expense"
            value={fmt(annualData.totalExpensePlanned)}
            subtitle={`YTD: ${fmt(annualData.totalExpenseActual)}`}
            href={`/budgets/${budget.id}/annual`}
            gradient="bg-gradient-to-br from-rose-500 to-rose-700"
            icon={<TrendingDown size={20} />}
          />
          <StatCard
            title="Forecast Income"
            value={fmt(annualData.totalIncomeForecast)}
            subtitle={`vs Budget: ${fmtSigned(annualData.totalIncomeForecast - annualData.totalIncomePlanned)}`}
            href={`/budgets/${budget.id}/annual`}
            gradient="bg-gradient-to-br from-blue-500 to-blue-700"
            icon={<BarChart3 size={20} />}
          />
          <StatCard
            title="Forecast Surplus"
            value={fmtSigned(annualData.netForecast)}
            subtitle={`Budget: ${fmtSigned(annualData.netPlanned)}`}
            href={`/budgets/${budget.id}/annual`}
            gradient={annualData.netForecast >= 0
              ? 'bg-gradient-to-br from-emerald-500 to-emerald-700'
              : 'bg-gradient-to-br from-red-500 to-red-700'}
            icon={<BarChart3 size={20} />}
          />
        </div>
      )}

      {/* Account tables */}
      {annualData && (
        <>
          {renderAccountTable('Income', annualData.incomeRows, {
            planned: annualData.totalIncomePlanned,
            actual: annualData.totalIncomeActual,
            forecast: annualData.totalIncomeForecast,
          })}

          {renderAccountTable('Expenses', annualData.expenseRows, {
            planned: annualData.totalExpensePlanned,
            actual: annualData.totalExpenseActual,
            forecast: annualData.totalExpenseForecast,
          })}

          {/* Net Position */}
          <Card className="border-2">
            <CardContent className="pt-6">
              <div className="grid grid-cols-4 gap-6 text-center">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Budget Net</p>
                  <p className={`text-lg font-bold mt-1 ${annualData.netPlanned >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {fmtSigned(annualData.netPlanned)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">YTD Actual Net</p>
                  <p className={`text-lg font-bold mt-1 ${annualData.netActual >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {fmtSigned(annualData.netActual)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Forecast Net</p>
                  <p className={`text-lg font-bold mt-1 ${annualData.netForecast >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {fmtSigned(annualData.netForecast)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Forecast vs Budget</p>
                  <p className={`text-lg font-bold mt-1 ${annualData.netForecast - annualData.netPlanned >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {fmtSigned(annualData.netForecast - annualData.netPlanned)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Fund Summary Table */}
      {fundSummaries.length > 0 && !fundId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fund Summary</CardTitle>
            <CardDescription>Income and expense overview by fund</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fund</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Planned Income</TableHead>
                    <TableHead className="text-right">Planned Expense</TableHead>
                    <TableHead className="text-right">Actual Income</TableHead>
                    <TableHead className="text-right">Actual Expense</TableHead>
                    <TableHead className="text-right">Projected Net</TableHead>
                    <TableHead className="text-center">Risk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fundSummaries.map((f) => (
                    <TableRow key={f.fundId}>
                      <TableCell className="font-medium">
                        <Link
                          href={buildUrl(f.fundId)}
                          className="hover:underline"
                        >
                          {f.fundName}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">{f.fundType}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(f.plannedIncomePence)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(f.plannedExpensePence)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(f.actualIncomePence)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmt(f.actualExpensePence)}</TableCell>
                      <TableCell className={`text-right font-mono text-sm ${f.projectedBalancePence >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {fmtSigned(f.projectedBalancePence)}
                      </TableCell>
                      <TableCell className="text-center">
                        {f.restrictedOverspendRisk && (
                          <Badge className="bg-red-100 text-red-700">
                            <AlertTriangle size={12} className="mr-1" /> Risk
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
