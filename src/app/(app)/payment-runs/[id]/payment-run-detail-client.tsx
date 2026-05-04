'use client';

import { useState, useMemo, useTransition, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  approvePaymentRun,
  postPaymentRun,
  deletePaymentRun,
  exportPaymentRunCsv,
  updatePaymentRunAttachment,
} from '@/lib/bills/actions';
import { uploadFinancialEvidence } from '@/lib/evidence/actions';
import { toast } from 'sonner';
import {
  CheckCircle,
  Trash2,
  ExternalLink,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SectionCard } from '@/components/section-card';
import { SummaryMetricCard } from '@/components/finance';
import { StatusBadge } from '@/components/ui/status-badge';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PaymentRun {
  id: string;
  run_date: string;
  status: string;
  total_pence: number;
  journal_id: string | null;
  attachment_url: string | null;
}

interface PaymentRunItem {
  id: string;
  bill_id: string;
  amount_pence: number;
  bill_number: string | null;
  bill_date: string;
  bill_status: string;
  supplier_name: string;
}

interface BankAccount {
  id: string;
  name: string;
}

interface Props {
  run: PaymentRun;
  items: PaymentRunItem[];
  bankAccounts: BankAccount[];
  canEdit: boolean;
}

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

/** Group items by supplier name */
function groupBySupplier(items: PaymentRunItem[]) {
  const groups: Record<string, PaymentRunItem[]> = {};
  for (const item of items) {
    const key = item.supplier_name;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PaymentRunDetailClient({ run, items, bankAccounts, canEdit }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [bankAccountId, setBankAccountId] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState(run.attachment_url);
  const [uploadingFile, setUploadingFile] = useState(false);

  const isDraft = run.status === 'draft';
  const isApproved = run.status === 'approved';
  const isPosted = run.status === 'posted';

  const grouped = useMemo(() => groupBySupplier(items), [items]);

  const handleApprove = () => {
    startTransition(async () => {
      const { success, error } = await approvePaymentRun(run.id);
      if (error) {
        toast.error(error);
        return;
      }
      if (success) {
        toast.success('Payment run approved and ready to post.');
        router.refresh();
      }
    });
  };

  const handlePost = () => {
    if (!bankAccountId) {
      toast.error('Please select a bank account.');
      return;
    }

    startTransition(async () => {
      const { success, error } = await postPaymentRun(run.id, bankAccountId);
      if (error) {
        toast.error(error);
        return;
      }
      if (success) {
        toast.success('Payment run posted. Invoices marked as paid.');
        router.refresh();
      }
    });
  };

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', 'payment-runs');

    const uploadRes = await uploadFinancialEvidence(formData);
    setUploadingFile(false);

    if (uploadRes.error || !uploadRes.url) {
      toast.error(uploadRes.error ?? 'Upload failed.');
      return;
    }

    const saveRes = await updatePaymentRunAttachment(run.id, uploadRes.url);
    if (saveRes.error) {
      toast.error(saveRes.error);
      return;
    }

    setAttachmentUrl(uploadRes.url);
    toast.success('Evidence attached.');
    router.refresh();
  };

  const handleExportCsv = async () => {
    const res = await exportPaymentRunCsv(run.id);
    if (res.error || !res.data) {
      toast.error(res.error ?? 'Export failed.');
      return;
    }
    const blob = new Blob([res.data], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payment-run-${run.id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Payment run CSV exported.');
  };

  const handleDelete = () => {
    startTransition(async () => {
      const { success, error } = await deletePaymentRun(run.id);
      if (error) {
        toast.error(error);
        return;
      }
      if (success) {
        toast.success('Payment run deleted.');
        router.push('/payment-runs');
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Summary card */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryMetricCard label="Run Date" value={formatDate(run.run_date)} />
        <SummaryMetricCard
          label="Status"
          value={<StatusBadge status={run.status} label={isPosted ? 'Posted' : isApproved ? 'Approved' : 'Draft'} />}
        />
        <SummaryMetricCard label="Invoices" value={String(items.length)} />
        <SummaryMetricCard label="Total" value={formatPounds(run.total_pence)} />
      </div>

      {/* Posted: link to journal + export */}
      {isPosted && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-surface-muted px-4 py-3 text-sm text-muted-foreground shadow-card">
          <CheckCircle size={16} className="text-green-600 shrink-0" />
          <span>This payment run has been posted.</span>
          {run.journal_id && (
            <>
              <Link
                href={`/journals/${run.journal_id}`}
                className="underline hover:no-underline font-medium ml-1"
              >
                View journal <ExternalLink size={12} className="inline ml-0.5" />
              </Link>
              <span className="mx-1">|</span>
            </>
          )}
          <Link
            href="/banking"
            className="underline hover:no-underline font-medium"
          >
            Bank reconciliation <ExternalLink size={12} className="inline ml-0.5" />
          </Link>
          <span className="mx-1">|</span>
          <button
            onClick={handleExportCsv}
            className="underline hover:no-underline font-medium"
          >
            <Download size={12} className="inline mr-0.5" />
            Export CSV
          </button>
        </div>
      )}

      {/* Bills grouped by supplier */}
      <SectionCard
        title="Invoices in this Payment Run"
        description={`${grouped.length} supplier${grouped.length !== 1 ? 's' : ''}, ${items.length} invoice${items.length !== 1 ? 's' : ''}`}
        contentClassName="space-y-6"
      >
          {grouped.map(([supplierName, supplierItems]) => {
            const subtotal = supplierItems.reduce(
              (s, i) => s + i.amount_pence,
              0
            );
            return (
              <div key={supplierName}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">{supplierName}</h3>
                  <span className="text-sm font-medium text-muted-foreground">
                    {formatPounds(subtotal)}
                  </span>
                </div>
                <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {supplierItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Link
                              href={`/bills/${item.bill_id}`}
                              className="font-medium underline hover:no-underline"
                            >
                              {item.bill_number || item.bill_id.slice(0, 8)}
                            </Link>
                          </TableCell>
                          <TableCell>
                            {item.bill_date ? formatDate(item.bill_date) : '—'}
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              status={item.bill_status === 'paid' ? 'paid' : item.bill_status}
                            />
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatPounds(item.amount_pence)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })}

          {/* Grand total */}
          <div className="flex items-center justify-between border-t pt-4">
            <span className="text-sm font-semibold">Grand Total</span>
            <span className="text-lg font-bold">
              {formatPounds(run.total_pence)}
            </span>
          </div>
      </SectionCard>

      {/* Draft actions */}
      {isDraft && canEdit && (
        <SectionCard
          title="Post Payment Run"
          description={
            isDraft
              ? 'Attach payment evidence if available, then approve this run for posting.'
              : 'Select the bank account to pay from, then post to create the journal and mark invoices as paid.'
          }
          contentClassName="space-y-4"
        >
            <div className="flex flex-col gap-2 max-w-md">
              <Label htmlFor="payment_run_evidence">Evidence / payment file</Label>
              <Input
                id="payment_run_evidence"
                type="file"
                onChange={handleFileUpload}
                disabled={uploadingFile || isPending}
              />
              {attachmentUrl && (
                <Link
                  href={attachmentUrl}
                  target="_blank"
                  className="text-sm text-blue-600 underline hover:no-underline"
                >
                  View attached evidence
                </Link>
              )}
            </div>

            <div className="flex flex-col gap-2 max-w-sm">
              <Label htmlFor="bank_account">Bank Account *</Label>
              <select
                id="bank_account"
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                disabled={isDraft}
                className="flex h-10 w-full rounded-xl border border-input bg-card px-3.5 py-2 text-sm shadow-xs outline-none focus-visible:border-primary/30 focus-visible:ring-[3px]"
              >
                <option value="">Select bank account…</option>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 flex-wrap">
              {isDraft ? (
                <Button onClick={handleApprove} disabled={isPending}>
                  {isPending ? 'Approving…' : 'Approve Payment Run'}
                </Button>
              ) : (
                <Button onClick={handlePost} disabled={isPending || !bankAccountId}>
                  {isPending ? 'Posting…' : 'Post Payment Run'}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleDelete}
                disabled={isPending}
              >
                <Trash2 size={14} className="mr-1" />
                Delete Draft
              </Button>
            </div>
        </SectionCard>
      )}

      {isApproved && canEdit && (
        <SectionCard
          title="Post Approved Payment Run"
          description="Choose the bank account used for settlement, then post the run."
          contentClassName="space-y-4"
        >
            <div className="flex flex-col gap-2 max-w-sm">
              <Label htmlFor="bank_account">Bank Account *</Label>
              <select
                id="bank_account"
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className="flex h-10 w-full rounded-xl border border-input bg-card px-3.5 py-2 text-sm shadow-xs outline-none focus-visible:border-primary/30 focus-visible:ring-[3px]"
              >
                <option value="">Select bank account…</option>
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <Button onClick={handlePost} disabled={isPending || !bankAccountId}>
              {isPending ? 'Posting…' : 'Post Payment Run'}
            </Button>
        </SectionCard>
      )}

      {/* Read-only: back button */}
      {(!isDraft && !isApproved) || !canEdit ? (
        <Button asChild variant="outline">
          <Link href="/payment-runs">Back to Payment Runs</Link>
        </Button>
      ) : null}
    </div>
  );
}
