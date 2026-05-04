import Link from 'next/link';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getRegisterData } from '@/lib/registers/actions';
import { formatRegisterPounds, SHORT_MONTH_LABELS } from '@/lib/registers/defaults';

export default async function IncomeExpenseSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; fundId?: string; register?: 'income' | 'expense' }>;
}) {
  const params = await searchParams;
  const year = Number.parseInt(params.year ?? String(new Date().getFullYear()), 10) || new Date().getFullYear();
  const [incomeRes, expenseRes] = await Promise.all([
    getRegisterData({ registerType: 'income', year, comparisonYear: year - 1, fundId: params.fundId ?? null }),
    getRegisterData({ registerType: 'expense', year, comparisonYear: year - 1, fundId: params.fundId ?? null }),
  ]);
  const income = incomeRes.data;
  const expense = expenseRes.data;
  const netByMonth = SHORT_MONTH_LABELS.map((_, index) =>
    (income?.monthlyTotals[index]?.actualPence ?? 0) - (expense?.monthlyTotals[index]?.actualPence ?? 0)
  );
  const annualNet = (income?.totals.actualPence ?? 0) - (expense?.totals.actualPence ?? 0);

  return (
    <PageShell>
      <PageHeader
        title="Income & Expense Summary"
        subtitle="Monthly income, spending, net position, category breakdown, and year-to-date totals."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link href={`/reports/income-expense-summary?year=${year - 1}`}>{year - 1}</Link></Button>
            <Button variant="secondary">{year}</Button>
            <Button asChild variant="outline"><Link href={`/reports/income-expense-summary?year=${year + 1}`}>{year + 1}</Link></Button>
            <Button asChild><Link href={`/income/register?year=${year}`}>Income Register</Link></Button>
            <Button asChild><Link href={`/expenses/register?year=${year}`}>Expense Register</Link></Button>
            <Button asChild variant="outline"><Link href={`/api/registers/export?type=income&year=${year}`}>Export Income CSV</Link></Button>
            <Button asChild variant="outline"><Link href={`/api/registers/export?type=expense&year=${year}`}>Export Expense CSV</Link></Button>
          </div>
        }
      />

      {incomeRes.error || expenseRes.error ? (
        <div className="rounded-2xl border border-danger/20 bg-danger-soft p-3 text-sm text-danger">
          {incomeRes.error ?? expenseRes.error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-card">
          <p className="text-sm text-muted-foreground">Income YTD</p>
          <p className="mt-2 text-2xl font-bold">{formatRegisterPounds(income?.totals.actualPence ?? 0)}</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-card">
          <p className="text-sm text-muted-foreground">Expenses YTD</p>
          <p className="mt-2 text-2xl font-bold">{formatRegisterPounds(expense?.totals.actualPence ?? 0)}</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-card">
          <p className="text-sm text-muted-foreground">Net Surplus / Deficit</p>
          <p className="mt-2 text-2xl font-bold">{formatRegisterPounds(annualNet)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Summary</TableHead>
              {SHORT_MONTH_LABELS.map((month) => <TableHead key={month}>{month}</TableHead>)}
              <TableHead>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Income</TableCell>
              {income?.monthlyTotals.map((month) => <TableCell key={month.month}>{formatRegisterPounds(month.actualPence)}</TableCell>)}
              <TableCell className="font-semibold">{formatRegisterPounds(income?.totals.actualPence ?? 0)}</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Expenses</TableCell>
              {expense?.monthlyTotals.map((month) => <TableCell key={month.month}>{formatRegisterPounds(month.actualPence)}</TableCell>)}
              <TableCell className="font-semibold">{formatRegisterPounds(expense?.totals.actualPence ?? 0)}</TableCell>
            </TableRow>
            <TableRow className="bg-muted/40">
              <TableCell className="font-semibold">Net</TableCell>
              {netByMonth.map((net, index) => <TableCell key={SHORT_MONTH_LABELS[index]} className="font-semibold">{formatRegisterPounds(net)}</TableCell>)}
              <TableCell className="font-semibold">{formatRegisterPounds(annualNet)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-card">
          <h2 className="font-semibold">Top income sources</h2>
          <div className="mt-3 space-y-2 text-sm">
            {(income?.rows ?? []).slice().sort((a, b) => b.totalActualPence - a.totalActualPence).slice(0, 8).map((row) => (
              <div key={row.categoryId} className="flex justify-between gap-3">
                <span>{row.name}</span>
                <span className="font-medium">{formatRegisterPounds(row.totalActualPence)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-card">
          <h2 className="font-semibold">Top expense categories</h2>
          <div className="mt-3 space-y-2 text-sm">
            {(expense?.rows ?? []).slice().sort((a, b) => b.totalActualPence - a.totalActualPence).slice(0, 8).map((row) => (
              <div key={row.categoryId} className="flex justify-between gap-3">
                <span>{row.name}</span>
                <span className="font-medium">{formatRegisterPounds(row.totalActualPence)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/70 bg-card p-5 text-sm text-muted-foreground shadow-card">
        CSV export is available now. Excel and PDF can use the same calculated register data contract.
      </div>
    </PageShell>
  );
}
