'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import {
  updateAccount,
  archiveAccount,
  unarchiveAccount,
  deleteAccount,
} from '@/lib/accounts/actions';
import type { AccountRow } from '@/lib/accounts/types';
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
import { Badge } from '@/components/ui/badge';

interface Props {
  account: AccountRow;
  canEdit: boolean;
  parentCandidates: AccountRow[];
  hasTransactions: boolean;
}

function EditForm({ account, canEdit, parentCandidates, hasTransactions }: Props) {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {canEdit ? 'Edit Account' : 'Account Details'}
          {!account.is_active && (
            <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200 text-xs">
              Inactive
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {canEdit
            ? 'Update the account details below.'
            : 'You do not have permission to edit this account.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {!account.is_active && (
          <div className="mb-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            This account is archived and cannot be selected in new transactions.
          </div>
        )}

        {hasTransactions && canEdit && (
          <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
            This account has linked transactions and cannot be deleted. You can deactivate it instead.
          </div>
        )}

        <form className="flex flex-col gap-4">
          <input type="hidden" name="id" value={account.id} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="code">Account Code</Label>
            <Input
              id="code"
              name="code"
              required
              defaultValue={account.code}
              disabled={!canEdit}
              className="font-mono"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Account Name</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={account.name}
              disabled={!canEdit}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="type">Account Type</Label>
            <select
              id="type"
              name="type"
              required
              defaultValue={account.type}
              disabled={!canEdit}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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
              defaultValue={account.reporting_category ?? ''}
              disabled={!canEdit}
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
              defaultValue={account.parent_id ?? ''}
              disabled={!canEdit}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">— None (top-level) —</option>
              {parentCandidates.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Optional. Nest under a parent account of the same type.
            </p>
          </div>

          {canEdit && (
            <div className="flex gap-2 flex-wrap pt-2">
              <Button formAction={updateAccount}>Save Changes</Button>

              {account.is_active ? (
                <Button formAction={archiveAccount} variant="outline">
                  Deactivate
                </Button>
              ) : (
                <Button formAction={unarchiveAccount} variant="outline">
                  Reactivate
                </Button>
              )}

              {!hasTransactions && (
                <Button
                  formAction={deleteAccount}
                  variant="destructive"
                  className="ml-auto"
                >
                  Delete
                </Button>
              )}

              <Button asChild variant="ghost">
                <Link href="/accounts">Cancel</Link>
              </Button>
            </div>
          )}

          {!canEdit && (
            <Button asChild variant="outline">
              <Link href="/accounts">Back to Accounts</Link>
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

export function EditAccountForm(props: Props) {
  return (
    <Suspense>
      <EditForm {...props} />
    </Suspense>
  );
}
