import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getActiveOrg } from '@/lib/org';
import { getBankStatementImportDetail } from '@/lib/banking/import-actions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatementImportDownloadButton } from './statement-import-download-button';
import { StatementImportRemovalWizard } from './statement-import-removal-wizard';

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default async function StatementImportDetailPage({
  params,
}: {
  params: Promise<{ bankAccountId: string; importId: string }>;
}) {
  const { bankAccountId, importId } = await params;
  const { role } = await getActiveOrg();
  const canOrchestrate = role === 'admin' || role === 'treasurer';

  const { data: detail, error } = await getBankStatementImportDetail({ bankAccountId, importId });
  if (error || !detail) notFound();

  const imp = detail.import;

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{imp.file_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Statement import · {detail.bank_account_name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/banking/${bankAccountId}?tab=statements`}>
              <ArrowLeft size={16} className="mr-1.5" />
              Statements
            </Link>
          </Button>
          <StatementImportDownloadButton importId={importId} />
        </div>
      </div>

      <div className="grid gap-6">
        <div className="grid gap-3 rounded-2xl border border-border/70 bg-card p-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Period</p>
            <p className="mt-1 text-sm font-medium">
              {formatDate(imp.statement_start_date)} – {formatDate(imp.statement_end_date)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Uploaded</p>
            <p className="mt-1 text-sm font-medium">{formatDate(imp.uploaded_at)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rows</p>
            <p className="mt-1 text-sm font-medium">
              {imp.rows_imported} imported · {imp.rows_detected} detected
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
            <p className="mt-1">
              <Badge variant="secondary">{imp.status.replaceAll('_', ' ')}</Badge>
            </p>
          </div>
        </div>

        <div className="grid gap-3 rounded-2xl border border-border/70 bg-card p-5 sm:grid-cols-2 lg:grid-cols-3">
          <Metric label="Total lines" value={detail.aggregates.total_lines} />
          <Metric label="Need undo to remove" value={detail.aggregates.lines_needing_undo} highlight />
          <Metric label="Unreconciled (safe delete)" value={detail.aggregates.unreconciled_rows} />
          <Metric label="Reconciled (flag)" value={detail.aggregates.reconciled_rows} />
          <Metric label="Posted / matched (flag)" value={detail.aggregates.posted_rows} />
          <Metric label="Excluded" value={detail.aggregates.excluded_rows} />
          <Metric label="Gift Aid–sensitive donations" value={detail.aggregates.gift_aid_locked_match_count} />
        </div>

        {canOrchestrate ? (
          <StatementImportRemovalWizard
            importId={importId}
            bankAccountId={bankAccountId}
            linesNeedingUndo={detail.aggregates.lines_needing_undo}
            giftAidLockedMatchCount={detail.aggregates.gift_aid_locked_match_count}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-5 text-sm text-muted-foreground">
            Only admins and treasurers can run the removal wizard for reconciled statements.
          </div>
        )}

        <div className="rounded-2xl border border-border/70 bg-card p-5">
          <h2 className="font-semibold">Correction history</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            High-level events for this import (per-line details remain in reconciliation corrections and the audit log).
          </p>
          {detail.correction_events.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No correction events recorded for this import yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.correction_events.map((ev) => (
                    <TableRow key={ev.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {new Date(ev.created_at).toLocaleString('en-GB')}
                      </TableCell>
                      <TableCell className="text-sm">{ev.event_type.replaceAll('_', ' ')}</TableCell>
                      <TableCell className="max-w-md text-sm text-muted-foreground">{ev.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={highlight ? 'rounded-xl bg-muted/40 p-3' : ''}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
