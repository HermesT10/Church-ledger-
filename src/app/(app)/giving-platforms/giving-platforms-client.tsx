'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CreditCard, Settings2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { updateGivingPlatformMapping } from '@/lib/giving-platforms/actions';
import { PROVIDER_LABELS, type GivingPlatformRow } from '@/lib/giving-platforms/types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface Props {
  platforms: GivingPlatformRow[];
  accounts: AccountOption[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function GivingPlatformsClient({ platforms, accounts }: Props) {
  const router = useRouter();

  // Empty state
  if (platforms.length === 0) {
    return (
      <Card className="border shadow-sm rounded-2xl">
        <CardContent className="py-16 text-center space-y-4">
          <CreditCard className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground">
            No giving platforms configured yet.
          </p>
          <p className="text-sm text-muted-foreground">
            Seed your default platforms with clearing accounts to get started.
          </p>
          <Button asChild>
            <Link href="/settings/seed">Go to Seed Data</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {platforms.map((platform) => (
        <PlatformCard
          key={platform.id}
          platform={platform}
          accounts={accounts}
          onSaved={() => router.refresh()}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PlatformCard – individual provider card                            */
/* ------------------------------------------------------------------ */

function PlatformCard({
  platform,
  accounts,
  onSaved,
}: {
  platform: GivingPlatformRow;
  accounts: AccountOption[];
  onSaved: () => void;
}) {
  const [clearingId, setClearingId] = useState(platform.clearing_account_id);
  const [feeId, setFeeId] = useState(platform.fee_account_id);
  const [incomeId, setIncomeId] = useState(platform.donations_income_account_id ?? '');
  const [isActive, setIsActive] = useState(platform.is_active);
  const [isPending, startTransition] = useTransition();

  const assetAccounts = accounts.filter((a) => a.type === 'asset');
  const expenseAccounts = accounts.filter((a) => a.type === 'expense');
  const incomeAccounts = accounts.filter((a) => a.type === 'income');

  const hasChanges =
    clearingId !== platform.clearing_account_id ||
    feeId !== platform.fee_account_id ||
    incomeId !== (platform.donations_income_account_id ?? '') ||
    isActive !== platform.is_active;

  function handleSave() {
    startTransition(async () => {
      const result = await updateGivingPlatformMapping({
        platformId: platform.id,
        clearingAccountId: clearingId,
        feeAccountId: feeId,
        donationsIncomeAccountId: incomeId || null,
        isActive,
      });

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(
          `${PROVIDER_LABELS[platform.provider] ?? platform.provider} mapping updated.`
        );
        onSaved();
      }
    });
  }

  return (
    <Card className="border shadow-sm rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <CardTitle className="text-lg">
            {PROVIDER_LABELS[platform.provider] ?? platform.provider}
          </CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`active-${platform.id}`} className="text-xs text-muted-foreground">
            Active
          </Label>
          <Switch
            id={`active-${platform.id}`}
            checked={isActive}
            onCheckedChange={setIsActive}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Clearing Account */}
        <div className="space-y-1.5">
          <Label htmlFor={`clearing-${platform.id}`} className="text-sm font-medium">
            Clearing Account
          </Label>
          <select
            id={`clearing-${platform.id}`}
            value={clearingId}
            onChange={(e) => setClearingId(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {assetAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Asset account used as a clearing account for incoming funds.
          </p>
        </div>

        {/* Fee Account */}
        <div className="space-y-1.5">
          <Label htmlFor={`fee-${platform.id}`} className="text-sm font-medium">
            Fee Account
          </Label>
          <select
            id={`fee-${platform.id}`}
            value={feeId}
            onChange={(e) => setFeeId(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {expenseAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Expense account where platform fees are recorded.
          </p>
        </div>

        {/* Donations Income Account */}
        <div className="space-y-1.5">
          <Label htmlFor={`income-${platform.id}`} className="text-sm font-medium">
            Donations Income Account
          </Label>
          <select
            id={`income-${platform.id}`}
            value={incomeId}
            onChange={(e) => setIncomeId(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">— Use default (Donations Income) —</option>
            {incomeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Income account credited when donations are imported. Falls back to &quot;Donations Income&quot; if unset.
          </p>
        </div>

        {/* Save */}
        <Button
          onClick={handleSave}
          disabled={!hasChanges || isPending}
          className="w-full"
        >
          {isPending ? 'Saving...' : 'Save Changes'}
        </Button>
      </CardContent>
    </Card>
  );
}
