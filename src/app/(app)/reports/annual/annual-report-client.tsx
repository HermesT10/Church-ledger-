'use client';

import { useState, useCallback } from 'react';
import { getAnnualReport } from '@/lib/reports/actions';
import { ReportShell } from '@/components/reports/report-shell';
import type { SAnnualReport } from '@/lib/reports/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

function p(pence: number): string {
  return (pence / 100).toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
  });
}

interface Props {
  initialData: SAnnualReport | null;
  orgId: string;
  role: string;
  defaultYear: number;
  error?: string | null;
}

export function AnnualReportClient({ initialData, orgId, role, defaultYear, error }: Props) {
  const [report, setReport] = useState<SAnnualReport | null>(initialData);
  const [year, setYear] = useState(defaultYear);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(
    async (y: number) => {
      setLoading(true);
      try {
        const { data } = await getAnnualReport({ organisationId: orgId, year: y });
        setReport(data);
      } finally {
        setLoading(false);
      }
    },
    [orgId],
  );

  const handleYearChange = (v: string) => {
    const y = Number(v);
    setYear(y);
    reload(y);
  };

  const years = Array.from({ length: 5 }, (_, i) => defaultYear - i);
  const ie = report?.incomeStatement;
  const bs = report?.balanceSheet;
  const fm = report?.fundMovements;
  const bva = report?.budgetVsActual;
  const prior = report?.priorYear;

  const incomeCategory = ie?.categories.find((c) => c.categoryName === 'Income');
  const expenseCategory = ie?.categories.find((c) => c.categoryName === 'Expenses');
  const priorIncomeCategory = prior?.incomeStatement?.categories.find((c) => c.categoryName === 'Income');
  const priorExpenseCategory = prior?.incomeStatement?.categories.find((c) => c.categoryName === 'Expenses');

  return (
    <ReportShell
      title="Annual Report"
      asOfDate={report ? String(year) : undefined}
      description="Full-year financial pack: income statement, balance sheet, fund breakdown, and budget comparison."
      activeReport="/reports/annual"
      action={
        <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Select value={String(year)} onValueChange={handleYearChange}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {loading && <Loader2 size={16} className="animate-spin text-muted-foreground" />}

        <button
          className="ml-auto text-sm text-primary hover:underline print:hidden"
          onClick={() => window.print()}
        >
          Print / Save as PDF
        </button>
        </div>
      }
      error={error}
    >
      {!report && !loading && (
        <p className="text-sm text-muted-foreground">No data available.</p>
      )}

      {report && (
        <div className="space-y-8">
          {/* Section 1: Income Statement */}
          <section>
            <h2 className="text-lg font-semibold mb-3 border-b pb-1">
              Income Statement — {year}
            </h2>
            {ie && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Code</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right w-36">
                      {year}
                    </TableHead>
                    {prior?.incomeStatement && (
                      <TableHead className="text-right w-36">
                        {year - 1}
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Income */}
                  <TableRow className="bg-muted/30">
                    <TableCell colSpan={prior?.incomeStatement ? 4 : 3} className="font-semibold text-sm">
                      Income
                    </TableCell>
                  </TableRow>
                  {incomeCategory?.rows
                    .filter((r) => r.ytdActual !== 0)
                    .map((row) => {
                      const priorRow = priorIncomeCategory?.rows.find((r) => r.accountId === row.accountId);
                      return (
                        <TableRow key={row.accountId}>
                          <TableCell className="font-mono text-xs text-muted-foreground">{row.accountCode}</TableCell>
                          <TableCell>{row.accountName}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{p(row.ytdActual)}</TableCell>
                          {prior?.incomeStatement && (
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                              {priorRow ? p(priorRow.ytdActual) : '—'}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  <TableRow className="font-semibold">
                    <TableCell />
                    <TableCell>Total Income</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {p(incomeCategory?.totals.ytdActual ?? 0)}
                    </TableCell>
                    {prior?.incomeStatement && (
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {p(priorIncomeCategory?.totals.ytdActual ?? 0)}
                      </TableCell>
                    )}
                  </TableRow>

                  {/* Expenses */}
                  <TableRow className="bg-muted/30">
                    <TableCell colSpan={prior?.incomeStatement ? 4 : 3} className="font-semibold text-sm">
                      Expenses
                    </TableCell>
                  </TableRow>
                  {expenseCategory?.rows
                    .filter((r) => r.ytdActual !== 0)
                    .map((row) => {
                      const priorRow = priorExpenseCategory?.rows.find((r) => r.accountId === row.accountId);
                      return (
                        <TableRow key={row.accountId}>
                          <TableCell className="font-mono text-xs text-muted-foreground">{row.accountCode}</TableCell>
                          <TableCell>{row.accountName}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{p(row.ytdActual)}</TableCell>
                          {prior?.incomeStatement && (
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                              {priorRow ? p(priorRow.ytdActual) : '—'}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  <TableRow className="font-semibold">
                    <TableCell />
                    <TableCell>Total Expenses</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {p(expenseCategory?.totals.ytdActual ?? 0)}
                    </TableCell>
                    {prior?.incomeStatement && (
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {p(priorExpenseCategory?.totals.ytdActual ?? 0)}
                      </TableCell>
                    )}
                  </TableRow>

                  {/* Net */}
                  <TableRow className="bg-primary/5 font-bold">
                    <TableCell />
                    <TableCell>Net Surplus / (Deficit)</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {p(ie.totals.ytdActual)}
                    </TableCell>
                    {prior?.incomeStatement && (
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {p(prior.incomeStatement.totals.ytdActual)}
                      </TableCell>
                    )}
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </section>

          {/* Section 2: Balance Sheet */}
          {bs && (
            <section>
              <h2 className="text-lg font-semibold mb-3 border-b pb-1">
                Balance Sheet — as of {bs.asOfDate}
              </h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Code</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right w-36">{year}</TableHead>
                    {prior?.balanceSheet && (
                      <TableHead className="text-right w-36">{year - 1}</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(['assets', 'liabilities', 'equity'] as const).map((section) => {
                    const data = bs.sections[section];
                    const priorData = prior?.balanceSheet?.sections[section];
                    const label = section.charAt(0).toUpperCase() + section.slice(1);
                    return (
                      <>
                        <TableRow key={section} className="bg-muted/30">
                          <TableCell colSpan={prior?.balanceSheet ? 4 : 3} className="font-semibold text-sm">
                            {label}
                          </TableCell>
                        </TableRow>
                        {data.rows.map((row) => {
                          const priorRow = priorData?.rows.find((r) => r.accountId === row.accountId);
                          return (
                            <TableRow key={row.accountId}>
                              <TableCell className="font-mono text-xs text-muted-foreground">{row.accountCode}</TableCell>
                              <TableCell>{row.accountName}</TableCell>
                              <TableCell className="text-right font-mono text-sm">{p(row.balance)}</TableCell>
                              {prior?.balanceSheet && (
                                <TableCell className="text-right font-mono text-sm text-muted-foreground">
                                  {priorRow ? p(priorRow.balance) : '—'}
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                        <TableRow key={section + '-total'} className="font-semibold">
                          <TableCell />
                          <TableCell>Total {label}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{p(data.total)}</TableCell>
                          {prior?.balanceSheet && (
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                              {p(priorData?.total ?? 0)}
                            </TableCell>
                          )}
                        </TableRow>
                      </>
                    );
                  })}
                  <TableRow className="bg-primary/5 font-bold">
                    <TableCell />
                    <TableCell>Net Assets</TableCell>
                    <TableCell className="text-right font-mono text-sm">{p(bs.netAssets)}</TableCell>
                    {prior?.balanceSheet && (
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {p(prior.balanceSheet.netAssets)}
                      </TableCell>
                    )}
                  </TableRow>
                </TableBody>
              </Table>
              {!bs.check.balances && (
                <p className="text-sm text-destructive mt-2">
                  Balance check failed — difference: {p(bs.check.difference)}
                </p>
              )}
            </section>
          )}

          {/* Section 3: Fund Movements */}
          {fm && fm.funds.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3 border-b pb-1">
                Fund Movements — {year}
              </h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fund</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">Income</TableHead>
                    <TableHead className="text-right">Expenses</TableHead>
                    <TableHead className="text-right">Closing</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fm.funds.map((f) => (
                    <TableRow key={f.fundId}>
                      <TableCell className="font-medium">{f.fundName}</TableCell>
                      <TableCell>
                        <Badge variant={f.fundType === 'restricted' ? 'destructive' : 'secondary'}>
                          {f.fundType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{p(f.openingBalancePence)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{p(f.incomePence)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{p(f.expenditurePence)}</TableCell>
                      <TableCell className={`text-right font-mono text-sm font-medium ${f.closingBalancePence < 0 ? 'text-red-600' : ''}`}>
                        {p(f.closingBalancePence)}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={2}>Total</TableCell>
                    <TableCell className="text-right font-mono text-sm">{p(fm.totals.openingBalancePence)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{p(fm.totals.incomePence)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{p(fm.totals.expenditurePence)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{p(fm.totals.closingBalancePence)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </section>
          )}

          {/* Section 4: Budget vs Actual Summary */}
          {bva && (
            <section>
              <h2 className="text-lg font-semibold mb-3 border-b pb-1">
                Budget vs Actual — {year}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Budget
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-lg font-semibold font-mono">{p(bva.totalBudgetPence)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Actual
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-lg font-semibold font-mono">{p(bva.totalActualPence)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Variance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className={`text-lg font-semibold font-mono ${bva.variancePence >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {p(bva.variancePence)}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </section>
          )}
        </div>
      )}
    </ReportShell>
  );
}
