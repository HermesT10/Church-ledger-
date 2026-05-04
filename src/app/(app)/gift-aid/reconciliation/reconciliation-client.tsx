'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  confirmGiftAidClaimBatchPayment,
  suggestGiftAidBankReceiptMatchesForBatch,
  syncGiftAidBatchExpectedPaymentDefaults,
  markGiftAidClaimBatchPaymentReconciled,
} from '@/lib/giftaid/actions';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function formatPounds(pence: number): string {
  return '£' + (pence / 100).toFixed(2);
}

type Row = {
  id: string;
  batch_reference: string | null;
  hmrc_submission_reference: string | null;
  claim_total_pence: number;
  received_payment_total_pence: number;
  gift_aid_payment_status: string;
  claim_start: string;
  claim_end: string;
  status: string;
};

type Suggestion = {
  bank_line_id: string;
  txn_date: string;
  amount_pence: number;
  reference: string | null;
  description: string | null;
  score: number;
  hints: string[];
};

export function GiftAidReconciliationClient({
  initialRows,
  highlightedBatchId,
}: {
  initialRows: Row[];
  highlightedBatchId?: string | null;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (
      highlightedBatchId
      && initialRows.some((r) => r.id === highlightedBatchId)
    ) {
      return highlightedBatchId;
    }
    return null;
  });
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSug, setLoadingSug] = useState(false);
  const [pickLine, setPickLine] = useState<string>('');
  const [allocPence, setAllocPence] = useState<string>('');
  const [isPending, startTransition] = useTransition();

  const selected = initialRows.find((r) => r.id === selectedId);

  useEffect(() => {
    if (!selectedId) {
      setSuggestions([]);
      return;
    }
    const row = initialRows.find((r) => r.id === selectedId);
    setLoadingSug(true);
    void suggestGiftAidBankReceiptMatchesForBatch({ claimBatchId: selectedId, limit: 16 })
      .then(({ data, error }) => {
        if (error) {
          toast.error(error);
          setSuggestions([]);
        } else {
          setSuggestions(data);
          const top = data[0];
          if (top && row) {
            setPickLine(top.bank_line_id);
            const owed = Math.max(
              0,
              row.claim_total_pence - row.received_payment_total_pence,
            );
            const use = Math.min(owed || top.amount_pence, top.amount_pence);
            setAllocPence(String(use > 0 ? use : top.amount_pence));
          }
        }
      })
      .finally(() => setLoadingSug(false));
  }, [selectedId, initialRows]);

  const handleSyncDefaults = () => {
    if (!selectedId) return;
    startTransition(async () => {
      const { success, error } = await syncGiftAidBatchExpectedPaymentDefaults({
        claimBatchId: selectedId,
      });
      if (error || !success) toast.error(error ?? 'Could not sync');
      else {
        toast.success('Expected amounts updated');
        router.refresh();
      }
    });
  };

  const handleConfirm = () => {
    if (!selectedId || !pickLine) {
      toast.error('Select a claim batch and bank line.');
      return;
    }
    const p = parseInt(allocPence, 10);
    if (!Number.isFinite(p) || p <= 0) {
      toast.error('Enter a positive amount in pence.');
      return;
    }
    startTransition(async () => {
      const { success, error } = await confirmGiftAidClaimBatchPayment({
        claimBatchId: selectedId,
        bankLineId: pickLine,
        allocatedAmountPence: p,
      });
      if (error || !success) toast.error(error ?? 'Allocation failed');
      else {
        toast.success('Bank receipt confirmed and journal posted.');
        router.refresh();
      }
    });
  };

  const handleReconciled = () => {
    if (!selectedId) return;
    startTransition(async () => {
      const { success, error } = await markGiftAidClaimBatchPaymentReconciled({
        claimBatchId: selectedId,
      });
      if (error || !success) toast.error(error ?? 'Could not update');
      else {
        toast.success('Marked as reconciled.');
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">HMRC payment reconciliation</h1>
          <p className="text-sm text-muted-foreground">
            Match bank credits to Gift Aid claim batches and post the reclaim journal.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/gift-aid/claim-history">
            <ArrowLeft size={14} className="mr-1" />
            Claim history
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Awaiting bank receipt</CardTitle>
          <CardDescription>
            Exported or submitted batches that are not yet fully paid on the bank side.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {initialRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing to reconcile right now.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Claim total</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead>Payment status</TableHead>
                    <TableHead>Batch status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {initialRows.map((r) => {
                    const active = selectedId === r.id;
                    return (
                      <TableRow
                        key={r.id}
                        className={active ? 'bg-muted/60' : 'cursor-pointer'}
                        onClick={() => setSelectedId(r.id)}
                      >
                        <TableCell className="font-medium">
                          {r.batch_reference ?? r.id.slice(0, 8)}
                          {r.hmrc_submission_reference ? (
                            <span className="block text-xs text-muted-foreground">
                              HMRC ref: {r.hmrc_submission_reference}
                            </span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {r.claim_start} → {r.claim_end}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatPounds(r.claim_total_pence)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatPounds(r.received_payment_total_pence)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {r.gift_aid_payment_status.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="capitalize">{r.status}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Link2 size={18} aria-hidden />
                Allocate bank line
              </CardTitle>
              <CardDescription>
                Choose a ranked incoming bank line for batch{' '}
                <strong>{selected.batch_reference ?? selected.id.slice(0, 8)}</strong>
                . Allocation amount cannot exceed what remains on the line.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleSyncDefaults}>
                Sync expected defaults
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/gift-aid/${selected.id}`}>Open claim detail</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="outline" size="sm" onClick={handleReconciled}>
                <CheckCircle size={14} className="mr-1" />
                Mark reconciled (exception OK)
              </Button>
            </div>

            {loadingSug ? (
              <p className="text-sm text-muted-foreground">Loading suggestions…</p>
            ) : suggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No suitable incoming credits found. Import banking or loosen account filters on the batch.
              </p>
            ) : (
              <div className="rounded-md border overflow-x-auto max-h-[280px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Select</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Reference / description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suggestions.map((s) => (
                      <TableRow key={s.bank_line_id}>
                        <TableCell>
                          <button
                            type="button"
                            className={`text-xs underline ${pickLine === s.bank_line_id ? 'font-semibold' : ''}`}
                            onClick={() => {
                              setPickLine(s.bank_line_id);
                              const owed = Math.max(
                                0,
                                selected.claim_total_pence
                                  - selected.received_payment_total_pence,
                              );
                              const use = Math.min(owed || s.amount_pence, s.amount_pence);
                              setAllocPence(String(use > 0 ? use : s.amount_pence));
                            }}
                          >
                            Use this line
                          </button>
                        </TableCell>
                        <TableCell>{s.score}</TableCell>
                        <TableCell className="whitespace-nowrap">{s.txn_date}</TableCell>
                        <TableCell className="text-right font-medium">
                          {formatPounds(s.amount_pence)}
                        </TableCell>
                        <TableCell className="max-w-[340px] text-xs text-muted-foreground">
                          <span className="text-foreground">{(s.reference ?? '').slice(0, 40)}</span>
                          {' · '}
                          {(s.description ?? '').slice(0, 120)}
                          {s.hints?.length ? (
                            <span className="mt-0.5 block text-success">{s.hints.join(' · ')}</span>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 max-w-md">
              <div>
                <Label htmlFor="alloc_pence">Allocation (pence)</Label>
                <Input
                  id="alloc_pence"
                  inputMode="numeric"
                  value={allocPence}
                  onChange={(e) => setAllocPence(e.target.value)}
                  placeholder="e.g. 12500"
                />
              </div>
              <div className="flex items-end">
                <Button disabled={isPending || !pickLine} onClick={handleConfirm}>
                  {isPending ? 'Posting…' : 'Confirm allocation & journal'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
