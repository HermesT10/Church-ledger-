'use client';

import { useMemo, useState, useTransition, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { uploadFinancialEvidence } from '@/lib/evidence/actions';
import {
  createHirerInline,
  createInvoiceAccountInline,
  createPayableBillFromInvoiceForm,
  createReceivableInvoice,
  createSupplierInline,
} from '@/lib/invoices/actions';
import type { InvoiceDirection, InvoiceFormOptions, InvoiceLineDraftInput } from '@/lib/invoices/types';

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';

type LineDraft = {
  key: string;
  accountId: string;
  fundId: string;
  description: string;
  amount: string;
};

function newLine(): LineDraft {
  return {
    key: `line-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    accountId: '',
    fundId: '',
    description: '',
    amount: '',
  };
}

function parsePence(value: string) {
  const amount = Number.parseFloat(String(value || '0').replace(/[£,]/g, ''));
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function statusLabel(direction: InvoiceDirection) {
  return direction === 'payable' ? 'Bill to Pay' : 'Invoice Owed to Us';
}

export function NewInvoiceClient({ options }: { options: InvoiceFormOptions }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [direction, setDirection] = useState<InvoiceDirection>('payable');
  const [suppliers, setSuppliers] = useState(options.suppliers);
  const [hirers, setHirers] = useState(options.hirers);
  const [expenseAccounts, setExpenseAccounts] = useState(options.expenseAccounts);
  const [incomeAccounts, setIncomeAccounts] = useState(options.incomeAccounts);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [hirerDialogOpen, setHirerDialogOpen] = useState(false);
  const [accountDialogOpen, setAccountDialogOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedHirerId, setSelectedHirerId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [total, setTotal] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [lines, setLines] = useState<LineDraft[]>([newLine()]);

  const accounts = direction === 'payable' ? expenseAccounts : incomeAccounts;
  const totalPence = parsePence(total);
  const lineTotalPence = useMemo(() => lines.reduce((sum, line) => sum + parsePence(line.amount), 0), [lines]);

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function selectedSupplierDefaults(id: string) {
    return suppliers.find((supplier) => supplier.id === id);
  }

  function selectedHirerDefaults(id: string) {
    return hirers.find((hirer) => hirer.id === id);
  }

  function applyDefaultsForCounterparty(nextDirection: InvoiceDirection, id: string) {
    if (!id) return;
    if (nextDirection === 'payable') {
      const supplier = selectedSupplierDefaults(id);
      if (!supplier) return;
      setLines((current) =>
        current.map((line) => ({
          ...line,
          accountId: line.accountId || supplier.default_account_id || '',
          fundId: line.fundId || supplier.default_fund_id || '',
        })),
      );
    } else {
      const hirer = selectedHirerDefaults(id);
      if (!hirer) return;
      setLines((current) =>
        current.map((line) => ({
          ...line,
          accountId: line.accountId || hirer.default_income_account_id || '',
          fundId: line.fundId || hirer.default_fund_id || '',
        })),
      );
    }
  }

  async function createSupplierFromForm(formData: FormData) {
    const result = await createSupplierInline({
      name: String(formData.get('name') ?? ''),
      contactEmail: String(formData.get('email') ?? ''),
      phone: String(formData.get('phone') ?? ''),
      address: String(formData.get('address') ?? ''),
      defaultExpenseAccountId: String(formData.get('default_account_id') ?? ''),
      defaultFundId: String(formData.get('default_fund_id') ?? ''),
      bankReferenceAlias: String(formData.get('bank_reference_alias') ?? ''),
      notes: String(formData.get('notes') ?? ''),
    });
    if (result.error || !result.data) {
      toast.error(result.error ?? 'Unable to create supplier.');
      return;
    }
    const created = result.data;
    setSuppliers((current) => [
      ...current,
      { id: created.id, name: created.name, default_account_id: null, default_fund_id: null },
    ].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedSupplierId(created.id);
    setSupplierDialogOpen(false);
    toast.success('Supplier created.');
  }

  async function createHirerFromForm(formData: FormData) {
    const result = await createHirerInline({
      name: String(formData.get('name') ?? ''),
      contactName: String(formData.get('contact_name') ?? ''),
      email: String(formData.get('email') ?? ''),
      phone: String(formData.get('phone') ?? ''),
      address: String(formData.get('address') ?? ''),
      defaultIncomeAccountId: String(formData.get('default_income_account_id') ?? ''),
      defaultFundId: String(formData.get('default_fund_id') ?? ''),
      notes: String(formData.get('notes') ?? ''),
    });
    if (result.error || !result.data) {
      toast.error(result.error ?? 'Unable to create customer/hirer.');
      return;
    }
    const created = result.data;
    setHirers((current) => [
      ...current,
      { id: created.id, name: created.name, email: null, default_income_account_id: null, default_fund_id: null },
    ].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedHirerId(created.id);
    setHirerDialogOpen(false);
    toast.success('Customer/hirer created.');
  }

  async function createAccountFromForm(formData: FormData) {
    const accountType = direction === 'payable' ? 'expense' : 'income';
    const result = await createInvoiceAccountInline({
      name: String(formData.get('name') ?? ''),
      type: accountType,
      parentAccountId: String(formData.get('parent_account_id') ?? ''),
      description: String(formData.get('description') ?? ''),
      defaultFundId: String(formData.get('default_fund_id') ?? ''),
    });
    if (result.error || !result.data) {
      toast.error(result.error ?? 'Unable to create account.');
      return;
    }
    if (accountType === 'expense') {
      setExpenseAccounts((current) => [...current, result.data!].sort((a, b) => a.code.localeCompare(b.code)));
    } else {
      setIncomeAccounts((current) => [...current, result.data!].sort((a, b) => a.code.localeCompare(b.code)));
    }
    setLines((current) => current.map((line, index) => (index === 0 ? { ...line, accountId: result.data!.id } : line)));
    setAccountDialogOpen(false);
    toast.success(`${accountType === 'expense' ? 'Expense' : 'Income'} account created.`);
  }

  async function uploadEvidenceIfNeeded() {
    if (!file || direction !== 'payable') return null;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', 'bills');
    const result = await uploadFinancialEvidence(formData);
    if (result.error || !result.url) throw new Error(result.error ?? 'Evidence upload failed.');
    return result.url;
  }

  function submit() {
    startTransition(async () => {
      try {
        if (lineTotalPence !== totalPence) {
          toast.error('Line total must equal invoice total.');
          return;
        }
        const payloadLines: InvoiceLineDraftInput[] = lines.map((line) => ({
          accountId: line.accountId,
          fundId: line.fundId,
          description: line.description || null,
          amountPence: parsePence(line.amount),
        }));

        if (direction === 'payable') {
          const attachmentUrl = await uploadEvidenceIfNeeded();
          const result = await createPayableBillFromInvoiceForm({
            supplierId: selectedSupplierId,
            billNumber: invoiceNumber || null,
            billDate: invoiceDate,
            dueDate: dueDate || null,
            totalPence,
            attachmentUrl,
            lines: payloadLines,
          });
          if (result.error || !result.data) {
            toast.error(result.error ?? 'Unable to create bill.');
            return;
          }
          toast.success('Bill to Pay created.');
          router.push(`/bills/${result.data.id}`);
          return;
        }

        const result = await createReceivableInvoice({
          hirerId: selectedHirerId,
          invoiceNumber: invoiceNumber || null,
          invoiceDate,
          dueDate: dueDate || null,
          totalPence,
          notes: notes || null,
          message: message || null,
          lines: payloadLines,
        });
        if (result.error || !result.data) {
          toast.error(result.error ?? 'Unable to create invoice.');
          return;
        }
        toast.success('Invoice Owed to Us created.');
        router.push(`/bills/receivable/${result.data.id}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to create invoice.');
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-border/70 shadow-card">
        <CardHeader>
          <CardTitle>What type of invoice is this?</CardTitle>
          <CardDescription>
            Choose whether the church needs to pay a supplier, or whether someone owes the church.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {(['payable', 'receivable'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setDirection(value);
                setLines([newLine()]);
              }}
              className={`rounded-2xl border p-4 text-left transition ${
                direction === value ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-border hover:bg-muted/40'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{statusLabel(value)}</p>
                {direction === value && <Badge>Selected</Badge>}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {value === 'payable'
                  ? 'A supplier bill the church needs to pay.'
                  : 'An invoice created by the church and sent to a customer or hirer.'}
              </p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-border/70 shadow-card">
        <CardHeader>
          <CardTitle>{statusLabel(direction)}</CardTitle>
          <CardDescription>
            {direction === 'payable'
              ? 'Create a supplier bill with expense lines.'
              : 'Create a customer/hirer invoice with income lines and PDF download.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            {direction === 'payable' ? (
              <div className="space-y-2">
                <Label>Supplier *</Label>
                <div className="flex gap-2">
                  <select
                    value={selectedSupplierId}
                    onChange={(event) => {
                      setSelectedSupplierId(event.target.value);
                      applyDefaultsForCounterparty('payable', event.target.value);
                    }}
                    className={SELECT_CLASS}
                  >
                    <option value="">Select supplier...</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                    ))}
                  </select>
                  <Button type="button" variant="outline" onClick={() => setSupplierDialogOpen(true)}>+ Add</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Customer / Hirer *</Label>
                <div className="flex gap-2">
                  <select
                    value={selectedHirerId}
                    onChange={(event) => {
                      setSelectedHirerId(event.target.value);
                      applyDefaultsForCounterparty('receivable', event.target.value);
                    }}
                    className={SELECT_CLASS}
                  >
                    <option value="">Select customer/hirer...</option>
                    {hirers.map((hirer) => (
                      <option key={hirer.id} value={hirer.id}>{hirer.name}</option>
                    ))}
                  </select>
                  <Button type="button" variant="outline" onClick={() => setHirerDialogOpen(true)}>+ Add</Button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>{direction === 'payable' ? 'Supplier invoice number' : 'Invoice number'}</Label>
              <Input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} placeholder="e.g. INV-001" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Invoice date *</Label>
              <Input type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Total amount *</Label>
              <Input type="number" min="0.01" step="0.01" value={total} onChange={(event) => setTotal(event.target.value)} className="text-right" />
            </div>
          </div>

          {direction === 'payable' && (
            <div className="space-y-2">
              <Label>Evidence / invoice file</Label>
              <Input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null)} />
              <p className="text-xs text-muted-foreground">Attach the supplier invoice or supporting evidence.</p>
            </div>
          )}

          {direction === 'receivable' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Message to recipient</Label>
                <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
              </div>
              <div className="space-y-2">
                <Label>Internal notes</Label>
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{direction === 'payable' ? 'Expense lines' : 'Income lines'}</p>
                <p className="text-xs text-muted-foreground">Each line needs an account and fund.</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setAccountDialogOpen(true)}>
                  + Add {direction === 'payable' ? 'expense' : 'income'} account
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, newLine()])}>+ Add line</Button>
              </div>
            </div>

            {lines.map((line) => (
              <div key={line.key} className="grid gap-2 rounded-2xl border p-3 sm:grid-cols-[1fr_1fr_1fr_120px_auto]">
                <select value={line.accountId} onChange={(event) => updateLine(line.key, { accountId: event.target.value })} className={SELECT_CLASS}>
                  <option value="">Select account...</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.code} - {account.name}</option>
                  ))}
                </select>
                <select value={line.fundId} onChange={(event) => updateLine(line.key, { fundId: event.target.value })} className={SELECT_CLASS}>
                  <option value="">Select fund...</option>
                  {options.funds.map((fund) => (
                    <option key={fund.id} value={fund.id}>{fund.name}</option>
                  ))}
                </select>
                <Input value={line.description} onChange={(event) => updateLine(line.key, { description: event.target.value })} placeholder="Description" />
                <Input type="number" step="0.01" min="0.01" value={line.amount} onChange={(event) => updateLine(line.key, { amount: event.target.value })} className="text-right" placeholder="0.00" />
                <Button type="button" variant="ghost" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}>Remove</Button>
              </div>
            ))}
            <div className="flex justify-end gap-4 text-sm">
              <span className="text-muted-foreground">Lines total: £{(lineTotalPence / 100).toFixed(2)}</span>
              {totalPence > 0 && lineTotalPence !== totalPence && <span className="text-warning">Does not match total</span>}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => router.push('/bills')}>Cancel</Button>
            <Button type="button" onClick={submit} disabled={isPending}>
              {isPending ? 'Creating...' : `Create ${statusLabel(direction)}`}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={supplierDialogOpen} onOpenChange={setSupplierDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add new supplier</DialogTitle>
            <DialogDescription>Create a supplier without leaving the invoice form.</DialogDescription>
          </DialogHeader>
          <form action={createSupplierFromForm} className="space-y-3">
            <Input name="name" placeholder="Supplier name *" required />
            <Input name="email" type="email" placeholder="Email" />
            <Input name="phone" placeholder="Phone" />
            <Input name="bank_reference_alias" placeholder="Bank reference alias" />
            <textarea name="address" rows={2} placeholder="Address" className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
            <textarea name="notes" rows={2} placeholder="Notes" className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
            <select name="default_account_id" className={SELECT_CLASS}>
              <option value="">Default expense account</option>
              {expenseAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}
            </select>
            <select name="default_fund_id" className={SELECT_CLASS}>
              <option value="">Default fund</option>
              {options.funds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
            </select>
            <DialogFooter>
              <Button type="submit">Create supplier</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={hirerDialogOpen} onOpenChange={setHirerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add new customer / hirer</DialogTitle>
            <DialogDescription>Create a receivable invoice customer and make them available to Lettings.</DialogDescription>
          </DialogHeader>
          <form action={createHirerFromForm} className="space-y-3">
            <Input name="name" placeholder="Name *" required />
            <Input name="contact_name" placeholder="Contact name" />
            <Input name="email" type="email" placeholder="Email" />
            <Input name="phone" placeholder="Phone" />
            <textarea name="address" rows={2} placeholder="Address" className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
            <textarea name="notes" rows={2} placeholder="Notes" className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
            <select name="default_income_account_id" className={SELECT_CLASS}>
              <option value="">Default income account</option>
              {incomeAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}
            </select>
            <select name="default_fund_id" className={SELECT_CLASS}>
              <option value="">Default fund</option>
              {options.funds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
            </select>
            <DialogFooter>
              <Button type="submit">Create customer/hirer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={accountDialogOpen} onOpenChange={setAccountDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {direction === 'payable' ? 'expense' : 'income'} account</DialogTitle>
            <DialogDescription>This account will be available on invoice lines and the Accounts page.</DialogDescription>
          </DialogHeader>
          <form action={createAccountFromForm} className="space-y-3">
            <Input name="name" placeholder="Account name *" required />
            <textarea name="description" rows={2} placeholder="Description" className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" />
            <select name="default_fund_id" className={SELECT_CLASS}>
              <option value="">Default fund</option>
              {options.funds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
            </select>
            <DialogFooter>
              <Button type="submit">Create account</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
