import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { Receipt, Pencil, CheckCircle, BookCheck, Wallet, AlertTriangle } from 'lucide-react';
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
  approved: 'Approved',
  posted: 'Posted',
  paid: 'Paid',
};

const STATUS_BADGE_COLORS: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-blue-100 text-blue-800 border-blue-200',
  posted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  paid: 'bg-teal-100 text-teal-800 border-teal-200',
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

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { orgId, role } = await getActiveOrg();
  const supabase = await createClient();
  const params = await searchParams;

  let query = supabase
    .from('bills')
    .select('*, suppliers(name)')
    .eq('organisation_id', orgId)
    .order('bill_date', { ascending: false });

  if (params.status && params.status !== 'all') {
    query = query.eq('status', params.status);
  }

  const { data: bills } = await query;
  const allBills = bills ?? [];

  const canEdit = role === 'admin' || role === 'treasurer';

  const totalCount = allBills.length;
  const draftCount = allBills.filter((b) => b.status === 'draft').length;
  const approvedCount = allBills.filter((b) => b.status === 'approved').length;
  const postedCount = allBills.filter((b) => b.status === 'posted').length;
  const paidCount = allBills.filter((b) => b.status === 'paid').length;

  const today = new Date().toISOString().slice(0, 10);
  const overdueCount = allBills.filter(
    (b) => b.due_date && b.due_date < today && b.status !== 'paid'
  ).length;

  return (
    <PageShell>
      {/* Header */}
      <PageHeader
        title="Invoices"
        subtitle="Track supplier invoices from draft to payment."
        actions={
          canEdit ? (
            <Button asChild>
              <Link href="/bills/new">New Invoice</Link>
            </Button>
          ) : undefined
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard
          title="Total Invoices"
          value={totalCount}
          subtitle="All statuses"
          href="/bills"
          tint="violet"
          icon={<Receipt size={20} />}
        />
        <StatCard
          title="Draft"
          value={draftCount}
          subtitle="Awaiting approval"
          href="/bills?status=draft"
          tint="amber"
          icon={<Pencil size={20} />}
        />
        <StatCard
          title="Approved"
          value={approvedCount}
          subtitle="Ready to post"
          href="/bills?status=approved"
          tint="blue"
          icon={<CheckCircle size={20} />}
        />
        <StatCard
          title="Posted"
          value={postedCount}
          subtitle="In the ledger"
          href="/bills?status=posted"
          tint="emerald"
          icon={<BookCheck size={20} />}
        />
        <StatCard
          title="Paid"
          value={paidCount}
          subtitle="Settled"
          href="/bills?status=paid"
          tint="teal"
          icon={<Wallet size={20} />}
        />
        {overdueCount > 0 && (
          <StatCard
            title="Overdue"
            value={overdueCount}
            subtitle="Past due date"
            href="/bills"
            tint="red"
            icon={<AlertTriangle size={20} />}
          />
        )}
      </div>

      {/* Status filters */}
      <div className="flex gap-2 flex-wrap">
        <Button
          asChild
          variant={!params.status || params.status === 'all' ? 'default' : 'outline'}
          size="sm"
        >
          <Link href="/bills">All</Link>
        </Button>
        {['draft', 'approved', 'posted', 'paid'].map((s) => (
          <Button
            key={s}
            asChild
            variant={params.status === s ? 'default' : 'outline'}
            size="sm"
          >
            <Link href={`/bills?status=${s}`}>{STATUS_LABELS[s]}</Link>
          </Button>
        ))}
      </div>

      {/* Table */}
      {allBills.length > 0 ? (
        <div className="rounded-2xl border border-slate-200/40 bg-white/70 shadow-sm overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allBills.map((b) => {
                const supplierName =
                  (b.suppliers as { name: string } | null)?.name ?? '—';
                const isOverdue = b.due_date && b.due_date < today && b.status !== 'paid';
                return (
                  <TableRow key={b.id} className={isOverdue ? 'bg-red-100/55' : ''}>
                    <TableCell>
                      <Link
                        href={`/bills/${b.id}`}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {b.bill_number || b.id.slice(0, 8)}
                      </Link>
                    </TableCell>
                    <TableCell>{supplierName}</TableCell>
                    <TableCell>{formatDate(b.bill_date)}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1">
                        {b.due_date ? formatDate(b.due_date) : '—'}
                        {isOverdue && (
                          <Badge variant="destructive" className="text-[10px] px-1 py-0">
                            Overdue
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs ${STATUS_BADGE_COLORS[b.status] ?? ''}`}
                      >
                        {STATUS_LABELS[b.status] ?? b.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatPounds(Number(b.total_pence))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200/40 bg-slate-100/55 p-8 text-center shadow-sm">
          <Receipt className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            No invoices found. {canEdit && 'Create one to get started.'}
          </p>
        </div>
      )}
    </PageShell>
  );
}
