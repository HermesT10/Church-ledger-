'use client';

import Link from 'next/link';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardBudgetVsActual } from '@/lib/reports/types';

function fmtPounds(pence: number): string {
  const abs = Math.abs(pence);
  const pounds = abs / 100;
  if (pounds >= 1000) return `£${(pounds / 1000).toFixed(1)}k`;
  return '£' + pounds.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function BudgetVsActualWidget({ data }: { data: DashboardBudgetVsActual }) {
  const isPositive = data.variancePence >= 0;

  return (
    <Card className="rounded-2xl bg-amber-100/65 border-amber-200/50 shadow-sm dark:bg-amber-950/18 dark:border-amber-800/18">
      <CardHeader className="pb-2 pt-5 px-5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Budget vs Actual</CardTitle>
          <Link
            href="/budgets"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Details
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Budget</p>
            <p className="text-lg font-bold mt-0.5 tabular-nums">{fmtPounds(data.totalBudgetPence)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Actual</p>
            <p className="text-lg font-bold mt-0.5 tabular-nums">{fmtPounds(data.totalActualPence)}</p>
          </div>
        </div>
          <div className="mt-3 pt-3 border-t border-amber-200/50 dark:border-amber-800/18 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {isPositive ? (
              <TrendingUp size={14} className="text-emerald-500" />
            ) : (
              <TrendingDown size={14} className="text-rose-500" />
            )}
            <span className="text-xs text-muted-foreground">Variance</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold tabular-nums ${
              isPositive ? 'text-emerald-600' : 'text-rose-600'
            }`}>
              {isPositive ? '+' : ''}{fmtPounds(data.variancePence)}
            </span>
            <Badge
              variant="secondary"
              className={`text-[10px] px-1.5 py-0 font-semibold ${
                isPositive
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
              }`}
            >
              {isPositive ? '+' : ''}{data.variancePct}%
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
