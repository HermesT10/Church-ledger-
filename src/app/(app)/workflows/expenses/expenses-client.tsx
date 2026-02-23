'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  createExpenseRequest,
  reviewExpenseRequest,
  convertExpenseToCashSpend,
  uploadWorkflowFile,
} from '@/lib/workflows/actions';
import type { ExpenseRequestRow } from '@/lib/workflows/types';

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

const STATUS_TABS = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Converted', value: 'converted' },
] as const;

function formatAmount(pence: number): string {
  return '£' + (pence / 100).toFixed(2);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB');
}

function statusBadgeVariant(
  status: 'pending' | 'approved' | 'rejected' | 'converted'
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

interface ExpensesClientProps {
  orgId: string;
  role: string;
  currentStatus: string;
  initialData: ExpenseRequestRow[];
  totalCount: number;
  funds: { id: string; name: string }[];
  expenseAccounts: { id: string; code: string; name: string }[];
}

export function ExpensesClient({
  orgId,
  role,
  currentStatus,
  initialData,
  totalCount,
  funds,
  expenseAccounts,
}: ExpensesClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [submitOpen, setSubmitOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'approved' | 'rejected'>(
    'approved'
  );
  const [reviewNote, setReviewNote] = useState('');

  const canSubmit =
    role === 'admin' || role === 'treasurer' || role === 'finance_user';
  const canApprove = role === 'admin' || role === 'treasurer';

  // Submit form state
  const [spendDate, setSpendDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [amountPounds, setAmountPounds] = useState('');
  const [accountId, setAccountId] = useState(expenseAccounts[0]?.id ?? '');
  const [fundId, setFundId] = useState('');
  const [description, setDescription] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleSubmitExpense = () => {
    const amount = parseFloat(amountPounds);
    if (!spendDate) {
      toast.error('Spend date is required.');
      return;
    }
    if (!amount || amount <= 0) {
      toast.error('Amount must be positive.');
      return;
    }
    if (!accountId) {
      toast.error('Expense account is required.');
      return;
    }
    if (!description.trim()) {
      toast.error('Description is required.');
      return;
    }

    const amountPence = Math.round(amount * 100);

    startTransition(async () => {
      let receiptUrl: string | null = null;
      if (receiptFile) {
        setUploading(true);
        const formData = new FormData();
        formData.set('file', receiptFile);
        const tempId = crypto.randomUUID();
        const { url, error } = await uploadWorkflowFile(
          formData,
          'expense-receipts',
          tempId
        );
        setUploading(false);
        if (error) {
          toast.error(error);
          return;
        }
        receiptUrl = url;
      }

      const { data, error } = await createExpenseRequest({
        spendDate,
        amountPence,
        fundId: fundId || undefined,
        accountId,
        description: description.trim(),
        receiptUrl: receiptUrl ?? undefined,
      });

      if (error) {
        toast.error(error);
        return;
      }
      toast.success('Expense request submitted.');
      setSubmitOpen(false);
      setSpendDate(new Date().toISOString().slice(0, 10));
      setAmountPounds('');
      setAccountId(expenseAccounts[0]?.id ?? '');
      setFundId('');
      setDescription('');
      setReceiptFile(null);
      router.refresh();
    });
  };

  const openReview = (id: string, decision: 'approved' | 'rejected') => {
    setReviewId(id);
    setReviewDecision(decision);
    setReviewNote('');
    setReviewOpen(true);
  };

  const handleReview = () => {
    if (!reviewId) return;
    startTransition(async () => {
      const { error } = await reviewExpenseRequest(
        reviewId,
        reviewDecision,
        reviewNote || undefined
      );
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(`Expense ${reviewDecision}.`);
      setReviewOpen(false);
      setReviewId(null);
      router.refresh();
    });
  };

  const handleConvert = (id: string) => {
    startTransition(async () => {
      const { cashSpendId, error } = await convertExpenseToCashSpend(id);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success('Converted to cash spend.');
      if (cashSpendId) {
        router.push(`/cash/spends/${cashSpendId}`);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Expense Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Submit and manage expense claims.
          </p>
        </div>
        {canSubmit && (
          <Button onClick={() => setSubmitOpen(true)}>Submit Expense</Button>
        )}
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 border-b">
        {STATUS_TABS.map((tab) => {
          const isActive =
            tab.value === 'all'
              ? !currentStatus || currentStatus === 'all'
              : currentStatus === tab.value;
          return (
            <Link
              key={tab.value}
              href={`/workflows/expenses${tab.value === 'all' ? '' : `?status=${tab.value}`}`}
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

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          {initialData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No expense requests found.
            </p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Fund</TableHead>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Status</TableHead>
                    {canApprove && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {initialData.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{formatDate(row.spendDate)}</TableCell>
                      <TableCell className="font-medium">{row.description}</TableCell>
                      <TableCell>{formatAmount(row.amountPence)}</TableCell>
                      <TableCell>{row.accountName ?? row.accountId}</TableCell>
                      <TableCell>{row.fundName ?? '—'}</TableCell>
                      <TableCell>
                        {row.receiptUrl ? (
                          <a
                            href={row.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline text-sm"
                          >
                            View
                          </a>
                        ) : row.receiptLate ? (
                          <Badge variant="destructive">Late</Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-amber-500 text-amber-700 bg-amber-50"
                          >
                            Pending
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(row.status)}>
                          {row.status}
                        </Badge>
                      </TableCell>
                      {canApprove && (
                        <TableCell>
                          <div className="flex gap-2">
                            {row.status === 'pending' && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openReview(row.id, 'approved')}
                                  disabled={isPending}
                                >
                                  Approve
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => openReview(row.id, 'rejected')}
                                  disabled={isPending}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                            {row.status === 'approved' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleConvert(row.id)}
                                disabled={isPending}
                              >
                                Convert to Cash Spend
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submit Expense Dialog */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Submit Expense</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="spendDate">Spend date</Label>
              <Input
                id="spendDate"
                type="date"
                value={spendDate}
                onChange={(e) => setSpendDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="amount">Amount (£)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amountPounds}
                onChange={(e) => setAmountPounds(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="account">Expense account *</Label>
              <select
                id="account"
                className={SELECT_CLASS}
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                required
              >
                <option value="">Select account</option>
                {expenseAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} – {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="fund">Fund (optional)</Label>
              <select
                id="fund"
                className={SELECT_CLASS}
                value={fundId}
                onChange={(e) => setFundId(e.target.value)}
              >
                <option value="">None</option>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description *</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What was this expense for?"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="receipt">Receipt (optional)</Label>
              <Input
                id="receipt"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
              />
              {receiptFile && (
                <p className="text-xs text-muted-foreground">
                  {receiptFile.name}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSubmitOpen(false)}
              disabled={isPending || uploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitExpense}
              disabled={isPending || uploading}
            >
              {uploading ? 'Uploading…' : isPending ? 'Submitting…' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reviewDecision === 'approved' ? 'Approve' : 'Reject'} Expense
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="reviewNote">Note (optional)</Label>
              <Input
                id="reviewNote"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="Add a note for the submitter"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReviewOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant={reviewDecision === 'rejected' ? 'destructive' : 'default'}
              onClick={handleReview}
              disabled={isPending}
            >
              {reviewDecision === 'approved' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
