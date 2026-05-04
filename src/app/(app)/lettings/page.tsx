import Link from 'next/link';
import { AlertTriangle, Download, FileText, Plus, Upload, Users } from 'lucide-react';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  createLettingsChargeAction,
  createLettingsHirerAction,
  getLettingsYearData,
} from '@/lib/lettings/actions';
import { formatLettingsPounds } from '@/lib/lettings/format';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const SHORT_MONTHS = MONTHS.map((month) => month.slice(0, 3));

function statusBadge(status: string) {
  if (status === 'paid') return <Badge className="border-success/20 bg-success-soft text-success">Paid</Badge>;
  if (status === 'part_paid') return <Badge className="border-warning/20 bg-warning-soft text-warning">Part paid</Badge>;
  if (status === 'overdue') return <Badge variant="destructive">Overdue</Badge>;
  if (status === 'waived') return <Badge variant="outline">Waived</Badge>;
  if (status === 'cancelled') return <Badge variant="outline">Cancelled</Badge>;
  if (status === 'not_set') return <span className="text-xs text-muted-foreground">—</span>;
  return <Badge variant="secondary">Expected</Badge>;
}

function moneyCell(params: { expected: number; paid: number; outstanding: number; status: string }) {
  if (params.expected === 0 && params.paid === 0) {
    return <span className="text-xs text-muted-foreground">No charge</span>;
  }
  return (
    <div className="space-y-1 text-xs">
      <p>
        <span className="text-muted-foreground">Expected </span>
        <span className="font-medium text-foreground">{formatLettingsPounds(params.expected)}</span>
      </p>
      <p>
        <span className="text-muted-foreground">Paid </span>
        <span className="font-medium text-foreground">{formatLettingsPounds(params.paid)}</span>
      </p>
      {params.outstanding > 0 ? (
        <p className="font-medium text-warning">Outstanding {formatLettingsPounds(params.outstanding)}</p>
      ) : null}
      {statusBadge(params.status)}
    </div>
  );
}

