'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardFundBalance } from '@/lib/reports/types';

function fmtPounds(pence: number): string {
  return '£' + (Math.abs(pence) / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const TYPE_BADGE: Record<string, string> = {
  restricted: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  unrestricted: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  designated: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

export function FundBalancesWidget({ data }: { data: DashboardFundBalance[] }) {
  if (data.length === 0) return null;

  return (
    <Card className="rounded-2xl bg-violet-100/65 border-violet-200/50 shadow-sm dark:bg-violet-950/18 dark:border-violet-800/18">
      <CardHeader className="pb-2 pt-5 px-5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Fund Balances</CardTitle>
          <Link
            href="/funds"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View all
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="space-y-2.5">
          {data.slice(0, 6).map((f) => (
            <div key={f.fundId} className="flex items-center gap-3">
              <Badge
                variant="secondary"
                className={`text-[10px] px-1.5 py-0 shrink-0 ${TYPE_BADGE[f.fundType] ?? ''}`}
              >
                {f.fundType.charAt(0).toUpperCase() + f.fundType.slice(1)}
              </Badge>
              <span className="flex-1 text-sm truncate">{f.fundName}</span>
              <span className={`text-sm font-medium tabular-nums ${
                f.isOverspent ? 'text-rose-600 dark:text-rose-400' : ''
              }`}>
                {f.balancePence < 0 ? '-' : ''}{fmtPounds(f.balancePence)}
              </span>
              {f.isOverspent && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0">
                  Overspent
                </Badge>
              )}
            </div>
          ))}
        </div>
        {data.length > 6 && (
          <Link
            href="/funds"
            className="block mt-3 pt-2 border-t border-violet-200/50 dark:border-violet-800/18 text-xs text-muted-foreground hover:text-foreground transition-colors text-center"
          >
            +{data.length - 6} more funds
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
