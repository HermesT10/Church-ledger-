'use client';

import Link from 'next/link';
import { Landmark } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardCashPosition } from '@/lib/reports/types';

function fmtPounds(pence: number): string {
  return '£' + (pence / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function CashPositionWidget({ data }: { data: DashboardCashPosition[] }) {
  if (data.length === 0) return null;

  const total = data.reduce((s, d) => s + d.glBalancePence, 0);

  return (
    <Card className="rounded-2xl bg-blue-100/70 border-blue-200/50 shadow-sm dark:bg-blue-950/20 dark:border-blue-800/20">
      <CardHeader className="pb-2 pt-5 px-5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Cash Position</CardTitle>
          <Link
            href="/banking"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View all
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="space-y-3">
          {data.map((ba) => (
            <div key={ba.bankAccountId} className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                <Landmark size={13} className="text-blue-600 dark:text-blue-400" />
              </div>
              <span className="flex-1 text-sm truncate">{ba.bankAccountName}</span>
              <span className="text-sm font-medium tabular-nums">
                {fmtPounds(ba.glBalancePence)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-3 border-t border-blue-200/50 dark:border-blue-800/20 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Total</span>
          <span className="text-sm font-bold tabular-nums">{fmtPounds(total)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
