'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createBankAccount } from '@/lib/banking/bankAccounts';
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
      account_number_last4: formData.get('account_number_last4') as string,
      sort_code: formData.get('sort_code') as string,
      currency: formData.get('currency') as string,
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
