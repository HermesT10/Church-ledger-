'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { PortalExpenseSubmissionRow } from '@/lib/portal/expense-submission-types';
import {
  approvePortalExpenseSubmission,
  convertPortalExpenseToManualTransaction,
  linkPortalExpenseToBankTransaction,
  listPortalExpenseSubmissions,
  rejectPortalExpenseSubmission,
  requestPortalExpenseChanges,
  voidPortalExpenseSubmission,
} from '@/lib/portal/expense-submissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

interface BankLineOption {
  id: string;
  date: string;
  description: string | null;
  amountPence: number;
}

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

export function PortalExpensesAdminClient({
  initialSubmissions,
  bankLines,
}: {
  initialSubmissions: PortalExpenseSubmissionRow[];
  bankLines: BankLineOption[];
}) {
  const router = useRouter();
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [selected, setSelected] = useState<PortalExpenseSubmissionRow | null>(null);
  const [note, setNote] = useState('');
  const [bankLineId, setBankLineId] = useState('');
  const [isPending, startTransition] = useTransition();

  async function refresh() {
    const result = await listPortalExpenseSubmissions({ admin: true });
    if (!result.error) setSubmissions(result.data);
    router.refresh();
  }

  function runAction(action: () => Promise<{ error: string | null }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      setNote('');
      await refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-border/70 bg-card shadow-card">
        <CardHeader>
          <CardTitle>Portal Expense Submissions</CardTitle>
          <p className="text-sm text-muted-foreground">
            Review invited-user expenses, approve or request changes, then convert approved claims into manual transactions.
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Risk</TableHead>
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
                  <TableCell>{row.overspend_warning ? <Badge variant="outline">Overspend</Badge> : null}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setSelected(row)}>Review</Button>
                  </TableCell>
                </TableRow>
              ))}
              {submissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    No portal expense submissions found.
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
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-border/70 p-4 text-sm">
                  <p><span className="text-muted-foreground">Method:</span> {statusLabel(selected.method)}</p>
                  <p><span className="text-muted-foreground">Supplier/payee:</span> {selected.supplier_name ?? 'Not provided'}</p>
                  <p><span className="text-muted-foreground">Receipt:</span> {selected.receipt_url ? <a className="text-primary underline" href={selected.receipt_url} target="_blank">Open receipt</a> : 'Missing'}</p>
                  <p><span className="text-muted-foreground">Manual transaction:</span> {selected.linked_manual_transaction_id ?? 'Not converted'}</p>
                  <p><span className="text-muted-foreground">Bank transaction:</span> {selected.linked_bank_transaction_id ?? 'Not linked'}</p>
                </div>
                {selected.overspend_warning ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    {selected.overspend_warning}
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="admin-note">Admin note</Label>
                  <Textarea id="admin-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note to the submitter" />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button disabled={isPending || selected.status !== 'submitted'} onClick={() => runAction(() => approvePortalExpenseSubmission({ id: selected.id, note }), 'Expense approved.')}>
                    Approve
                  </Button>
                  <Button variant="outline" disabled={isPending || !['submitted', 'approved'].includes(selected.status)} onClick={() => runAction(() => requestPortalExpenseChanges({ id: selected.id, note }), 'Changes requested.')}>
                    Request changes
                  </Button>
                  <Button variant="destructive" disabled={isPending || selected.status === 'reconciled'} onClick={() => runAction(() => rejectPortalExpenseSubmission({ id: selected.id, note }), 'Expense rejected.')}>
                    Reject
                  </Button>
                  <Button variant="secondary" disabled={isPending || selected.status === 'reconciled'} onClick={() => runAction(() => voidPortalExpenseSubmission({ id: selected.id, note }), 'Expense voided.')}>
                    Void
                  </Button>
                  <Button className="sm:col-span-2" disabled={isPending || selected.status !== 'approved' || Boolean(selected.linked_manual_transaction_id)} onClick={() => runAction(() => convertPortalExpenseToManualTransaction(selected.id), 'Converted to manual transaction.')}>
                    Convert to manual transaction
                  </Button>
                </div>
                <div className="space-y-2 rounded-2xl border border-border/70 p-4">
                  <Label htmlFor="bank-line">Link bank transaction</Label>
                  <select id="bank-line" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={bankLineId} onChange={(event) => setBankLineId(event.target.value)}>
                    <option value="">Select bank transaction</option>
                    {bankLines.map((line) => (
                      <option key={line.id} value={line.id}>
                        {new Date(line.date).toLocaleDateString('en-GB')} · {line.description ?? 'Bank line'} · {formatAmount(line.amountPence)}
                      </option>
                    ))}
                  </select>
                  <Button variant="outline" disabled={isPending || !bankLineId} onClick={() => runAction(() => linkPortalExpenseToBankTransaction({ id: selected.id, bankLineId }), 'Bank transaction linked.')}>
                    Link bank transaction
                  </Button>
                </div>
                <Input value={selected.id} readOnly className="font-mono text-xs" aria-label="Submission id" />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
