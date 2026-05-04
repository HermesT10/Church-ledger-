'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type {
  PortalExpenseMethod,
  PortalExpenseSubmissionFormOptions,
  PortalExpenseSubmissionRow,
} from '@/lib/portal/expense-submission-types';
import {
  listPortalExpenseSubmissions,
  savePortalExpenseDraft,
  submitPortalExpense,
  uploadPortalExpenseReceipt,
} from '@/lib/portal/expense-submissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

function formatAmount(pence: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (['approved', 'awaiting_bank_match', 'paid', 'reconciled'].includes(status)) return 'default';
  if (['rejected', 'voided'].includes(status)) return 'destructive';
  if (['submitted', 'changes_requested'].includes(status)) return 'outline';
  return 'secondary';
}

function parseBudgetValue(value: FormDataEntryValue | null) {
  const [budgetId, budgetCategoryId] = String(value ?? '').split('|');
  return { budgetId: budgetId || null, budgetCategoryId: budgetCategoryId || null };
}

export function PortalExpensesClient({
  initialSubmissions,
  options,
  canSubmit,
}: {
  initialSubmissions: PortalExpenseSubmissionRow[];
  options: PortalExpenseSubmissionFormOptions;
  canSubmit: boolean;
}) {
  const router = useRouter();
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PortalExpenseSubmissionRow | null>(null);
  const [method, setMethod] = useState<PortalExpenseMethod>('card');
  const [submitting, setSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();

  const total = useMemo(() => submissions.reduce((sum, row) => sum + row.amount_pence, 0), [submissions]);

  async function refresh() {
    const result = await listPortalExpenseSubmissions();
    if (!result.error) setSubmissions(result.data);
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const { budgetId, budgetCategoryId } = parseBudgetValue(data.get('budget_id'));
    const input = {
      expenseDate: String(data.get('expense_date') ?? ''),
      amountPence: Math.round(Number.parseFloat(String(data.get('amount') ?? '0')) * 100),
      detail: String(data.get('detail') ?? '').trim(),
      method: String(data.get('method') ?? 'card') as PortalExpenseMethod,
      supplierId: String(data.get('supplier_id') ?? '') || null,
      supplierName: String(data.get('supplier_name') ?? '').trim() || null,
      budgetId,
      budgetCategoryId,
      fundId: String(data.get('fund_id') ?? '') || null,
      accountId: String(data.get('account_id') ?? '') || null,
      reimbursementRequired: data.get('reimbursement_required') === 'on',
      cardAssignmentId: String(data.get('card_assignment_id') ?? '') || null,
    };

    const draft = await savePortalExpenseDraft(input);
    if (draft.error || !draft.data) {
      toast.error(draft.error ?? 'Could not save this expense.');
      setSubmitting(false);
      return;
    }

    const receipt = data.get('receipt') as File | null;
    if (receipt && receipt.size > 0) {
      const receiptData = new FormData();
      receiptData.append('receipt', receipt);
      const upload = await uploadPortalExpenseReceipt(draft.data.id, receiptData);
      if (upload.error) {
        toast.error(upload.error);
        setSubmitting(false);
        return;
      }
    }

    const submitted = await submitPortalExpense(draft.data.id, input);
    if (submitted.error) {
      toast.error(submitted.error);
      setSubmitting(false);
      return;
    }
    if (submitted.warning?.message) toast.warning(submitted.warning.message);
    toast.success('Expense submitted for review.');
    form.reset();
    setOpen(false);
    setSubmitting(false);
    router.refresh();
    await refresh();
  }

  function handleSubmitDraft(row: PortalExpenseSubmissionRow) {
    startTransition(async () => {
      const submitted = await submitPortalExpense(row.id, {
        expenseDate: row.expense_date,
        amountPence: row.amount_pence,
        detail: row.detail,
        method: row.method,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        budgetId: row.budget_id,
        budgetCategoryId: row.budget_category_id,
        fundId: row.fund_id,
        accountId: row.account_id,
        reimbursementRequired: row.reimbursement_required,
        cardAssignmentId: row.card_assignment_id,
      });
      if (submitted.error) {
        toast.error(submitted.error);
        return;
      }
      toast.success('Expense submitted.');
      router.refresh();
      await refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-border/70 bg-card shadow-card">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>My Expense Submissions</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Submit expenses with receipts, assigned budgets, funds, and payment method details.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            {canSubmit ? (
              <DialogTrigger asChild>
                <Button>Submit expense</Button>
              </DialogTrigger>
            ) : null}
            <DialogContent className="sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>Submit expense</DialogTitle>
                <DialogDescription>
                  Receipts are {options.receiptsRequired ? 'required' : 'optional'} for this workspace.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="expense_date">Date *</Label>
                    <Input id="expense_date" name="expense_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount *</Label>
                    <Input id="amount" name="amount" type="number" min="0.01" step="0.01" required placeholder="0.00" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="method">Method *</Label>
                    <select id="method" name="method" className={SELECT_CLASS} required value={method} onChange={(event) => setMethod(event.target.value as PortalExpenseMethod)}>
                      <option value="card">Card</option>
                      <option value="cash">Cash</option>
                      <option value="cheque">Cheque</option>
                      <option value="bank_transfer">Bank transfer</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="detail">Detail *</Label>
                  <Textarea id="detail" name="detail" required placeholder="What was purchased and why?" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="budget_id">Budget/category *</Label>
                    <select id="budget_id" name="budget_id" className={SELECT_CLASS} required>
                      <option value="">Select a budget</option>
                      {options.budgets.map((budget) => (
                        <option key={`${budget.id}-${budget.budgetCategoryId ?? 'all'}`} value={`${budget.id}|${budget.budgetCategoryId ?? ''}`}>
                          {budget.name}{budget.secondary ? ` (${budget.secondary})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fund_id">Fund *</Label>
                    <select id="fund_id" name="fund_id" className={SELECT_CLASS} required>
                      <option value="">Select a fund</option>
                      {options.funds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="account_id">Expense category *</Label>
                    <select id="account_id" name="account_id" className={SELECT_CLASS} required>
                      <option value="">Select a category</option>
                      {options.accounts.map((account) => <option key={account.id} value={account.id}>{account.secondary ? `${account.secondary} - ` : ''}{account.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="card_assignment_id">Card {method === 'card' ? '*' : ''}</Label>
                    <select id="card_assignment_id" name="card_assignment_id" className={SELECT_CLASS} required={method === 'card'} disabled={method !== 'card'}>
                      <option value="">Select a card</option>
                      {options.cards.map((card) => <option key={card.id} value={card.id}>{card.name}{card.lastFour ? ` ending ${card.lastFour}` : ''}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="supplier_id">Supplier</Label>
                    <select id="supplier_id" name="supplier_id" className={SELECT_CLASS}>
                      <option value="">No supplier selected</option>
                      {options.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supplier_name">Payee name</Label>
                    <Input id="supplier_name" name="supplier_name" placeholder="Optional payee/supplier name" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="receipt">Receipt {options.receiptsRequired ? '*' : ''}</Label>
                    <Input id="receipt" name="receipt" type="file" accept="application/pdf,image/png,image/jpeg" required={options.receiptsRequired} />
                  </div>
                  <label className="flex items-center gap-2 rounded-2xl border border-border/70 px-3 py-2 text-sm">
                    <Switch name="reimbursement_required" />
                    Reimbursement required
                  </label>
                </div>
                <Button type="submit" disabled={submitting || options.budgets.length === 0 || options.funds.length === 0 || options.accounts.length === 0}>
                  {submitting ? 'Submitting...' : 'Submit for review'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="mb-4 rounded-2xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            {submissions.length} submissions · {formatAmount(total)} total submitted
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{new Date(row.expense_date).toLocaleDateString('en-GB')}</TableCell>
                  <TableCell className="max-w-xs truncate">{row.detail}</TableCell>
                  <TableCell>{statusLabel(row.method)}</TableCell>
                  <TableCell>{formatAmount(row.amount_pence)}</TableCell>
                  <TableCell><Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge></TableCell>
                  <TableCell className="text-right">
                    {row.status === 'draft' || row.status === 'changes_requested' ? (
                      <Button size="sm" variant="outline" disabled={isPending} onClick={() => handleSubmitDraft(row)}>Submit</Button>
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => setSelected(row)}>View</Button>
                  </TableCell>
                </TableRow>
              ))}
              {submissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                    No expenses submitted yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Sheet open={Boolean(selected)} onOpenChange={(value) => !value && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.detail}</SheetTitle>
                <SheetDescription>{formatAmount(selected.amount_pence)} · {statusLabel(selected.status)}</SheetDescription>
              </SheetHeader>
              <div className="mt-6 space-y-4 text-sm">
                <div className="rounded-2xl border border-border/70 p-4">
                  <p><span className="text-muted-foreground">Method:</span> {statusLabel(selected.method)}</p>
                  <p><span className="text-muted-foreground">Payee:</span> {selected.supplier_name ?? 'Not provided'}</p>
                  <p><span className="text-muted-foreground">Receipt:</span> {selected.receipt_url ? <a className="text-primary underline" href={selected.receipt_url} target="_blank">View receipt</a> : 'Not uploaded'}</p>
                </div>
                {selected.overspend_warning ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900">{selected.overspend_warning}</div> : null}
                {selected.change_request_note ? <div className="rounded-2xl border border-border/70 p-4"><strong>Changes requested</strong><p>{selected.change_request_note}</p></div> : null}
                {selected.admin_notes ? <div className="rounded-2xl border border-border/70 p-4"><strong>Admin notes</strong><p>{selected.admin_notes}</p></div> : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
