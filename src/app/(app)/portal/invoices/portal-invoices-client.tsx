'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import type { InvoiceSubmissionRow, PortalInvoiceFormOptions } from '@/lib/workflows/types';
import {
  listInvoiceSubmissions,
  savePortalInvoiceDraft,
  submitPortalInvoice,
  uploadPortalInvoiceAttachment,
} from '@/lib/workflows/actions';
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

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

function formatAmount(pence: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

function formatDate(value: string | null) {
  if (!value) return 'Not set';
  return new Date(value).toLocaleDateString('en-GB');
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'approved' || status === 'paid') return 'default';
  if (status === 'rejected' || status === 'voided') return 'destructive';
  if (status === 'under_review' || status === 'scheduled_for_payment') return 'outline';
  return 'secondary';
}

export function PortalInvoicesClient({
  orgId,
  initialInvoices,
  options,
  canSubmit,
}: {
  orgId: string;
  initialInvoices: InvoiceSubmissionRow[];
  options: PortalInvoiceFormOptions;
  canSubmit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [invoices, setInvoices] = useState(initialInvoices);
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function refreshInvoices() {
    const res = await listInvoiceSubmissions(orgId);
    if (!res.error) {
      setInvoices(res.data);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    const amountPence = Math.round(parseFloat(String(formData.get('amount') ?? '0')) * 100);
    const file = formData.get('file') as File | null;

    const draft = await savePortalInvoiceDraft({
      supplierName: String(formData.get('supplier_name') ?? '').trim(),
      supplierId: selectedSupplierId || null,
      invoiceNumber: String(formData.get('invoice_number') ?? '').trim() || null,
      invoiceDate: String(formData.get('invoice_date') ?? ''),
      amountPence,
      budgetId: String(formData.get('budget_id') ?? '') || null,
      fundId: String(formData.get('fund_id') ?? '') || null,
      accountId: String(formData.get('account_id') ?? '') || null,
      description: String(formData.get('description') ?? '').trim() || null,
    });

    if (draft.error || !draft.data) {
      toast.error(draft.error ?? 'Could not save invoice draft.');
      setIsSubmitting(false);
      return;
    }

    if (file && file.size > 0) {
      const uploadData = new FormData();
      uploadData.append('file', file);
      const upload = await uploadPortalInvoiceAttachment(uploadData, draft.data.id);
      if (upload.error) {
        toast.error(upload.error);
        setIsSubmitting(false);
        return;
      }
    }

    const submit = await submitPortalInvoice(draft.data.id);
    if (submit.error) {
      toast.error(submit.error);
      setIsSubmitting(false);
      return;
    }

    toast.success('Invoice submitted for review.');
    form.reset();
    setSelectedSupplierId('');
    setOpen(false);
    setIsSubmitting(false);
    router.refresh();
    await refreshInvoices();
  }

  function handleResubmit(id: string) {
    startTransition(async () => {
      const { error } = await submitPortalInvoice(id);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success('Invoice sent back for review.');
      router.refresh();
      await refreshInvoices();
    });
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-border/70 bg-card shadow-card">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>My Submitted Invoices</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Submit invoices for admin approval and track each payment through review, scheduling, and payment.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            {canSubmit ? (
              <DialogTrigger asChild>
                <Button>Submit invoice</Button>
              </DialogTrigger>
            ) : null}
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Submit invoice</DialogTitle>
                <DialogDescription>
                  Add the invoice details and upload the invoice file. You will only see funds and categories assigned to you.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="supplier_name">Supplier name *</Label>
                  <Input
                    id="supplier_name"
                    name="supplier_name"
                    list="portal-suppliers"
                    required
                    onChange={(event) => {
                      const value = event.target.value.trim();
                      const match = options.suppliers.find((supplier) => supplier.name.toLowerCase() === value.toLowerCase());
                      setSelectedSupplierId(match?.id ?? '');
                    }}
                  />
                  <datalist id="portal-suppliers">
                    {options.suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.name} />
                    ))}
                  </datalist>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="invoice_number">Invoice number</Label>
                    <Input id="invoice_number" name="invoice_number" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invoice_date">Invoice date *</Label>
                    <Input id="invoice_date" name="invoice_date" type="date" required />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount *</Label>
                    <Input id="amount" name="amount" type="number" min="0.01" step="0.01" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="budget_id">Assigned budget</Label>
                    <select id="budget_id" name="budget_id" className={SELECT_CLASS}>
                      <option value="">No budget selected</option>
                      {options.budgets.map((budget) => (
                        <option key={budget.id} value={budget.id}>
                          {budget.name}{budget.year ? ` (${budget.year})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="fund_id">Assigned fund</Label>
                    <select id="fund_id" name="fund_id" className={SELECT_CLASS}>
                      <option value="">No fund selected</option>
                      {options.funds.map((fund) => (
                        <option key={fund.id} value={fund.id}>{fund.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="account_id">Expense category</Label>
                    <select id="account_id" name="account_id" className={SELECT_CLASS}>
                      <option value="">No category selected</option>
                      {options.expenseAccounts.map((account) => (
                        <option key={account.id} value={account.id}>{account.code} - {account.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Input id="description" name="description" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="file">Invoice file</Label>
                  <Input id="file" name="file" type="file" accept=".pdf,.jpg,.jpeg,.png" />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Submitting...' : 'Submit for review'}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
      </Card>

      {invoices.length === 0 ? (
        <Card className="rounded-3xl border-dashed border-border/70">
          <CardContent className="p-6 text-sm text-muted-foreground">
            No invoice submissions yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {invoices.map((invoice) => (
            <Card key={invoice.id} className="rounded-3xl border-border/70 shadow-card">
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{invoice.supplierName}</h3>
                    <Badge variant={statusVariant(invoice.status)}>{statusLabel(invoice.status)}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatAmount(invoice.amountPence)} • Invoice date {formatDate(invoice.invoiceDate)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {invoice.fundName ?? 'No fund'} • {invoice.accountName ?? 'No category'}{invoice.budgetName ? ` • ${invoice.budgetName}` : ''}
                  </p>
                  {invoice.requestChangesNote ? (
                    <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Changes requested: {invoice.requestChangesNote}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {invoice.attachmentUrl ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={invoice.attachmentUrl} target="_blank">View file</Link>
                    </Button>
                  ) : null}
                  {invoice.status === 'change_requested' ? (
                    <Button size="sm" onClick={() => handleResubmit(invoice.id)} disabled={isPending}>
                      Resubmit
                    </Button>
                  ) : null}
                  {invoice.billId ? (
                    <Badge variant="outline">Linked to bill</Badge>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
