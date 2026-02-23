'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { InvoiceSubmissionRow } from '@/lib/workflows/types';
import {
  createInvoiceSubmission,
  reviewInvoiceSubmission,
  convertInvoiceToBill,
  listInvoiceSubmissions,
  uploadWorkflowFile,
  updateInvoiceSubmissionAttachment,
} from '@/lib/workflows/actions';
import { toast } from 'sonner';
import {
  Card,
  CardContent,
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

interface InvoicesClientProps {
  orgId: string;
  role: string;
  initialData: InvoiceSubmissionRow[];
  totalCount: number;
  currentStatus: string;
  suppliers: { id: string; name: string }[];
  funds: { id: string; name: string }[];
  expenseAccounts: { id: string; code: string; name: string }[];
}

function formatAmount(pence: number): string {
  return '£' + (pence / 100).toFixed(2);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB');
}

function statusBadgeVariant(
  status: InvoiceSubmissionRow['status'],
): 'secondary' | 'default' | 'destructive' | 'outline' {
  switch (status) {
    case 'pending':
      return 'secondary';
    case 'approved':
      return 'default';
    case 'rejected':
      return 'destructive';
    case 'converted':
      return 'outline';
    default:
      return 'secondary';
  }
}

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'converted', label: 'Converted' },
] as const;

