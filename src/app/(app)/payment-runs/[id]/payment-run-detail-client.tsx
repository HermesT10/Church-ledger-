'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { postPaymentRun, deletePaymentRun, exportPaymentRunCsv } from '@/lib/bills/actions';
import { toast } from 'sonner';
import {
  Banknote,
  CheckCircle,
  FileText,
  Trash2,
  ExternalLink,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PaymentRun {
  id: string;
  run_date: string;
  status: string;
  total_pence: number;
  journal_id: string | null;
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

  const isDraft = run.status === 'draft';
  const isPosted = run.status === 'posted';

  const grouped = useMemo(() => groupBySupplier(items), [items]);

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
      <div className="app-toolbar">
        {isPosted && (
          <>
            {run.journal_id && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/journals/${run.journal_id}`}>
                  <ExternalLink size={14} className="mr-1" />
                  View Journal
                </Link>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/banking">
                <FileText size={14} className="mr-1" />
                Reconciliation
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download size={14} className="mr-1" />
              Export CSV
            </Button>
          </>
        )}
        {(!isDraft || !canEdit) && (
          <Button asChild variant="outline" size="sm">
            <Link href="/payment-runs">Back to Payment Runs</Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Run Date</p>
            <p className="text-lg font-semibold">{formatDate(run.run_date)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Status</p>
            <div className="mt-1">
              <Badge
                variant={isPosted ? 'default' : 'outline'}
                className="text-base"
              >
                {isPosted ? 'Posted' : 'Draft'}
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Invoices</p>
            <p className="text-lg font-semibold">{items.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="text-lg font-semibold">{formatPounds(run.total_pence)}</p>
          </CardContent>
        </Card>
      </div>

      {isPosted && (
        <div className="rounded-[1.25rem] border border-emerald-200/70 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle size={16} className="text-green-600 shrink-0" />
          <span>This payment run has been posted and is ready for reconciliation.</span>
        </div>
      )}

      {/* Bills grouped by supplier */}
      <Card>
        <CardHeader>
          <CardTitle>Invoices in this Payment Run</CardTitle>
          <CardDescription>
            {grouped.length} supplier{grouped.length !== 1 ? 's' : ''},{' '}
            {items.length} invoice{items.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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
                <div className="rounded-md border overflow-x-auto">
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
                            <Badge
                              variant={
                                item.bill_status === 'paid'
                                  ? 'default'
                                  : 'outline'
                              }
                            >
                              {item.bill_status}
                            </Badge>
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
        </CardContent>
      </Card>

      {/* Draft actions */}
      {isDraft && canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>Post Payment Run</CardTitle>
            <CardDescription>
              Select the bank account to pay from, then post to create the
              journal and mark invoices as paid.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2 max-w-sm">
              <Label htmlFor="bank_account">Bank Account *</Label>
              <select
                id="bank_account"
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
              <Button onClick={handlePost} disabled={isPending || !bankAccountId}>
                {isPending ? 'Posting…' : 'Post Payment Run'}
              </Button>
              <Button
                variant="outline"
                onClick={handleDelete}
                disabled={isPending}
              >
                <Trash2 size={14} className="mr-1" />
                Delete Draft
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}
