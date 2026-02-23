'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { createFund } from '@/lib/funds/actions';
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

function NewFundForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  return (
    <div className="p-6 max-w-lg space-y-6">
      <div>
        <Link href="/funds" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to Funds
        </Link>
        <h1 className="text-2xl font-bold mt-2">New Fund</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create a new charity fund for your organisation.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Fund Details</CardTitle>
          <CardDescription>
            Define a new restricted, unrestricted, or designated fund.
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
              <Label htmlFor="name">Fund Name</Label>
              <Input id="name" name="name" required placeholder="e.g. General Fund" />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="type">Fund Type</Label>
              <select
                id="type"
                name="type"
                required
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                placeholder="Describe the purpose and any restrictions on this fund..."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Optional. Helpful for trustees and auditors.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="reporting_group">Reporting Group</Label>
              <Input
                id="reporting_group"
                name="reporting_group"
                placeholder="e.g. Outreach, Property, Community"
              />
              <p className="text-xs text-muted-foreground">
                Optional grouping for annual reports and SOFA.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button formAction={createFund}>Create Fund</Button>
              <Button asChild variant="outline">
                <Link href="/funds">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function NewFundPage() {
  return (
    <Suspense>
      <NewFundForm />
    </Suspense>
  );
}