export function InvoicesClient({
  orgId,
  role,
  initialData,
  totalCount,
  currentStatus,
  suppliers,
  funds,
  expenseAccounts,
}: InvoicesClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [submissions, setSubmissions] = useState<InvoiceSubmissionRow[]>(initialData);

  useEffect(() => {
    setSubmissions(initialData);
  }, [initialData]);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{ id: string; decision: 'approved' | 'rejected' } | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');

  const canSubmit =
    role === 'admin' || role === 'treasurer' || role === 'finance_user';
  const canApprove = role === 'admin' || role === 'treasurer';

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    const supplierName = (formData.get('supplier_name') as string)?.trim();
    const supplierId = (formData.get('supplier_id') as string) || undefined;
    const invoiceNumber = (formData.get('invoice_number') as string) || undefined;
    const invoiceDate = formData.get('invoice_date') as string;
    const amountStr = formData.get('amount') as string;
    const amountPence = Math.round(parseFloat(amountStr || '0') * 100);
    const fundId = (formData.get('fund_id') as string) || undefined;
    const accountId = (formData.get('account_id') as string) || undefined;
    const description = (formData.get('description') as string) || undefined;
    const file = formData.get('file') as File | null;

    if (!supplierName) {
      toast.error('Supplier name is required.');
      setSubmitLoading(false);
      return;
    }
    if (!invoiceDate) {
      toast.error('Invoice date is required.');
      setSubmitLoading(false);
      return;
    }
    if (!amountPence || amountPence <= 0) {
      toast.error('Amount must be positive.');
      setSubmitLoading(false);
      return;
    }

    const createRes = await createInvoiceSubmission({
      supplierName,
      supplierId: supplierId || null,
      invoiceNumber: invoiceNumber || null,
      invoiceDate,
      amountPence,
      fundId: fundId || null,
      accountId: accountId || null,
      description: description || null,
    });

    if (createRes.error) {
      toast.error(createRes.error);
      setSubmitLoading(false);
      return;
    }

    const submissionId = createRes.data!.id;

    if (file && file.size > 0) {
      setUploadingFile(true);
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);
      const uploadRes = await uploadWorkflowFile(
        uploadFormData,
        'invoice-submissions',
        submissionId,
      );
      setUploadingFile(false);

      if (uploadRes.url) {
        await updateInvoiceSubmissionAttachment(submissionId, uploadRes.url);
      }
      if (uploadRes.error && !uploadRes.url) {
        toast.error(uploadRes.error);
      }
    }

    setSubmitLoading(false);
    toast.success('Invoice submitted successfully.');
    setSubmitDialogOpen(false);
    setSelectedSupplierId('');
    form.reset();
    router.refresh();

    if (!currentStatus || currentStatus === 'all' || currentStatus === 'pending') {
      startTransition(async () => {
        const res = await listInvoiceSubmissions(orgId, {
          status: currentStatus === 'all' || !currentStatus ? undefined : currentStatus,
        });
        if (!res.error) {
          setSubmissions(res.data);
        }
      });
    }
  }

  function openReviewDialog(id: string, decision: 'approved' | 'rejected') {
    setReviewTarget({ id, decision });
    setReviewNote('');
    setReviewDialogOpen(true);
  }

  async function handleReview() {
    if (!reviewTarget) return;

    startTransition(async () => {
      const { error } = await reviewInvoiceSubmission(
        reviewTarget.id,
        reviewTarget.decision,
        reviewNote || undefined,
      );
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(
        `Invoice ${reviewTarget.decision === 'approved' ? 'approved' : 'rejected'}.`,
      );
      setReviewDialogOpen(false);
      setReviewTarget(null);
      router.refresh();

      const res = await listInvoiceSubmissions(orgId, {
        status: currentStatus === 'all' || !currentStatus ? undefined : currentStatus,
      });
      if (!res.error) {
        setSubmissions(res.data);
      }
    });
  }

  async function handleConvert(id: string) {
    startTransition(async () => {
      const { billId, error } = await convertInvoiceToBill(id);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success('Invoice converted to bill.');
      router.refresh();

      const res = await listInvoiceSubmissions(orgId, {
        status: currentStatus === 'all' || !currentStatus ? undefined : currentStatus,
      });
      if (!res.error) {
        setSubmissions(res.data);
      }

      if (billId) {
        router.push(`/bills/${billId}`);
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Invoice Submissions</CardTitle>
          {canSubmit && (
            <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
              <DialogTrigger asChild>
                <Button>Submit Invoice</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Submit Invoice</DialogTitle>
                  <DialogDescription>
                    Submit an invoice for approval. Attach the invoice document if available.
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="supplier_name">Supplier Name *</Label>
                    <Input
                      id="supplier_name"
                      name="supplier_name"
                      list="suppliers-list"
                      required
                      placeholder="Type or select supplier"
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        const match = suppliers.find(
                          (s) => s.name.toLowerCase() === val.toLowerCase(),
                        );
                        setSelectedSupplierId(match?.id ?? '');
                      }}
                    />
                    <input
                      type="hidden"
                      name="supplier_id"
                      value={selectedSupplierId}
                    />
                    <datalist id="suppliers-list">
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.name} />
                      ))}
                    </datalist>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="invoice_number">Invoice Number</Label>
                      <Input
                        id="invoice_number"
                        name="invoice_number"
                        placeholder="e.g. INV-001"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="invoice_date">Invoice Date *</Label>
                      <Input
                        id="invoice_date"
                        name="invoice_date"
                        type="date"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="amount">Amount (£) *</Label>
                    <Input
                      id="amount"
                      name="amount"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder="0.00"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="fund_id">Fund</Label>
                    <select
                      id="fund_id"
                      name="fund_id"
                      className={SELECT_CLASS}
                    >
                      <option value="">— Select fund —</option>
                      {funds.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="account_id">Expense Account</Label>
                    <select
                      id="account_id"
                      name="account_id"
                      className={SELECT_CLASS}
                    >
                      <option value="">— Select account —</option>
                      {expenseAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} – {a.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      name="description"
                      placeholder="Optional description"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="file">Attachment</Label>
                    <Input
                      id="file"
                      name="file"
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                    />
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSubmitDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={submitLoading || uploadingFile}
                    >
                      {submitLoading || uploadingFile
                        ? 'Submitting…'
                        : 'Submit'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex gap-1 border-b pb-4 mb-4">
            {STATUS_TABS.map((tab) => {
              const isActive =
                tab.value === 'all'
                  ? !currentStatus || currentStatus === 'all'
                  : currentStatus === tab.value;
              return (
                <Link
                  key={tab.value}
                  href={`/workflows/invoices${tab.value === 'all' ? '' : `?status=${tab.value}`}`}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>

          {submissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No invoice submissions found.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Fund</TableHead>
                  <TableHead>Status</TableHead>
                  {canApprove && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((sub) => (
                  <TableRow key={sub.id}>
                    <TableCell>{formatDate(sub.invoiceDate)}</TableCell>
                    <TableCell className="font-medium">
                      {sub.supplierName}
                    </TableCell>
                    <TableCell>{formatAmount(sub.amountPence)}</TableCell>
                    <TableCell>{sub.fundName ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(sub.status)}>
                        {sub.status}
                      </Badge>
                    </TableCell>
                    {canApprove && (
                      <TableCell>
                        <div className="flex gap-2">
                          {sub.status === 'pending' && (
                            <>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => openReviewDialog(sub.id, 'approved')}
                                disabled={isPending}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => openReviewDialog(sub.id, 'rejected')}
                                disabled={isPending}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                          {sub.status === 'approved' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleConvert(sub.id)}
                              disabled={isPending}
                            >
                              Convert to Bill
                            </Button>
                          )}
                          {sub.status === 'converted' && sub.billId && (
                            <Button size="sm" variant="outline" asChild>
                              <Link href={`/bills/${sub.billId}`}>
                                View Bill
                              </Link>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reviewTarget?.decision === 'approved' ? 'Approve' : 'Reject'} Invoice
            </DialogTitle>
            <DialogDescription>
              Add an optional note for this review.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Label htmlFor="review_note">Review Note</Label>
            <Input
              id="review_note"
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="Optional note"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReviewDialogOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReview}
              variant={reviewTarget?.decision === 'rejected' ? 'destructive' : 'default'}
              disabled={isPending}
            >
              {isPending ? 'Processing…' : reviewTarget?.decision === 'approved' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
