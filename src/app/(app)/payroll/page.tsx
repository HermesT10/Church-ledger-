import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import { listPayrollRuns, getPayrollLiabilities } from '@/lib/payroll/actions';
import { Users, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/stat-card';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { SoftAlert } from '@/components/soft-alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  posted: 'Posted',
};

const STATUS_BADGE_COLORS: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-800 border-amber-200',
  posted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

function formatMonth(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function formatPounds(pence: number): string {
  return '£' + (pence / 100).toFixed(2);
}

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { orgId, role } = await getActiveOrg();
  const params = await searchParams;
  const canEdit = role === 'admin' || role === 'treasurer';

  const [allRuns, liabilitiesRes] = await Promise.all([
    listPayrollRuns(orgId),
    getPayrollLiabilities(),
  ]);

  const liabilities = liabilitiesRes.data;

  const statusFilter = params.status;
  const filteredRuns =
    statusFilter && statusFilter !== 'all'
      ? allRuns.filter((r) => r.status === statusFilter)
      : allRuns;

  const totalCount = allRuns.length;
  const draftCount = allRuns.filter((r) => r.status === 'draft').length;
  const postedCount = allRuns.filter((r) => r.status === 'posted').length;

  return (
    <PageShell>
      {/* Header */}
      <PageHeader
        title="Payroll"
        subtitle="Create and post monthly payroll journal entries."
        actions={
          canEdit ? (
            <Button asChild>
              <Link href="/payroll/new">New Payroll Run</Link>
            </Button>
          ) : undefined
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title="Total Runs"
          value={totalCount}
          subtitle="All payroll runs"
          href="/payroll"
          tint="violet"
          icon={<Users size={20} />}
        />
        <StatCard
          title="Draft"
          value={draftCount}
          subtitle="Awaiting posting"
          href="/payroll?status=draft"
          tint="amber"
          icon={<FileText size={20} />}
        />
        <StatCard
          title="Posted"
          value={postedCount}
          subtitle="Completed"
          href="/payroll?status=posted"
          tint="emerald"
          icon={<CheckCircle size={20} />}
        />
      </div>

      {/* Liability Dashboard */}
      {liabilities && (liabilities.payeNicOwed > 0 || liabilities.pensionOwed > 0 || liabilities.netPayOwed > 0) && (
        <SoftAlert variant="warning" icon={<AlertCircle size={16} />}>
          <p className="font-medium">Outstanding Payroll Liabilities</p>
          <div className="grid grid-cols-3 gap-4 text-sm mt-2">
            <div>
              <span className="text-muted-foreground">PAYE/NIC Owed</span>
              <p className="font-medium">{formatPounds(liabilities.payeNicOwed)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Pension Owed</span>
              <p className="font-medium">{formatPounds(liabilities.pensionOwed)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Net Pay Owed</span>
              <p className="font-medium">{formatPounds(liabilities.netPayOwed)}</p>
            </div>
          </div>
        </SoftAlert>
      )}

      {/* Status filters */}
      <div className="flex gap-2 flex-wrap">
        <Button
          asChild
          variant={!statusFilter || statusFilter === 'all' ? 'default' : 'outline'}
          size="sm"
        >
          <Link href="/payroll">All</Link>
        </Button>
        {['draft', 'posted'].map((s) => (
          <Button
            key={s}
            asChild
            variant={statusFilter === s ? 'default' : 'outline'}
            size="sm"
          >
            <Link href={`/payroll?status=${s}`}>{STATUS_LABELS[s]}</Link>
          </Button>
        ))}
      </div>

      {/* Table */}
      {filteredRuns.length > 0 ? (
        <div className="rounded-2xl border border-slate-200/40 bg-white/70 shadow-sm overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">PAYE</TableHead>
                <TableHead className="text-right">NIC</TableHead>
                <TableHead className="text-right">Pension</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRuns.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link
                      href={`/payroll/${r.id}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {formatMonth(r.payrollMonth)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatPounds(r.totalGrossPence)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatPounds(r.totalNetPence)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatPounds(r.totalPayePence)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatPounds(r.totalNicPence)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatPounds(r.totalPensionPence)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs ${STATUS_BADGE_COLORS[r.status] ?? ''}`}
                    >
                      {STATUS_LABELS[r.status] ?? r.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200/40 bg-slate-100/55 p-8 text-center shadow-sm">
          <Users className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            No payroll runs found.{' '}
            {canEdit && 'Create one to generate payroll journal entries.'}
          </p>
          {canEdit && (
            <Button asChild className="mt-4" variant="outline">
              <Link href="/payroll/new">Create Payroll Run</Link>
            </Button>
          )}
        </div>
      )}
    </PageShell>
  );
}
