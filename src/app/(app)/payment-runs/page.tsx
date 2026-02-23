import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import { listPaymentRuns } from '@/lib/bills/actions';
import { Banknote, FileText, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/stat-card';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatPounds(pence: number): string {
  return '£' + (pence / 100).toFixed(2);
}

export default async function PaymentRunsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { orgId, role } = await getActiveOrg();
  const params = await searchParams;

  const { data: runs } = await listPaymentRuns(orgId, params.status);
  const allRuns = runs ?? [];

  const canEdit = role === 'admin' || role === 'treasurer';

  const { data: allRunsForStats } = await listPaymentRuns(orgId);
  const statsRuns = allRunsForStats ?? [];
  const totalCount = statsRuns.length;
  const draftCount = statsRuns.filter((r) => r.status === 'draft').length;
  const postedCount = statsRuns.filter((r) => r.status === 'posted').length;

  return (
    <PageShell>
      {/* Header */}
      <PageHeader
        title="Payment Runs"
        subtitle="Batch-pay posted invoices and create payment journals."
        actions={
          canEdit ? (
            <Button asChild>
              <Link href="/payment-runs/new">New Payment Run</Link>
            </Button>
          ) : undefined
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title="Total Runs"
          value={totalCount}
          subtitle="All statuses"
          href="/payment-runs"
          tint="violet"
          icon={<Banknote size={20} />}
        />
        <StatCard
          title="Draft"
          value={draftCount}
          subtitle="Awaiting posting"
          href="/payment-runs?status=draft"
          tint="amber"
          icon={<FileText size={20} />}
        />
        <StatCard
          title="Posted"
          value={postedCount}
          subtitle="Completed"
          href="/payment-runs?status=posted"
          tint="emerald"
          icon={<CheckCircle size={20} />}
        />
      </div>

      {/* Status filters */}
      <div className="flex gap-2 flex-wrap">
        <Button
          asChild
          variant={!params.status || params.status === 'all' ? 'default' : 'outline'}
          size="sm"
        >
          <Link href="/payment-runs">All</Link>
        </Button>
        {['draft', 'posted'].map((s) => (
          <Button
            key={s}
            asChild
            variant={params.status === s ? 'default' : 'outline'}
            size="sm"
          >
            <Link href={`/payment-runs?status=${s}`}>{STATUS_LABELS[s]}</Link>
          </Button>
        ))}
      </div>

      {/* Table */}
      {allRuns.length > 0 ? (
        <div className="rounded-2xl border border-slate-200/40 bg-white/70 shadow-sm overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Run ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Bank Account</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Invoices</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allRuns.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link
                      href={`/payment-runs/${r.id}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {r.id.slice(0, 8)}
                    </Link>
                  </TableCell>
                  <TableCell>{formatDate(r.run_date)}</TableCell>
                  <TableCell>{r.bank_account_name ?? '—'}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs ${STATUS_BADGE_COLORS[r.status] ?? ''}`}
                    >
                      {STATUS_LABELS[r.status] ?? r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">{r.item_count}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatPounds(Number(r.total_pence))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200/40 bg-slate-100/55 p-8 text-center shadow-sm">
          <Banknote className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            No payment runs found. {canEdit && 'Create one to batch-pay posted invoices.'}
          </p>
        </div>
      )}
    </PageShell>
  );
}
