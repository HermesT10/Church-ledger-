'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createBankRule, updateBankRule } from '@/lib/banking/bank-rules-actions';
import type { BankRuleRow } from '@/lib/banking/types';
import { Button } from '@/components/ui/button';
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

interface BankRuleFormAccount {
  id: string;
  name: string;
}

export function BankRuleForm({
  accounts,
  bankAccountId,
  ledgerAccounts = [],
  funds = [],
  incomeStreams = [],
  donors = [],
  suppliers = [],
  rule,
  triggerLabel,
}: {
  accounts: BankRuleFormAccount[];
  bankAccountId?: string;
  ledgerAccounts?: BankRuleFormAccount[];
  funds?: BankRuleFormAccount[];
  incomeStreams?: BankRuleFormAccount[];
  donors?: BankRuleFormAccount[];
  suppliers?: BankRuleFormAccount[];
  rule?: BankRuleRow;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const editing = Boolean(rule);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    const result = editing
      ? await updateBankRule(new FormData(event.currentTarget))
      : await createBankRule(new FormData(event.currentTarget));
    setLoading(false);

    if (result.success) {
      toast.success(editing ? 'Bank rule updated.' : 'Bank rule created.');
      setOpen(false);
      event.currentTarget.reset();
      router.refresh();
    } else {
      toast.error(result.error ?? 'Could not create bank rule.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{triggerLabel ?? (editing ? 'Edit' : 'Create Bank Rule')}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Bank Rule' : 'Create Bank Rule'}</DialogTitle>
          <DialogDescription>
            Rules suggest categorisation during reconciliation. They do not auto-reconcile silently.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {rule && <input type="hidden" name="rule_id" value={rule.id} />}
          <div className="space-y-2">
            <Label htmlFor="rule-name">Rule name</Label>
            <Input id="rule-name" name="name" defaultValue={rule?.name ?? ''} placeholder="e.g. Monthly bank fees" required />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rule-account">Bank account</Label>
              <select
                id="rule-account"
                name="bank_account_id"
                defaultValue={rule?.bank_account_id ?? bankAccountId ?? ''}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All bank accounts</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-priority">Priority</Label>
              <Input id="rule-priority" name="priority" type="number" defaultValue={rule?.priority ?? 100} min="0" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rule-condition-type">Condition</Label>
              <select
                id="rule-condition-type"
                name="condition_type"
                defaultValue={rule?.condition_type ?? 'contains'}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="contains">Description contains</option>
                <option value="exact">Description equals</option>
                <option value="starts_with">Description starts with</option>
                <option value="amount_equals">Amount equals</option>
                <option value="amount_range">Amount range</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-condition-value">Text to match</Label>
              <Input id="rule-condition-value" name="condition_value" defaultValue={rule?.condition_value ?? ''} placeholder="e.g. bank charge" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="rule-direction">Money direction</Label>
              <select
                id="rule-direction"
                name="direction"
                defaultValue={rule?.direction ?? ''}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Either</option>
                <option value="in">Money in</option>
                <option value="out">Money out</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-min">Min amount</Label>
              <Input id="rule-min" name="amount_min" inputMode="decimal" defaultValue={rule?.amount_min ?? ''} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rule-max">Max amount</Label>
              <Input id="rule-max" name="amount_max" inputMode="decimal" defaultValue={rule?.amount_max ?? ''} placeholder="0.00" />
            </div>
          </div>

          <div className="rounded-xl border border-border/70 p-4">
            <h3 className="text-sm font-semibold">Suggested action</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="rule-transaction-type">Transaction type</Label>
                <select
                  id="rule-transaction-type"
                  name="transaction_type"
                  defaultValue={rule?.transaction_type ?? 'other'}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                  <option value="transfer">Transfer</option>
                  <option value="donation">Donation</option>
                  <option value="payroll">Payroll</option>
                  <option value="gift_aid_payment">Gift Aid payment</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-ledger-account">Account</Label>
                <select id="rule-ledger-account" name="account_id" defaultValue={rule?.account_id ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">No account suggestion</option>
                  {ledgerAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-fund">Fund</Label>
                <select id="rule-fund" name="fund_id" defaultValue={rule?.fund_id ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">No fund suggestion</option>
                  {funds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-income-stream">Income stream</Label>
                <select id="rule-income-stream" name="income_stream_id" defaultValue={rule?.income_stream_id ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">No income stream suggestion</option>
                  {incomeStreams.map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-donor">Donor</Label>
                <select id="rule-donor" name="donor_id" defaultValue={rule?.donor_id ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">No donor suggestion</option>
                  {donors.map((donor) => <option key={donor.id} value={donor.id}>{donor.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-supplier">Supplier</Label>
                <select id="rule-supplier" name="supplier_id" defaultValue={rule?.supplier_id ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">No supplier suggestion</option>
                  {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <Label htmlFor="rule-description-template">Description template</Label>
              <Input
                id="rule-description-template"
                name="description_template"
                defaultValue={rule?.description_template ?? ''}
                placeholder="e.g. Bank fee - {{description}}"
              />
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" name="auto_apply" defaultChecked={rule?.auto_apply ?? false} />
              Auto-apply when explicitly permitted
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Saving...' : editing ? 'Save rule' : 'Create rule'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
