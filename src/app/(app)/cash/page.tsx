import { getActiveOrg } from '@/lib/org';
import { getCashDashboard, ensureCashInHandAccount } from '@/lib/cash/actions';
import {
  Coins,
  TrendingUp,
  TrendingDown,
  Landmark,
  AlertTriangle,
  FileWarning,
} from 'lucide-react';
import { StatCard } from '@/components/stat-card';
import { SoftAlert } from '@/components/soft-alert';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

function formatPounds(pence: number): string {
  return '£' + (pence / 100).toFixed(2);
}

export default async function CashOverviewPage() {
  const { orgId } = await getActiveOrg();

  await ensureCashInHandAccount(orgId);

  const { data: dashboard } = await getCashDashboard(orgId);

  if (!dashboard) {
    return <p className="text-sm text-muted-foreground">Failed to load dashboard.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Dashboard cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Cash-in-Hand"
          value={formatPounds(dashboard.cashInHandPence)}
          subtitle="Current balance"
          href="/cash/ledger"
          tint="emerald"
          icon={<Coins size={20} />}
        />
        <StatCard
          title="Total Collected"
          value={formatPounds(dashboard.totalCollectedPence)}
          subtitle="All time"
          href="/cash/collections"
          tint="blue"
          icon={<TrendingUp size={20} />}
        />
        <StatCard
          title="Total Spent"
          value={formatPounds(dashboard.totalSpentPence)}
          subtitle="All time"
          href="/cash/spends"
          tint="rose"
          icon={<TrendingDown size={20} />}
        />
        <StatCard
          title="Unbanked Cash"
          value={formatPounds(dashboard.unbankedPence)}
          subtitle="Ready to deposit"
          href="/cash/deposits"
          tint="amber"
          icon={<Landmark size={20} />}
        />
      </div>

      {/* Alert cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {dashboard.unbankedPence > 0 && (
          <SoftAlert variant="warning" icon={<AlertTriangle className="h-5 w-5" />}>
            <p className="font-medium">
              {formatPounds(dashboard.unbankedPence)} waiting to be banked
            </p>
            <p className="text-xs opacity-80 mt-0.5">
              Posted collections that have not been deposited to a bank account.
            </p>
            <Button asChild variant="link" className="px-0 h-auto mt-1 text-amber-700">
              <Link href="/cash/deposits/new">Create Deposit</Link>
            </Button>
          </SoftAlert>
        )}

        {dashboard.missingSignatures > 0 && (
          <SoftAlert variant="error" icon={<FileWarning className="h-5 w-5" />}>
            <p className="font-medium">
              {dashboard.missingSignatures} collection(s) missing confirmation
            </p>
            <p className="text-xs opacity-80 mt-0.5">
              Both counters must confirm before a collection can be posted.
            </p>
            <Button asChild variant="link" className="px-0 h-auto mt-1 text-red-700">
              <Link href="/cash/collections">View Collections</Link>
            </Button>
          </SoftAlert>
        )}

        {dashboard.draftCollections > 0 && dashboard.missingSignatures === 0 && (
          <SoftAlert variant="info" icon={<Coins className="h-5 w-5" />}>
            <p className="font-medium">
              {dashboard.draftCollections} draft collection(s) ready to post
            </p>
            <p className="text-xs opacity-80 mt-0.5">
              Both signatures confirmed. Post to create GL entries.
            </p>
          </SoftAlert>
        )}

        {dashboard.cashInHandPence < 0 && (
          <SoftAlert variant="error" icon={<AlertTriangle className="h-5 w-5" />}>
            <p className="font-medium">
              Cash-in-Hand is negative: {formatPounds(dashboard.cashInHandPence)}
            </p>
            <p className="text-xs opacity-80 mt-0.5">
              This may indicate a timing issue or data error. Review recent cash transactions.
            </p>
          </SoftAlert>
        )}
      </div>
    </div>
  );
}
