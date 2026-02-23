import Link from 'next/link';
import { FileText, Pencil, CheckCircle, BookCheck, Plus } from 'lucide-react';
import { getActiveOrg } from '@/lib/org';
import { getJournalsWithTotals } from '@/lib/journals/actions';
import type { JournalStatus } from '@/lib/journals/types';
import { JOURNAL_STATUS_LABELS, JOURNAL_STATUSES } from '@/lib/journals/types';
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

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STATUS_BADGE_COLORS: Record<JournalStatus, string> = {
  draft: 'bg-amber-100 text-amber-800 border-amber-200',
  approved: 'bg-blue-100 text-blue-800 border-blue-200',
  posted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

const STATUS_ICONS: Record<JournalStatus, React.ReactNode> = {
  draft: <Pencil size={18} />,
  approved: <CheckCircle size={18} />,
  posted: <BookCheck size={18} />,
};

const STATUS_TINTS: Record<JournalStatus, string> = {
  draft: 'amber',
  approved: 'blue',
  posted: 'emerald',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function penceToPounds(pence: number): string {
  return '£' + (pence / 100).toFixed(2);
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default async function JournalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { role } = await getActiveOrg();
  const params = await searchParams;
  const canEdit = role === 'admin' || role === 'treasurer';

  const filterStatus = params.status && params.status !== 'all'
    ? params.status
    : undefined;

  const { data: journals, error } = await getJournalsWithTotals({
    status: filterStatus,
  });

  const draftCount = journals.filter((j) => j.status === 'draft').length;
  const approvedCount = journals.filter((j) => j.status === 'approved').length;
  const postedCount = journals.filter((j) => j.status === 'posted').length;

  return (
    <PageShell>
      {/* Header */}
      <PageHeader
        title="General Journal"
        subtitle="Double-entry journal entries for adjustments, accruals, and manual postings."
        actions={
          canEdit ? (
            <Button asChild>
              <Link href="/journals/new">
                <Plus size={16} className="mr-1.5" />
                New Journal
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Journals"
          value={journals.length}
          subtitle="All statuses"
          href="/journals"
          tint="violet"
          icon={<FileText size={20} />}
        />
        {JOURNAL_STATUSES.map((s) => {
          const count = s === 'draft' ? draftCount : s === 'approved' ? approvedCount : postedCount;
          const subtitle = s === 'draft' ? 'Awaiting review' : s === 'approved' ? 'Ready to post' : 'In the ledger';
          return (
            <StatCard
              key={s}
              title={JOURNAL_STATUS_LABELS[s]}
              value={count}
              subtitle={subtitle}
              href={`/journals?status=${s}`}
              tint={STATUS_TINTS[s]}
              icon={STATUS_ICONS[s]}
            />
          );
        })}
      </div>

      {/* Status filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-muted-foreground mr-1">Filter:</span>
        <Button
          asChild
          variant={!filterStatus ? 'default' : 'outline'}
          size="sm"
        >
          <Link href="/journals">All</Link>
        </Button>
        {JOURNAL_STATUSES.map((s) => (
          <Button
            key={s}
            asChild
            variant={filterStatus === s ? 'default' : 'outline'}
            size="sm"
          >
            <Link href={`/journals?status=${s}`}>{JOURNAL_STATUS_LABELS[s]}</Link>
          </Button>
        ))}
      </div>

      {error && (
        <SoftAlert variant="error">{error}</SoftAlert>
      )}

      {/* Table */}
      {journals.length > 0 ? (
        <div className="rounded-2xl border border-slate-200/40 bg-white/70 shadow-sm overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-center">Lines</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {journals.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="whitespace-nowrap">
                    <Link
                      href={`/journals/${j.id}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {formatDate(j.journal_date)}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {j.reference ?? '—'}
                  </TableCell>
                  <TableCell className="max-w-[250px] truncate">
                    {j.memo || '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {penceToPounds(j.total_debit_pence)}
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">
                    {j.line_count}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs ${STATUS_BADGE_COLORS[j.status as JournalStatus] ?? ''}`}
                    >
                      {JOURNAL_STATUS_LABELS[j.status as JournalStatus] ?? j.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {j.created_by_name || '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200/40 bg-slate-100/55 p-8 text-center shadow-sm">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            No journals found.{' '}
            {canEdit && (
              <Link href="/journals/new" className="text-primary hover:underline">
                Create one
              </Link>
            )}
          </p>
        </div>
      )}
    </PageShell>
  );
}
