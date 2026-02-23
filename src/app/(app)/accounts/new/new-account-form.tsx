'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';
import { createAccount } from '@/lib/accounts/actions';
import type { AccountRow, AccountType } from '@/lib/accounts/types';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS } from '@/lib/accounts/types';
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

interface Props {
  existingAccounts: AccountRow[];
}

function InnerForm({ existingAccounts }: Props) {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const [selectedType, setSelectedType] = useState<AccountType>('income');

  // Filter parent accounts to same type
  const parentCandidates = existingAccounts.filter(
    (a) => a.type === selectedType && !a.parent_id,
  );

  return (
    <div className="p-6 max-w-lg space-y-6">
      <div>
        <Link href="/accounts" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to Accounts
        </Link>
        <h1 className="text-2xl font-bold mt-2">New Account</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Add a new account to your chart of accounts.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Account Details</CardTitle>
          <CardDescription>
            Fill in the details for the new account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <form className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="code">Account Code</Label>
              <Input
                id="code"
                name="code"
                required
                placeholder="e.g. INC-001"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                A unique code to identify this account.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Account Name</Label>
              <Input
                id="name"
                name="name"
                required
                placeholder="e.g. Donations-General"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="type">Account Type</Label>
              <select
                id="type"
                name="type"
                required
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as AccountType)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ACCOUNT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="reporting_category">Reporting Category</Label>
              <Input
                id="reporting_category"
                name="reporting_category"
                placeholder="e.g. Staff Costs, Premises Costs"
              />
              <p className="text-xs text-muted-foreground">
                Optional grouping for reports (e.g. SOFA, I&amp;E).
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="parent_id">Parent Account</Label>
              <select
                id="parent_id"
                name="parent_id"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">— None (top-level) —</option>
                {parentCandidates.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Optional. Nest this account under a parent of the same type.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button formAction={createAccount}>Create Account</Button>
              <Button asChild variant="outline">
                <Link href="/accounts">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export function NewAccountFormClient({ existingAccounts }: Props) {
  return (
    <Suspense>
      <InnerForm existingAccounts={existingAccounts} />
    </Suspense>
  );
}
