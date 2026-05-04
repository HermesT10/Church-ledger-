'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type {
  CashCollectionSubmissionRow,
  CashCollectionSubmissionType,
  PortalCashCollectionFormOptions,
} from '@/lib/cash/types';
import {
  listPortalCashCollectionSubmissions,
  savePortalCashCollectionDraft,
  submitPortalCashCollection,
  uploadPortalCashCollectionAttachment,
} from '@/lib/portal/cash-collection-submissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

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

export function PortalCashCollectionsClient({
  initialSubmissions,
  options,
  canSubmit,
}: {
  initialSubmissions: CashCollectionSubmissionRow[];
  options: PortalCashCollectionFormOptions;
  canSubmit: boolean;
}) {
  const router = useRouter();
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<CashCollectionSubmissionRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);

  const defaultFundId = options.funds[0]?.id ?? '';
  const defaultIncomeStreamId = options.incomeStreams[0]?.id ?? '';
  const selectedDetail = useMemo(() => selected, [selected]);

  async function refresh() {
    const res = await listPortalCashCollectionSubmissions();
    if (!res.error) setSubmissions(res.data);
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const amountPence = Math.round(parseFloat(String(formData.get('amount') ?? '0')) * 100);
    const file = formData.get('attachment') as File | null;

    const draft = await savePortalCashCollectionDraft({
      collectionDate: String(formData.get('collection_date') ?? ''),
      amountPence,
      detail: String(formData.get('detail') ?? '').trim(),
      collectionType: (String(formData.get('collection_type') ?? '') || null) as CashCollectionSubmissionType | null,
      fundId: String(formData.get('fund_id') ?? '') || null,
      incomeStreamId: String(formData.get('income_stream_id') ?? '') || null,
      countedBy: String(formData.get('counted_by') ?? '').trim() || null,
      secondCounter: String(formData.get('second_counter') ?? '').trim() || null,
      notes: String(formData.get('notes') ?? '').trim() || null,
    });

    if (draft.error || !draft.data) {
      toast.error(draft.error ?? 'Could not save the count sheet.');
      setSubmitting(false);
      return;
    }

    if (file && file.size > 0) {
      const uploadData = new FormData();
      uploadData.append('file', file);
      const upload = await uploadPortalCashCollectionAttachment(uploadData, draft.data.id);
      if (upload.error) {
        toast.error(upload.error);
        setSubmitting(false);
        return;
      }
    }

    const submit = await submitPortalCashCollection(draft.data.id);
    if (submit.error) {
      toast.error(submit.error);
      setSubmitting(false);
      return;
    }

    toast.success('Cash collection submitted.');
    form.reset();
    setOpen(false);
    setSubmitting(false);
    router.refresh();
    await refresh();
  }

  function handleSubmitDraft(id: string) {
    startTransition(async () => {
      const result = await submitPortalCashCollection(id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Cash collection submitted.');
      router.refresh();
      await refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-border/70 bg-card shadow-card">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>My Cash Collection Submissions</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Submit church cash count sheets for finance review, banking, and reconciliation.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            {canSubmit ? (
              <DialogTrigger asChild>
                <Button>Add collection</Button>
              </DialogTrigger>
            ) : null}
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Digital cash count sheet</DialogTitle>
                <DialogDescription>
                  Complete the count sheet and sign it with your portal profile name.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="collection_date">Date *</Label>
                    <Input id="collection_date" name="collection_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount *</Label>
                    <Input id="amount" name="amount" type="number" min="0.01" step="0.01" required placeholder="0.00" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="collection_type">Type</Label>
                    <select id="collection_type" name="collection_type" className={SELECT_CLASS} defaultValue="service">
                      <option value="service">Service</option>
                      <option value="event">Event</option>
                      <option value="cafe">Cafe</option>
                      <option value="offering">Offering</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="detail">Detail *</Label>
                  <Input id="detail" name="detail" required placeholder="e.g. Sunday morning offering" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="fund_id">Fund</Label>
                    <select id="fund_id" name="fund_id" className={SELECT_CLASS} defaultValue={defaultFundId}>
                      <option value="">No fund selected</option>
                      {options.funds.map((fund) => (
                        <option key={fund.id} value={fund.id}>{fund.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="income_stream_id">Income stream</Label>
                    <select id="income_stream_id" name="income_stream_id" className={SELECT_CLASS} defaultValue={defaultIncomeStreamId}>
                      <option value="">No income stream selected</option>
                      {options.incomeStreams.map((stream) => (
                        <option key={stream.id} value={stream.id}>{stream.code} - {stream.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                  <p className="text-sm font-medium">Count verification</p>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="counted_by">Counted by</Label>
                      <Input id="counted_by" name="counted_by" placeholder="Counter name" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="second_counter">Second counter</Label>
                      <Input id="second_counter" name="second_counter" placeholder="Optional second counter" />
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <Label>Signed by</Label>
                    <Input value={options.signedBy} readOnly />
                    <p className="text-xs text-muted-foreground">This signature is taken from your user profile and saved by the server.</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea id="notes" name="notes" placeholder="Optional notes for finance" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="attachment">Attachment</Label>
                  <Input id="attachment" name="attachment" type="file" accept=".pdf,.jpg,.jpeg,.png" />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit count sheet'}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {submissions.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
              No cash collection submissions yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((submission) => (
                  <TableRow key={submission.id}>
                    <TableCell>{formatDate(submission.collectionDate)}</TableCell>
                    <TableCell className="font-medium">{submission.detail}</TableCell>
                    <TableCell>{formatAmount(submission.amountPence)}</TableCell>
                    <TableCell>{submission.collectionType ? statusLabel(submission.collectionType) : '-'}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(submission.status)}>{statusLabel(submission.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setSelected(submission)}>Details</Button>
                        {submission.status === 'draft' ? (
                          <Button size="sm" onClick={() => handleSubmitDraft(submission.id)} disabled={isPending}>Submit</Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet open={Boolean(selectedDetail)} onOpenChange={(next) => !next && setSelected(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          {selectedDetail ? (
            <>
              <SheetHeader>
                <SheetTitle>{selectedDetail.detail}</SheetTitle>
                <SheetDescription>{formatAmount(selectedDetail.amountPence)} collected on {formatDate(selectedDetail.collectionDate)}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={statusVariant(selectedDetail.status)}>{statusLabel(selectedDetail.status)}</Badge>
                </div>
                <DetailRow label="Signed by" value={selectedDetail.signedBy} />
                <DetailRow label="Counted by" value={selectedDetail.countedBy ?? '-'} />
                <DetailRow label="Second counter" value={selectedDetail.secondCounter ?? '-'} />
                <DetailRow label="Fund" value={selectedDetail.fundName ?? '-'} />
                <DetailRow label="Income stream" value={selectedDetail.incomeStreamName ?? '-'} />
                <DetailRow label="Admin notes" value={selectedDetail.adminNotes ?? '-'} />
                {selectedDetail.notes ? <DetailBlock label="Notes" value={selectedDetail.notes} /> : null}
                {selectedDetail.attachmentUrl ? (
                  <Button variant="outline" asChild>
                    <Link href={selectedDetail.attachmentUrl} target="_blank">View attachment</Link>
                  </Button>
                ) : null}
                {selectedDetail.linkedCashBatchId ? <Badge variant="outline">Linked to cash batch</Badge> : null}
                {selectedDetail.linkedBankTransactionId ? <Badge variant="outline">Linked to bank transaction</Badge> : null}
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

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 rounded-2xl bg-muted/30 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p>{value}</p>
    </div>
  );
}