export default async function LettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; error?: string }>;
}) {
  const { orgId, role } = await getActiveOrg();
  const canManage = role === 'admin' || role === 'treasurer';
  const params = await searchParams;
  const year = Number.parseInt(params.year ?? String(new Date().getFullYear()), 10) || new Date().getFullYear();
  const previousYear = year - 1;
  const nextYear = year + 1;

  const [lettings, referenceData] = await Promise.all([
    getLettingsYearData(year),
    (async () => {
      const supabase = await createClient();
      const [{ data: funds }, { data: accounts }] = await Promise.all([
        supabase
          .from('funds')
          .select('id, name')
          .eq('organisation_id', orgId)
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('accounts')
          .select('id, code, name')
          .eq('organisation_id', orgId)
          .eq('type', 'income')
          .eq('is_active', true)
          .order('code'),
      ]);
      return { funds: funds ?? [], accounts: accounts ?? [] };
    })(),
  ]);

  const data = lettings.data;

  return (
    <PageShell>
      <PageHeader
        title="Lettings"
        subtitle="Track hall hire and room letting income by hirer, month, and payment status."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild>
              <a href="#add-hirer">
                <Plus size={14} className="mr-1" />
                Add Hirer
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href="#add-charge">Add Monthly Charge</a>
            </Button>
            <Button variant="outline" disabled>
              <Upload size={14} className="mr-1" />
              Import Lettings Plan
            </Button>
            <Button asChild variant="outline">
              <Link href="/reconciliation">Match Payments</Link>
            </Button>
            <Button variant="outline" disabled>
              <Download size={14} className="mr-1" />
              Export
            </Button>
            <Button asChild variant="outline">
              <Link href={`/reports/lettings?year=${year}`}>View Report</Link>
            </Button>
          </div>
        }
      />

      {params.error ? (
        <div className="rounded-2xl border border-danger/20 bg-danger-soft p-3 text-sm text-danger">
          {params.error}
        </div>
      ) : null}
      {lettings.error ? (
        <div className="rounded-2xl border border-danger/20 bg-danger-soft p-3 text-sm text-danger">
          {lettings.error}
        </div>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-4 md:grid-cols-5">
            <StatCard
              title="Lettings Income This Year"
              value={formatLettingsPounds(data.summary.incomeThisYearPence)}
              icon={<FileText size={20} />}
              tint="emerald"
              href={`/reports/lettings?year=${year}`}
            />
            <StatCard
              title="Income This Month"
              value={formatLettingsPounds(data.summary.incomeThisMonthPence)}
              icon={<FileText size={20} />}
              tint="blue"
              href={`/reports/lettings?year=${year}`}
            />
            <StatCard
              title="Outstanding Lettings"
              value={formatLettingsPounds(data.summary.outstandingPence)}
              icon={<AlertTriangle size={20} />}
              tint="amber"
              href={`/lettings?year=${year}`}
            />
            <StatCard
              title="Overdue Payments"
              value={data.summary.overdueCount.toString()}
              icon={<AlertTriangle size={20} />}
              tint="rose"
              href={`/lettings?year=${year}`}
            />
            <StatCard
              title="Active Hirers"
              value={data.summary.activeHirerCount.toString()}
              icon={<Users size={20} />}
              tint="slate"
              href="/lettings"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card p-4 shadow-card">
            <div>
              <p className="font-semibold text-foreground">Monthly register</p>
              <p className="text-sm text-muted-foreground">
                Familiar spreadsheet-style view: hirers down the side, months across the page.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/lettings?year=${previousYear}`}>{previousYear}</Link>
              </Button>
              <Badge variant="secondary">{year}</Badge>
              <Button asChild variant="outline" size="sm">
                <Link href={`/lettings?year=${nextYear}`}>{nextYear}</Link>
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 min-w-[220px] bg-card">Hirer</TableHead>
                  {SHORT_MONTHS.map((month) => (
                    <TableHead key={month} className="min-w-[150px]">
                      {month}
                    </TableHead>
                  ))}
                  <TableHead className="min-w-[140px]">Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.hirers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={15} className="py-12 text-center text-sm text-muted-foreground">
                      No lettings hirers yet. Add your first hirer to start building the yearly register.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.hirers.map((row) => (
                    <TableRow key={row.hirer.id}>
                      <TableCell className="sticky left-0 z-10 bg-card align-top">
                        <div className="font-medium text-foreground">{row.hirer.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {[row.hirer.default_room_name, row.hirer.contact_name].filter(Boolean).join(' · ') || 'No contact details'}
                        </div>
                      </TableCell>
                      {row.months.map((month) => (
                        <TableCell key={month.month} className="align-top">
                          {moneyCell({
                            expected: month.expectedPence,
                            paid: month.paidPence,
                            outstanding: month.outstandingPence,
                            status: month.status,
                          })}
                        </TableCell>
                      ))}
                      <TableCell className="align-top text-sm">
                        <p>Expected {formatLettingsPounds(row.totalExpectedPence)}</p>
                        <p>Paid {formatLettingsPounds(row.totalPaidPence)}</p>
                        {row.totalOutstandingPence > 0 ? (
                          <p className="font-medium text-warning">Outstanding {formatLettingsPounds(row.totalOutstandingPence)}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="align-top">
                        {row.status === 'clear' ? (
                          <Badge className="border-success/20 bg-success-soft text-success">Clear</Badge>
                        ) : row.status === 'inactive' ? (
                          <Badge variant="outline">Inactive</Badge>
                        ) : (
                          <Badge className="border-warning/20 bg-warning-soft text-warning">Outstanding</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
                <TableRow className="bg-muted/30">
                  <TableCell className="sticky left-0 z-10 bg-muted/30 font-semibold">Monthly totals</TableCell>
                  {data.monthlyTotals.map((month) => (
                    <TableCell key={month.month} className="text-xs">
                      <p>Expected {formatLettingsPounds(month.expectedPence)}</p>
                      <p>Paid {formatLettingsPounds(month.paidPence)}</p>
                      {month.outstandingPence > 0 ? <p className="text-warning">Outstanding {formatLettingsPounds(month.outstandingPence)}</p> : null}
                    </TableCell>
                  ))}
                  <TableCell className="text-xs font-medium">
                    <p>Expected {formatLettingsPounds(data.summary.expectedThisYearPence)}</p>
                    <p>Paid {formatLettingsPounds(data.summary.incomeThisYearPence)}</p>
                    <p>Outstanding {formatLettingsPounds(data.summary.outstandingPence)}</p>
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {canManage ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card id="add-hirer">
                <CardHeader>
                  <CardTitle>Add Hirer</CardTitle>
                </CardHeader>
                <CardContent>
                  <form action={createLettingsHirerAction} className="grid gap-3">
                    <input name="name" className="h-10 rounded-md border bg-background px-3 text-sm" placeholder="Hirer name" required />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input name="contact_name" className="h-10 rounded-md border bg-background px-3 text-sm" placeholder="Contact name" />
                      <input name="email" className="h-10 rounded-md border bg-background px-3 text-sm" placeholder="Email" type="email" />
                      <input name="phone" className="h-10 rounded-md border bg-background px-3 text-sm" placeholder="Phone" />
                      <input name="default_room_name" className="h-10 rounded-md border bg-background px-3 text-sm" placeholder="Default room" />
                      <input name="default_rate" className="h-10 rounded-md border bg-background px-3 text-sm" placeholder="Default rate e.g. 88.00" />
                      <select name="default_fund_id" className="h-10 rounded-md border bg-background px-3 text-sm" defaultValue="">
                        <option value="">Default fund</option>
                        {referenceData.funds.map((fund) => (
                          <option key={fund.id} value={fund.id}>{fund.name}</option>
                        ))}
                      </select>
                    </div>
                    <select name="default_income_account_id" className="h-10 rounded-md border bg-background px-3 text-sm" defaultValue="">
                      <option value="">Default income account</option>
                      {referenceData.accounts.map((account) => (
                        <option key={account.id} value={account.id}>{account.code} {account.name}</option>
                      ))}
                    </select>
                    <textarea name="notes" className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm" placeholder="Notes" />
                    <Button type="submit">Add Hirer</Button>
                  </form>
                </CardContent>
              </Card>

              <Card id="add-charge">
                <CardHeader>
                  <CardTitle>Add Monthly Charge</CardTitle>
                </CardHeader>
                <CardContent>
                  <form action={createLettingsChargeAction} className="grid gap-3">
                    <input type="hidden" name="period_year" value={year} />
                    <select name="hirer_id" className="h-10 rounded-md border bg-background px-3 text-sm" required defaultValue="">
                      <option value="" disabled>Choose hirer</option>
                      {data.hirers.map((row) => (
                        <option key={row.hirer.id} value={row.hirer.id}>{row.hirer.name}</option>
                      ))}
                    </select>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <select name="period_month" className="h-10 rounded-md border bg-background px-3 text-sm" required defaultValue={String(new Date().getMonth() + 1)}>
                      {MONTHS.map((month, index) => (
                        <option key={month} value={index + 1}>{month}</option>
                      ))}
                    </select>
                    <input name="expected_amount" className="h-10 rounded-md border bg-background px-3 text-sm" placeholder="Expected amount e.g. 176.00" required />
                    <input name="due_date" className="h-10 rounded-md border bg-background px-3 text-sm" type="date" />
                    <input name="description" className="h-10 rounded-md border bg-background px-3 text-sm" placeholder="Description" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Each charge needs a <span className="font-medium text-foreground">fund</span> and GL{' '}
                    <span className="font-medium text-foreground">income account</span> (e.g. hall hire). This is separate from any “Lettings” category or income stream used on journals.
                  </p>
                  <select
                    name="default_fund_id"
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    required
                    defaultValue={referenceData.funds[0]?.id ?? ''}
                  >
                    {referenceData.funds.map((fund) => (
                      <option key={fund.id} value={fund.id}>{fund.name}</option>
                    ))}
                  </select>
                  <select
                    name="default_income_account_id"
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    required
                    defaultValue={referenceData.accounts[0]?.id ?? ''}
                  >
                    {referenceData.accounts.map((account) => (
                      <option key={account.id} value={account.id}>{account.code} {account.name}</option>
                    ))}
                  </select>
                  <Button
                    type="submit"
                    disabled={data.hirers.length === 0 || referenceData.funds.length === 0 || referenceData.accounts.length === 0}
                  >
                    Add Monthly Charge
                  </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </>
      ) : null}
    </PageShell>
  );
}
