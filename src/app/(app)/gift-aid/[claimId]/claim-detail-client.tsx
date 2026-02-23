'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  exportGiftAidClaimCsv,
  markClaimSubmitted,
  recordGiftAidPayment,
} from '@/lib/giftaid/actions';
import type { GiftAidClaimDetail, ClaimDonationRow } from '@/lib/giftaid/types';
import { toast } from 'sonner';
import {
  CheckCircle,
  Download,
  Send,
  ArrowLeft,
  Banknote,
  FileText,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
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

function formatPounds(pence: number): string {
  return '£' + (pence / 100).toFixed(2);
}

function statusBadge(status: string) {
  switch (status) {
    case 'paid':
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-200 text-base">Paid</Badge>;
    case 'submitted':
      return <Badge className="text-base">Submitted</Badge>;
    default:
      return <Badge variant="outline" className="text-base">Draft</Badge>;
  }
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  claim: GiftAidClaimDetail;
  donations: ClaimDonationRow[];
  canEdit: boolean;
  approvalHistory: { action: string; performed_by: string; notes: string | null; created_at: string }[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ClaimDetailClient({ claim, donations, canEdit, approvalHistory }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reference, setReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [showHistory, setShowHistory] = useState(false);

  const totalAmountPence = donations.reduce((s, d) => s + d.amount_pence, 0);
  const totalClaimablePence = donations.reduce((s, d) => s + d.claimable_pence, 0);

  /* ---- Export CSV ---- */
  const handleExport = () => {
    startTransition(async () => {
      const { data, error } = await exportGiftAidClaimCsv({ claimId: claim.id });
      if (error || !data) {
        toast.error(error ?? 'Failed to export CSV.');
        return;
      }

      const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `gift-aid-claim-${claim.id.slice(0, 8)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('CSV downloaded.');
    });
  };

  /* ---- Mark submitted ---- */
  const handleSubmit = () => {
    startTransition(async () => {
      const { success, error } = await markClaimSubmitted(claim.id, reference);
      if (error) {
        toast.error(error);
        return;
      }
      if (success) {
        toast.success('Claim marked as submitted to HMRC.');
        router.refresh();
      }
    });
  };

  /* ---- Record HMRC payment ---- */
  const handleRecordPayment = () => {
    if (!paymentDate) {
      toast.error('Please enter a payment date.');
      return;
    }

    startTransition(async () => {
      const { success, error } = await recordGiftAidPayment({
        claimId: claim.id,
        paymentDate,
      });
      if (error) {
        toast.error(error);
        return;
      }
      if (success) {
        toast.success('HMRC payment recorded and GL entry created.');
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Date Range</p>
            <p className="text-lg font-semibold">
              {formatDate(claim.claim_start)} – {formatDate(claim.claim_end)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Status</p>
            <div className="mt-1">
              {statusBadge(claim.status)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Donations</p>
            <p className="text-lg font-semibold">{donations.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Donation Total</p>
            <p className="text-lg font-semibold">
              {formatPounds(totalAmountPence)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Claimable (25%)</p>
            <p className="text-lg font-semibold text-green-600">
              {formatPounds(totalClaimablePence)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Status-specific banners */}
      {claim.status === 'submitted' && (
        <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800 flex items-center gap-2">
          <Send size={16} className="text-blue-600 shrink-0" />
          <span>
            Submitted to HMRC on {claim.submitted_at ? formatDate(claim.submitted_at) : 'N/A'}.
            {claim.reference && (
              <> Reference: <strong>{claim.reference}</strong></>
            )}
          </span>
        </div>
      )}

      {claim.status === 'paid' && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
          <CheckCircle size={16} className="text-green-600 shrink-0" />
          <span>
            HMRC payment received{claim.paid_at ? ` on ${formatDate(claim.paid_at)}` : ''}.
            {claim.journal_id && (
              <>
                {' '}
                <Link
                  href={`/journal/${claim.journal_id}`}
                  className="underline font-medium"
                >
                  View Journal Entry
                </Link>
              </>
            )}
          </span>
        </div>
      )}

      {/* Donations table */}
      <Card>
        <CardHeader>
          <CardTitle>Included Donations</CardTitle>
          <CardDescription>
            {donations.length} donation(s) totalling{' '}
            {formatPounds(totalAmountPence)} ({formatPounds(totalClaimablePence)}{' '}
            claimable at 25%).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {donations.length > 0 ? (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Donor</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Postcode</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Claimable</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {donations.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.donor_name}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {d.address || '—'}
                      </TableCell>
                      <TableCell>{d.postcode || '—'}</TableCell>
                      <TableCell>{formatDate(d.donation_date)}</TableCell>
                      <TableCell className="text-right">
                        {formatPounds(d.amount_pence)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {formatPounds(d.claimable_pence)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">
              No donations linked to this claim.
            </p>
          )}

          {/* Grand total */}
          {donations.length > 0 && (
            <div className="flex items-center justify-between border-t pt-4 mt-4">
              <span className="text-sm font-semibold">Grand Total</span>
              <div className="text-right">
                <span className="text-sm text-muted-foreground mr-4">
                  {formatPounds(totalAmountPence)}
                </span>
                <span className="text-lg font-bold text-green-600">
                  {formatPounds(totalClaimablePence)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Export CSV */}
          <Button onClick={handleExport} disabled={isPending}>
            <Download size={14} className="mr-1" />
            {isPending ? 'Exporting…' : 'Export CSV for HMRC'}
          </Button>

          {/* View Journal (if paid) */}
          {claim.journal_id && (
            <Button asChild variant="outline">
              <Link href={`/journal/${claim.journal_id}`}>
                <FileText size={14} className="mr-1" />
                View Journal Entry
              </Link>
            </Button>
          )}

          {/* Mark as submitted (draft -> submitted) */}
          {claim.status === 'draft' && canEdit && (
            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-medium">Mark as Submitted</p>
              <p className="text-sm text-muted-foreground">
                After submitting to HMRC, record the reference here.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 max-w-lg">
                <div className="flex-1">
                  <Label htmlFor="hmrc_ref" className="sr-only">
                    HMRC Reference
                  </Label>
                  <Input
                    id="hmrc_ref"
                    placeholder="HMRC reference (optional)"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={handleSubmit}
                  disabled={isPending}
                >
                  <Send size={14} className="mr-1" />
                  {isPending ? 'Saving…' : 'Mark Submitted'}
                </Button>
              </div>
            </div>
          )}

          {/* Record HMRC Payment (submitted -> paid) */}
          {claim.status === 'submitted' && canEdit && (
            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-medium">Record HMRC Payment</p>
              <p className="text-sm text-muted-foreground">
                When HMRC pays the Gift Aid reclaim, record it here. This will
                create a GL journal entry (Debit Bank, Credit Gift Aid Income).
              </p>
              <div className="flex flex-col sm:flex-row gap-3 max-w-lg">
                <div className="flex-1">
                  <Label htmlFor="payment_date">Payment Date</Label>
                  <Input
                    id="payment_date"
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={handleRecordPayment}
                    disabled={isPending || !paymentDate}
                  >
                    <Banknote size={14} className="mr-1" />
                    {isPending ? 'Recording…' : 'Record Payment'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approval History */}
      {approvalHistory.length > 0 && (
        <Card>
          <CardHeader>
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center justify-between w-full text-left"
            >
              <div>
                <CardTitle className="text-base">Audit Trail</CardTitle>
                <CardDescription className="mt-1">
                  {approvalHistory.length} event(s) recorded for this claim.
                </CardDescription>
              </div>
              {showHistory ? (
                <ChevronUp size={18} className="text-muted-foreground" />
              ) : (
                <ChevronDown size={18} className="text-muted-foreground" />
              )}
            </button>
          </CardHeader>
          {showHistory && (
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Action</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {approvalHistory.map((evt, idx) => (
                      <TableRow key={idx}>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {evt.action}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(evt.created_at)}</TableCell>
                        <TableCell className="text-muted-foreground text-xs max-w-[300px] truncate">
                          {evt.notes || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Back link */}
      <Button asChild variant="outline">
        <Link href="/gift-aid">
          <ArrowLeft size={14} className="mr-1" />
          Back to Gift Aid
        </Link>
      </Button>
    </div>
  );
}
