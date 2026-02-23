'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import {
  updateFund,
  archiveFund,
  unarchiveFund,
  deleteFund,
} from '@/lib/funds/actions';
import type { FundRow } from '@/lib/funds/types';
import { FUND_TYPES, FUND_TYPE_LABELS } from '@/lib/funds/types';
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
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

interface Props {
  fund: FundRow;
  canEdit: boolean;
  hasTransactions: boolean;
}

function EditForm({ fund, canEdit, hasTransactions }: Props) {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {canEdit ? 'Edit Fund' : 'Fund Details'}
          {!fund.is_active && (
            <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200 text-xs">
              Inactive
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {canEdit
            ? 'Update the fund details below.'
            : 'You do not have permission to edit this fund.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {!fund.is_active && (
          <div className="mb-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            This fund is inactive and cannot be selected in new transactions.
          </div>
        )}

        {hasTransactions && canEdit && (
          <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
            This fund has linked transactions and cannot be deleted. You can deactivate it instead.
          </div>
        )}

        <form className="flex flex-col gap-4">
          <input type="hidden" name="id" value={fund.id} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Fund Name</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={fund.name}
              disabled={!canEdit}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="type">Fund Type</Label>
            <select
              id="type"
              name="type"
              required
              defaultValue={fund.type}
              disabled={!canEdit}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {FUND_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FUND_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Restricted: ring-fenced for a specific purpose. Unrestricted: general use. Designated: earmarked by trustees.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="purpose_text">Description</Label>
            <Textarea
              id="purpose_text"
              name="purpose_text"
              defaultValue={fund.purpose_text ?? ''}
              rows={3}
              disabled={!canEdit}
              placeholder="Describe the purpose and any restrictions..."
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="reporting_group">Reporting Group</Label>
            <Input
              id="reporting_group"
              name="reporting_group"
              defaultValue={fund.reporting_group ?? ''}
              disabled={!canEdit}
              placeholder="e.g. Outreach, Property, Community"
            />
            <p className="text-xs text-muted-foreground">
              Optional grouping for annual reports and SOFA.
            </p>
          </div>

          {canEdit && (
            <div className="flex gap-2 flex-wrap pt-2">
              <Button formAction={updateFund}>Save Changes</Button>

              {fund.is_active ? (
                <Button formAction={archiveFund} variant="outline">
                  Deactivate
                </Button>
              ) : (
                <Button formAction={unarchiveFund} variant="outline">
                  Reactivate
                </Button>
              )}

              {!hasTransactions && (
                <Button
                  formAction={deleteFund}
                  variant="destructive"
                  className="ml-auto"
                >
                  Delete
                </Button>
              )}

              <Button asChild variant="ghost">
                <Link href={`/funds/${fund.id}`}>Cancel</Link>
              </Button>
            </div>
          )}

          {!canEdit && (
            <Button asChild variant="outline">
              <Link href={`/funds/${fund.id}`}>Back to Fund</Link>
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

export function EditFundForm(props: Props) {
  return (
    <Suspense>
      <EditForm {...props} />
    </Suspense>
  );
}
