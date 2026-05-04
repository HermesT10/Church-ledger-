'use client';

import { Badge } from '@/components/ui/badge';
import type { DashboardFundBalance } from '@/lib/reports/types';
import { DashboardWidgetCard } from './dashboard-widget-card';
import { cn } from '@/lib/utils';

function fmtPounds(pence: number): string {
  return '£' + (Math.abs(pence) / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const TYPE_BADGE: Record<string, string> = {
  restricted: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/40 dark:bg-violet-950/30 dark:text-violet-300',
  unrestricted: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300',
  designated: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300',
};

export function FundBalancesWidget({ data }: { data: DashboardFundBalance[] }) {
  if (data.length === 0) return null;
  const visibleFunds = data.slice(0, 5);
  const restrictedCount = data.filter((fund) => fund.fundType === 'restricted').length;
  const overspentCount = data.filter((fund) => fund.isOverspent).length;
  const totalBalancePence = data.reduce((sum, fund) => sum + fund.balancePence, 0);

  return (
    <DashboardWidgetCard title="Fund balances" href="/funds" tint="violet" contentClassName="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-muted/35 px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Funds</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">{data.length}</p>
        </div>
        <div className="rounded-2xl bg-muted/35 px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Restricted</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">{restrictedCount}</p>
        </div>
        <div className="rounded-2xl bg-muted/35 px-3 py-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Overspent</p>
          <p className={cn('mt-1 text-sm font-semibold tabular-nums', overspentCount > 0 && 'text-danger')}>{overspentCount}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border/70">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
          <p className="text-xs text-muted-foreground">Total fund balance</p>
          <p className="text-sm font-semibold tabular-nums">{totalBalancePence < 0 ? '-' : ''}{fmtPounds(totalBalancePence)}</p>
        </div>
        <div className="divide-y divide-border/60">
          {visibleFunds.map((f) => (
            <div key={f.fundId} className="flex items-center gap-3 px-3 py-2.5">
              <span className={cn('h-2 w-2 rounded-full bg-primary/50', f.isOverspent && 'bg-danger')} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{f.fundName}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className={cn('px-1.5 py-0 text-[10px]', TYPE_BADGE[f.fundType] ?? '')}
                  >
                    {f.fundType.charAt(0).toUpperCase() + f.fundType.slice(1)}
                  </Badge>
                  {f.isOverspent ? (
                    <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                      Overspent
                    </Badge>
                  ) : null}
                </div>
              </div>
              <span
                className={cn(
                  'shrink-0 text-sm font-semibold tabular-nums',
                  f.isOverspent && 'text-danger',
                )}
              >
                {f.balancePence < 0 ? '-' : ''}
                {fmtPounds(f.balancePence)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {data.length > visibleFunds.length ? (
        <p className="text-xs text-muted-foreground">
          +{data.length - visibleFunds.length} more funds available in the full funds workspace.
        </p>
      ) : null}
    </DashboardWidgetCard>
  );
}
