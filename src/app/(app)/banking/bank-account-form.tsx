'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createBankAccount } from '@/lib/banking/bankAccounts';
import {
  BANK_CARD_THEME_KEYS,
  BANK_CARD_THEMES,
  DEFAULT_BANK_CARD_THEME,
} from '@/lib/banking/cardAppearance';
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

export function BankAccountForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    const payload = {
      name: formData.get('name') as string,
      account_type: formData.get('account_type') as
        | 'current'
        | 'savings'
        | 'credit_card'
        | 'loan'
        | 'cash'
        | 'clearing',
      bank_name: formData.get('bank_name') as string,
      account_number_last4: formData.get('account_number_last4') as string,
      masked_account_number: formData.get('masked_account_number') as string,
      sort_code: formData.get('sort_code') as string,
      currency: formData.get('currency') as string,
      opening_balance: formData.get('opening_balance') as string,
      opening_balance_date: formData.get('opening_balance_date') as string,
      card_theme: formData.get('card_theme') as string,
    };

    const result = await createBankAccount(orgId, payload);

    setLoading(false);

    if (result.success) {
      toast.success('Bank account created successfully.');
      setOpen(false);
      form.reset();
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to create bank account.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Add Bank Account</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Bank Account</DialogTitle>
          <DialogDescription>
            Enter the details for your new bank account.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Account Name *</Label>
            <Input
              id="name"
              name="name"
              required
              placeholder="e.g. Main Current Account"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="account_type">Account type</Label>
              <select
                id="account_type"
                name="account_type"
                defaultValue="current"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="current">Current account</option>
                <option value="savings">Savings</option>
                <option value="credit_card">Credit card</option>
                <option value="loan">Loan</option>
                <option value="cash">Cash</option>
                <option value="clearing">Clearing</option>
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="bank_name">Bank name</Label>
              <Input
                id="bank_name"
                name="bank_name"
                placeholder="e.g. Lloyds"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="account_number_last4">
              Account Number (last 4 digits)
            </Label>
            <Input
              id="account_number_last4"
              name="account_number_last4"
              maxLength={4}
              placeholder="e.g. 1234"
              className="font-mono"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="masked_account_number">Masked account number</Label>
            <Input
              id="masked_account_number"
              name="masked_account_number"
              placeholder="e.g. ****1234"
              className="font-mono"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="sort_code">Sort Code</Label>
            <Input
              id="sort_code"
              name="sort_code"
              placeholder="e.g. 12-34-56"
              className="font-mono"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="currency">Currency</Label>
            <Input
              id="currency"
              name="currency"
              defaultValue="GBP"
              placeholder="e.g. GBP"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="opening_balance">Opening balance</Label>
              <Input
                id="opening_balance"
                name="opening_balance"
                inputMode="decimal"
                defaultValue="0.00"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="opening_balance_date">Opening balance date</Label>
              <Input
                id="opening_balance_date"
                name="opening_balance_date"
                type="date"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="card_theme">Card colour</Label>
            <select
              id="card_theme"
              name="card_theme"
              defaultValue={DEFAULT_BANK_CARD_THEME}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {BANK_CARD_THEME_KEYS.map((theme) => (
                <option key={theme} value={theme}>
                  {BANK_CARD_THEMES[theme].label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating…' : 'Create Account'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
