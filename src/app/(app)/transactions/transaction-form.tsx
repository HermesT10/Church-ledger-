'use client';

import { useMemo, useState } from 'react';
import { createManualTransactionAction, updateManualTransactionAction } from '@/lib/transactions/actions';
import type { ManualTransactionLineRow, ManualTransactionRow, TransactionLineDirection, TransactionType } from '@/lib/transactions/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';

interface AccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface FundOption {
  id: string;
  name: string;
  type?: string;
}

interface BankAccountOption {
  id: string;
  name: string;
}

interface IncomeStreamOption {
  id: string;
  code: string;
  name: string;
}

interface LineDraft {
  key: string;
  fund_id: string;
  account_id: string;
  income_stream_id: string;
  description: string;
  amount: string;
  direction: TransactionLineDirection;
}

interface Props {
  accounts: AccountOption[];
  funds: FundOption[];
  bankAccounts: BankAccountOption[];
  incomeStreams: IncomeStreamOption[];
  transaction?: ManualTransactionRow;
  lines?: ManualTransactionLineRow[];
}

let lineKey = 0;
function newKey() {
  lineKey += 1;
  return `tx-line-${lineKey}-${Date.now()}`;
}

function penceToPounds(pence: number): string {
  return (pence / 100).toFixed(2);
}

