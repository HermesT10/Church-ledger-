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
import { getLettingsYearData } from '@/lib/lettings/actions';
import { formatLettingsPounds } from '@/lib/lettings/format';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default async function LettingsReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const params = await searchParams;
  const year = Number.parseInt(params.year ?? String(new Date().getFullYear()), 10) || new Date().getFullYear();
  const result = await getLettingsYearData(year);
  const data = result.data;

  return (
    <PageShell>
      <PageHeader
        title="Lettings Income Report"
        subtitle="Income by hirer and month, with expected, paid, outstanding, and overdue totals."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={`/reports/lettings?year=${year - 1}`}>{year - 1}</Link>
            </Button>
            <Button variant="secondary">{year}</Button>
            <Button asChild variant="outline">
              <Link href={`/reports/lettings?year=${year + 1}`}>{year + 1}</Link>
            </Button>
            <Button asChild>
              <Link href={`/lettings?year=${year}`}>Open Lettings</Link>
            </Button>
          </div>
        }
      />

      {result.error ? (
        <div className="rounded-2xl border border-danger/20 bg-danger-soft p-3 text-sm text-danger">
          {result.error}
        </div>
      ) : null}

      {data ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-card">
              <p className="text-sm text-muted-foreground">Expected</p>
              <p className="mt-2 text-2xl font-bold">{formatLettingsPounds(data.summary.expectedThisYearPence)}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-card">
              <p className="text-sm text-muted-foreground">Paid</p>
              <p className="mt-2 text-2xl font-bold">{formatLettingsPounds(data.summary.incomeThisYearPence)}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-card">
              <p className="text-sm text-muted-foreground">Outstanding</p>
              <p className="mt-2 text-2xl font-bold">{formatLettingsPounds(data.summary.outstandingPence)}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-card">
              <p className="text-sm text-muted-foreground">Overdue charges</p>
              <p className="mt-2 text-2xl font-bold">{data.summary.overdueCount}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hirer</TableHead>
                  {MONTHS.map((month) => <TableHead key={month}>{month}</TableHead>)}
                  <TableHead>Total paid</TableHead>
                  <TableHead>Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.hirers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={15} className="py-10 text-center text-muted-foreground">
                      No Lettings data for {year}.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.hirers.map((row) => (
                    <TableRow key={row.hirer.id}>
                      <TableCell className="font-medium">{row.hirer.name}</TableCell>
                      {row.months.map((month) => (
                        <TableCell key={month.month} className="text-xs">
                          <p>{formatLettingsPounds(month.paidPence)}</p>
                          {month.outstandingPence > 0 ? (
                            <p className="text-warning">O/S {formatLettingsPounds(month.outstandingPence)}</p>
                          ) : null}
                        </TableCell>
                      ))}
                      <TableCell>{formatLettingsPounds(row.totalPaidPence)}</TableCell>
                      <TableCell>{formatLettingsPounds(row.totalOutstandingPence)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
