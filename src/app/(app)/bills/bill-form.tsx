'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState, useCallback, useMemo, useEffect } from 'react';
import Link from 'next/link';
import {
  createBill,
  updateBill,
  approveBill,
  postBill,
  deleteBill,
} from '@/lib/bills/actions';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Account {
  id: string;
  code: string;
  name: string;
}

interface Fund {
  id: string;
  name: string;
}

interface Supplier {
  id: string;
  name: string;
}

interface BillHeader {
  id: string;
  supplier_id: string;
  bill_number: string | null;
  bill_date: string;
  due_date: string | null;
  status: string;
  total_pence: number;
  journal_id: string | null;
}

interface BillLine {
  id: string;
  account_id: string;
  fund_id: string | null;
  description: string | null;
  amount_pence: number;
}

interface LineDraft {
  key: string;
  account_id: string;
  fund_id: string;
  description: string;
  amount: string; // pounds string
}

export interface BillFormProps {
  accounts: Account[];
  funds: Fund[];
  suppliers: Supplier[];
  supplierDefaultsMap?: Record<string, { default_account_id: string | null; default_fund_id: string | null }>;
  preselectedSupplierId?: string;
  bill?: BillHeader;
  lines?: BillLine[];
  canEdit: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function penceToPounds(pence: number): string {
  if (pence === 0) return '';
  return (pence / 100).toFixed(2);
}

function parsePounds(value: string): number {
  const n = parseFloat(value || '0');
  return isNaN(n) ? 0 : Math.round(n * 100);
}

let nextKey = 0;
function newKey(): string {
  return `bline-${++nextKey}-${Date.now()}`;
}

function emptyLine(): LineDraft {
  return { key: newKey(), account_id: '', fund_id: '', description: '', amount: '' };
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  approved: 'Approved',
  posted: 'Posted',
  paid: 'Paid',
};

/* ------------------------------------------------------------------ */
/*  Inner form                                                         */
/* ------------------------------------------------------------------ */

function InnerForm({ accounts, funds, suppliers, supplierDefaultsMap, preselectedSupplierId, bill, lines, canEdit }: BillFormProps) {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const isEdit = !!bill;
  const isDraft = !bill || bill.status === 'draft';

  const [supplierId, setSupplierId] = useState(bill?.supplier_id ?? preselectedSupplierId ?? '');

  // When supplier changes on a new bill, auto-fill line defaults
  const handleSupplierChange = useCallback(
    (newSupplierId: string) => {
      setSupplierId(newSupplierId);

      if (!isEdit && supplierDefaultsMap && newSupplierId) {
        const defaults = supplierDefaultsMap[newSupplierId];
        if (defaults) {
          setLineDrafts((prev) =>
            prev.map((line) => ({
              ...line,
              account_id: line.account_id || defaults.default_account_id || '',
              fund_id: line.fund_id || defaults.default_fund_id || '',
            })),
          );
        }
      }
    },
    [isEdit, supplierDefaultsMap],
  );
  // Apply supplier defaults on initial load if preselected
  useEffect(() => {
    if (!isEdit && preselectedSupplierId && supplierDefaultsMap) {
      const defaults = supplierDefaultsMap[preselectedSupplierId];
      if (defaults) {
        setLineDrafts((prev) =>
          prev.map((line) => ({
            ...line,
            account_id: line.account_id || defaults.default_account_id || '',
            fund_id: line.fund_id || defaults.default_fund_id || '',
          })),
        );
      }
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [billNumber, setBillNumber] = useState(bill?.bill_number ?? '');
  const [billDate, setBillDate] = useState(bill?.bill_date ?? '');
  const [dueDate, setDueDate] = useState(bill?.due_date ?? '');
  const [total, setTotal] = useState(bill ? penceToPounds(bill.total_pence) : '');

  // Line drafts
  const [lineDrafts, setLineDrafts] = useState<LineDraft[]>(() => {
    if (lines && lines.length > 0) {
      return lines.map((l) => ({
        key: newKey(),
        account_id: l.account_id,
        fund_id: l.fund_id ?? '',
        description: l.description ?? '',
        amount: penceToPounds(l.amount_pence),
      }));
    }
    return [emptyLine()];
  });

  const addLine = useCallback(() => {
    setLineDrafts((prev) => [...prev, emptyLine()]);
  }, []);

  const removeLine = useCallback((key: string) => {
    setLineDrafts((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }, []);

  const updateLine = useCallback(
    (key: string, field: keyof LineDraft, value: string) => {
      setLineDrafts((prev) =>
        prev.map((l) => (l.key === key ? { ...l, [field]: value } : l))
      );
    },
    []
  );

  // Running totals
  const { linesTotal, totalPence, totalsMismatch } = useMemo(() => {
    let sum = 0;
    for (const l of lineDrafts) {
      sum += parsePounds(l.amount);
    }
    const tp = parsePounds(total);
    return {
      linesTotal: sum,
      totalPence: tp,
      totalsMismatch: tp > 0 && sum > 0 && sum !== tp,
    };
  }, [lineDrafts, total]);

  // Serialise lines as JSON for hidden input
  const linesJson = JSON.stringify(
    lineDrafts.map(({ account_id, fund_id, description, amount }) => ({
      account_id,
      fund_id: fund_id || null,
      description,
      amount,
    }))
  );

  const formAction = isEdit ? updateBill : createBill;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>
              {isEdit
                ? isDraft
                  ? 'Edit Invoice'
                  : `Invoice (${STATUS_LABELS[bill!.status] ?? bill!.status})`
                : 'New Invoice'}
            </CardTitle>
            <CardDescription>
              {!canEdit
                ? 'This invoice is read-only.'
                : isEdit && !isDraft
                  ? 'This invoice can no longer be edited.'
                  : isEdit
                    ? 'Edit the invoice details and line items below.'
                    : 'Create a new invoice with at least one line item.'}
            </CardDescription>
          </div>
          {isEdit && (
            <Badge
              variant={
                bill!.status === 'posted' || bill!.status === 'paid'
                  ? 'default'
                  : bill!.status === 'approved'
                    ? 'secondary'
                    : 'outline'
              }
            >
              {STATUS_LABELS[bill!.status] ?? bill!.status}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {error && (
          <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {bill?.status === 'posted' && bill.journal_id && (
          <div className="mb-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            This invoice has been posted.{' '}
            <Link
              href={`/journals/${bill.journal_id}`}
              className="underline hover:no-underline font-medium"
            >
              View linked journal →
            </Link>
          </div>
        )}

        <form className="flex flex-col gap-6">
          {isEdit && <input type="hidden" name="id" value={bill!.id} />}
          <input type="hidden" name="lines" value={linesJson} />
          <input type="hidden" name="total" value={total} />

          {/* Header fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="supplier_id">Supplier *</Label>
              <select
                id="supplier_id"
                name="supplier_id"
                value={supplierId}
                onChange={(e) => handleSupplierChange(e.target.value)}
                disabled={!canEdit || !isDraft}
                required
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Select supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="bill_number">Invoice Number</Label>
              <Input
                id="bill_number"
                name="bill_number"
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                disabled={!canEdit || !isDraft}
                placeholder="e.g. INV-001"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="bill_date">Invoice Date *</Label>
              <Input
                id="bill_date"
                name="bill_date"
                type="date"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
                disabled={!canEdit || !isDraft}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="due_date">Due Date</Label>
              <Input
                id="due_date"
                name="due_date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={!canEdit || !isDraft}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="total">Total (£) *</Label>
              <Input
                id="total"
                type="number"
                step="0.01"
                min="0.01"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                disabled={!canEdit || !isDraft}
                required
                placeholder="0.00"
                className="text-right"
              />
            </div>
          </div>

          {/* Line editor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Invoice Lines</Label>
              {canEdit && isDraft && (
                <Button type="button" variant="outline" size="sm" onClick={addLine}>
                  + Add Line
                </Button>
              )}
            </div>

            {/* Column headers */}
            <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_1fr_100px_40px] gap-2 text-xs font-medium text-muted-foreground px-1">
              <span>Account</span>
              <span>Fund</span>
              <span>Description</span>
              <span className="text-right">Amount (£)</span>
              <span />
            </div>

            {lineDrafts.map((line) => (
              <div
                key={line.key}
                className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_100px_40px] gap-2 items-start border rounded-md p-2 sm:border-0 sm:p-0"
              >
                {/* Account */}
                <select
                  value={line.account_id}
                  onChange={(e) => updateLine(line.key, 'account_id', e.target.value)}
                  disabled={!canEdit || !isDraft}
                  required
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Select account…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} – {a.name}
                    </option>
                  ))}
                </select>

                {/* Fund */}
                <select
                  value={line.fund_id}
                  onChange={(e) => updateLine(line.key, 'fund_id', e.target.value)}
                  disabled={!canEdit || !isDraft}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">No fund</option>
                  {funds.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>

                {/* Description */}
                <Input
                  value={line.description}
                  onChange={(e) => updateLine(line.key, 'description', e.target.value)}
                  disabled={!canEdit || !isDraft}
                  placeholder="Description"
                  className="text-sm"
                />

                {/* Amount */}
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={line.amount}
                  onChange={(e) => updateLine(line.key, 'amount', e.target.value)}
                  disabled={!canEdit || !isDraft}
                  placeholder="0.00"
                  className="text-right text-sm"
                />

                {/* Remove */}
                {canEdit && isDraft && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeLine(line.key)}
                    disabled={lineDrafts.length <= 1}
                    title="Remove line"
                  >
                    ✕
                  </Button>
                )}
              </div>
            ))}

            {/* Totals row */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_100px_40px] gap-2 px-1 pt-2 border-t text-sm font-medium">
              <span className="sm:col-span-3 text-right">Lines Total</span>
              <span className="text-right">{(linesTotal / 100).toFixed(2)}</span>
              <span />
            </div>

            {/* Match indicator */}
            <div className="px-1">
              {linesTotal === 0 ? (
                <span className="text-xs text-muted-foreground">
                  Enter amounts to see totals.
                </span>
              ) : totalsMismatch ? (
                <span className="text-xs font-medium text-red-600">
                  Lines total does not match invoice total — difference:{' '}
                  {(Math.abs(linesTotal - totalPence) / 100).toFixed(2)}
                </span>
              ) : totalPence > 0 ? (
                <span className="text-xs font-medium text-green-600">
                  Lines match invoice total ✓
                </span>
              ) : null}
            </div>
          </div>

          {/* Action buttons */}
          {canEdit && isDraft && (
            <div className="flex gap-2 flex-wrap">
              <Button formAction={formAction}>
                {isEdit ? 'Save Changes' : 'Create Invoice'}
              </Button>
              {isEdit && (
                <>
                  <Button formAction={approveBill} variant="secondary">
                    Approve
                  </Button>
                  <Button formAction={deleteBill} variant="outline">
                    Delete
                  </Button>
                </>
              )}
              <Button asChild variant="outline">
                <Link href="/bills">Cancel</Link>
              </Button>
            </div>
          )}

          {isEdit && bill!.status === 'approved' && canEdit && (
            <div className="flex gap-2 flex-wrap">
              <Button formAction={postBill}>Post Invoice</Button>
              <Button asChild variant="outline">
                <Link href="/bills">Back to Invoices</Link>
              </Button>
            </div>
          )}

          {(!canEdit || (isEdit && (bill!.status === 'posted' || bill!.status === 'paid'))) && (
            <Button asChild variant="outline" className="self-start">
              <Link href="/bills">Back to Invoices</Link>
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Exported wrapper with Suspense boundary                            */
/* ------------------------------------------------------------------ */

export function BillForm(props: BillFormProps) {
  return (
    <Suspense>
      <InnerForm {...props} />
    </Suspense>
  );
}