function parsePounds(value: string): number {
  const n = Number.parseFloat(value || '0');
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function emptyLine(type: TransactionType): LineDraft {
  return {
    key: newKey(),
    fund_id: '',
    account_id: '',
    income_stream_id: '',
    description: '',
    amount: '',
    direction: type === 'income' ? 'in' : 'out',
  };
}

function lineDirectionForType(type: TransactionType, direction: TransactionLineDirection): TransactionLineDirection {
  if (type === 'income') return 'in';
  if (type === 'expense') return 'out';
  return direction;
}

export function TransactionForm({ accounts, funds, bankAccounts, incomeStreams, transaction, lines }: Props) {
  const isEdit = !!transaction;
  const [type, setType] = useState<TransactionType>(transaction?.type ?? 'expense');
  const [amount, setAmount] = useState(transaction ? penceToPounds(transaction.amount_pence) : '');
  const [lineDrafts, setLineDrafts] = useState<LineDraft[]>(() => {
    if (lines?.length) {
      return lines.map((line) => ({
        key: newKey(),
        fund_id: line.fund_id ?? '',
        account_id: line.account_id,
        income_stream_id: line.income_stream_id ?? '',
        description: line.description ?? '',
        amount: penceToPounds(line.amount_pence),
        direction: line.direction,
      }));
    }
    return [emptyLine(transaction?.type ?? 'expense')];
  });

  const visibleAccounts = useMemo(() => {
    if (type === 'income') return accounts.filter((a) => a.type === 'income');
    if (type === 'expense') return accounts.filter((a) => a.type === 'expense');
    return accounts;
  }, [accounts, type]);

  const linesTotal = lineDrafts.reduce((sum, line) => sum + parsePounds(line.amount), 0);
  const amountPence = parsePounds(amount);
  const incoming = lineDrafts.filter((line) => lineDirectionForType(type, line.direction) === 'in').reduce((sum, line) => sum + parsePounds(line.amount), 0);
  const outgoing = lineDrafts.filter((line) => lineDirectionForType(type, line.direction) === 'out').reduce((sum, line) => sum + parsePounds(line.amount), 0);
  const isBalanced = type === 'transfer' || type === 'adjustment'
    ? incoming === outgoing && incoming === amountPence
    : linesTotal === amountPence;
  const restrictedFundSelected = lineDrafts.some((line) => funds.find((f) => f.id === line.fund_id)?.type === 'restricted');

  const linesJson = JSON.stringify(lineDrafts.map((line) => ({
    fund_id: line.fund_id || null,
    account_id: line.account_id,
    income_stream_id: line.income_stream_id || null,
    description: line.description || null,
    amount: line.amount,
    direction: lineDirectionForType(type, line.direction),
  })));

  function setLine(key: string, patch: Partial<LineDraft>) {
    setLineDrafts((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function handleTypeChange(nextType: TransactionType) {
    setType(nextType);
    setLineDrafts((prev) => prev.map((line) => ({
      ...line,
      direction: lineDirectionForType(nextType, line.direction),
      account_id: '',
    })));
  }

  return (
    <form action={isEdit ? updateManualTransactionAction : createManualTransactionAction} className="space-y-6">
      {isEdit ? <input type="hidden" name="id" value={transaction.id} /> : null}
      <input type="hidden" name="lines" value={linesJson} />

      <Card>
        <CardHeader>
          <CardTitle>1. What happened?</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Transaction type</Label>
            <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" name="type" value={type} onChange={(e) => handleTypeChange(e.target.value as TransactionType)}>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
              <option value="transfer">Transfer</option>
              <option value="adjustment">Adjustment</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" name="transaction_date" defaultValue={transaction?.transaction_date ?? new Date().toISOString().slice(0, 10)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Amount</Label>
            <Input name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
          </div>
          <div className="space-y-1.5">
            <Label>Expected bank account</Label>
            <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" name="expected_bank_account_id" defaultValue={transaction?.expected_bank_account_id ?? ''}>
              <option value="">None / not yet known</option>
              {bankAccounts.map((bank) => <option key={bank.id} value={bank.id}>{bank.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Description</Label>
            <Textarea name="description" defaultValue={transaction?.description ?? ''} placeholder="What happened? Use plain language." required />
          </div>
          <div className="space-y-1.5">
            <Label>Payee / payer</Label>
            <Input name="payee_payer_name" defaultValue={transaction?.payee_payer_name ?? ''} />
          </div>
          <div className="space-y-1.5">
            <Label>Reference</Label>
            <Input name="reference" defaultValue={transaction?.reference ?? ''} />
          </div>
          <div className="space-y-1.5">
            <Label>Payment method</Label>
            <Input name="payment_method" defaultValue={transaction?.payment_method ?? ''} placeholder="Card, BACS, cash, cheque..." />
          </div>
          <label className="flex items-center gap-2 pt-7 text-sm">
            <input type="checkbox" name="requires_bank_match" defaultChecked={transaction?.requires_bank_match ?? type !== 'adjustment'} />
            Wait for a bank match before final posting
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Which fund and account category?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Split lines explain which fund this belongs to and which account category reports should use.
          </p>
          {lineDrafts.map((line, index) => (
            <div key={line.key} className="grid gap-3 rounded-lg border p-3 md:grid-cols-6">
              {(type === 'transfer' || type === 'adjustment') && (
                <div className="space-y-1.5">
                  <Label>Direction</Label>
                  <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={line.direction} onChange={(e) => setLine(line.key, { direction: e.target.value as TransactionLineDirection })}>
                    <option value="in">In / debit</option>
                    <option value="out">Out / credit</option>
                  </select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Fund</Label>
                <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={line.fund_id} onChange={(e) => setLine(line.key, { fund_id: e.target.value })}>
                  <option value="">No fund</option>
                  {funds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Account</Label>
                <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={line.account_id} onChange={(e) => setLine(line.key, { account_id: e.target.value })} required>
                  <option value="">Choose account</option>
                  {visibleAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}
                </select>
              </div>
              {type === 'income' && (
                <div className="space-y-1.5">
                  <Label>Income stream</Label>
                  <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={line.income_stream_id} onChange={(e) => setLine(line.key, { income_stream_id: e.target.value })}>
                    <option value="">None</option>
                    {incomeStreams.map((stream) => <option key={stream.id} value={stream.id}>{stream.code} - {stream.name}</option>)}
                  </select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <Input value={line.amount} onChange={(e) => setLine(line.key, { amount: e.target.value })} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input value={line.description} onChange={(e) => setLine(line.key, { description: e.target.value })} placeholder={`Line ${index + 1}`} />
              </div>
              <div className="flex items-end">
                <Button type="button" variant="ghost" size="sm" disabled={lineDrafts.length === 1} onClick={() => setLineDrafts((prev) => prev.filter((item) => item.key !== line.key))}>
                  <Trash2 size={14} className="mr-1" /> Remove
                </Button>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={() => setLineDrafts((prev) => [...prev, emptyLine(type)])}>
            <Plus size={14} className="mr-1" /> Add split line
          </Button>
          {!isBalanced && (
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle size={16} className="mt-0.5" />
              <span>Line totals must equal the transaction amount before saving.</span>
            </div>
          )}
          {restrictedFundSelected && (
            <div className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <AlertTriangle size={16} className="mt-0.5" />
              <span>A restricted fund is selected. Check the expense is allowed for that fund.</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Review and save</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Manual transactions explain activity before it is final. Income, expenses, and transfers wait for a bank match so the same real-world transaction is not counted twice.
          </p>
          <div className="space-y-1.5">
            <Label>Duplicate override reason (optional)</Label>
            <Textarea name="duplicate_override_reason" defaultValue={transaction?.duplicate_override_reason ?? ''} placeholder="If this looks like a duplicate, explain why it should still be recorded." />
          </div>
          <Button type="submit" disabled={!isBalanced}>{isEdit ? 'Save Transaction' : 'Save Draft Transaction'}</Button>
        </CardContent>
      </Card>
    </form>
  );
}
