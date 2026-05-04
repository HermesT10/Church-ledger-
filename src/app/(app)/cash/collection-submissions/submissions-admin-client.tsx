'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { CashCollectionSubmissionRow } from '@/lib/cash/types';
import {
  convertSubmissionToCashCollection,
  linkSubmissionToBankTransaction,
  listPortalCashCollectionSubmissions,
  rejectCashCollectionSubmission,
  reviewCashCollectionSubmission,
} from '@/lib/portal/cash-collection-submissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function formatAmount(pence: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-GB');
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (['reviewed', 'banked', 'reconciled'].includes(status)) return 'default';
  if (status === 'rejected') return 'destructive';
  if (status === 'submitted') return 'outline';
  return 'secondary';
}

export function CashCollectionSubmissionsAdminClient({
  submissions,
  canReview,
}: {
  submissions: CashCollectionSubmissionRow[];
  canReview: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(submissions);
  const [selected, setSelected] = useState<CashCollectionSubmissionRow | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [bankTransactionId, setBankTransactionId] = useState('');
  const [isPending, startTransition] = useTransition();

  async function refresh() {
    const res = await listPortalCashCollectionSubmissions({ admin: true });
    if (!res.error) setRows(res.data);
  }

  function runAction(action: () => Promise<{ error: string | null }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      router.refresh();
      await refresh();
    });
  }

  function handleConvert(id: string) {
    startTransition(async () => {
      const result = await convertSubmissionToCashCollection(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Converted to cash collection batch.');
      router.refresh();
      await refresh();
    });
  }

  if (!canReview) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cash Collection Submissions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">You do not have permission to review cash collection submissions.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-border/70 shadow-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Cash Collection Submissions</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Review portal count sheets before converting them to cash collection batches.</p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/cash/collections">Cash collections</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">No portal cash collection submissions.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead>Submitted by</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Fund</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{formatDate(row.collectionDate)}</TableCell>
                    <TableCell className="font-medium">{row.detail}</TableCell>
                    <TableCell>{row.submitterName ?? row.signedBy}</TableCell>
                    <TableCell>{formatAmount(row.amountPence)}</TableCell>
                    <TableCell>{row.fundName ?? '-'}</TableCell>
                    <TableCell><Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => {
                        setSelected(row);
                        setAdminNotes(row.adminNotes ?? '');
                        setBankTransactionId(row.linkedBankTransactionId ?? '');
                      }}>
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet open={Boolean(selected)} onOpenChange={(next) => !next && setSelected(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-xl">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.detail}</SheetTitle>
                <SheetDescription>{formatAmount(selected.amountPence)} collected on {formatDate(selected.collectionDate)}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={statusVariant(selected.status)}>{statusLabel(selected.status)}</Badge>
                </div>
                <DetailRow label="Signed by" value={selected.signedBy} />
                <DetailRow label="Counted by" value={selected.countedBy ?? '-'} />
                <DetailRow label="Second counter" value={selected.secondCounter ?? '-'} />
                <DetailRow label="Fund" value={selected.fundName ?? '-'} />
                <DetailRow label="Income stream" value={selected.incomeStreamName ?? '-'} />
                {selected.attachmentUrl ? (
                  <Button variant="outline" asChild>
                    <Link href={selected.attachmentUrl} target="_blank">View attachment</Link>
                  </Button>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="admin-notes">Admin notes</Label>
                  <Textarea id="admin-notes" value={adminNotes} onChange={(event) => setAdminNotes(event.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Button
                    disabled={isPending || selected.status !== 'submitted'}
                    onClick={() => runAction(() => reviewCashCollectionSubmission(selected.id, adminNotes), 'Submission reviewed.')}
                  >
                    Mark reviewed
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={isPending || !['submitted', 'reviewed'].includes(selected.status)}
                    onClick={() => runAction(() => rejectCashCollectionSubmission(selected.id, adminNotes), 'Submission rejected.')}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="outline"
                    disabled={isPending || Boolean(selected.linkedCashBatchId) || !['submitted', 'reviewed'].includes(selected.status)}
                    onClick={() => handleConvert(selected.id)}
                  >
                    Convert to cash collection batch
                  </Button>
                  {selected.linkedCashBatchId ? (
                    <Button variant="outline" asChild>
                      <Link href={`/cash/collections/${selected.linkedCashBatchId}`}>View cash batch</Link>
                    </Button>
                  ) : null}
                </div>
                <div className="space-y-2 rounded-2xl border border-border/70 p-3">
                  <Label htmlFor="bank-transaction-id">Bank transaction ID</Label>
                  <Input id="bank-transaction-id" value={bankTransactionId} onChange={(event) => setBankTransactionId(event.target.value)} placeholder="Paste bank line ID" />
                  <Button
                    size="sm"
                    disabled={isPending || !bankTransactionId.trim()}
                    onClick={() => runAction(() => linkSubmissionToBankTransaction(selected.id, bankTransactionId.trim()), 'Bank transaction linked.')}
                  >
                    Link bank transaction
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/70 pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
