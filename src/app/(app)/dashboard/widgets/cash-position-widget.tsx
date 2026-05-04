'use client';

import { Landmark } from 'lucide-react';
import type { DashboardCashPosition } from '@/lib/reports/types';
import { DashboardWidgetCard } from './dashboard-widget-card';

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
    <DashboardWidgetCard title="Cash position" href="/banking" tint="blue">
      <div className="space-y-3">
        {data.map((ba) => (
          <div key={ba.bankAccountId} className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100/90 dark:bg-blue-900/25">
              <Landmark size={14} className="text-blue-600 dark:text-blue-400" />
            </div>
            <span className="flex-1 text-sm truncate">{ba.bankAccountName}</span>
            <span className="text-sm font-medium tabular-nums">
              {fmtPounds(ba.glBalancePence)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-4">
        <span className="text-xs font-medium text-muted-foreground">Total</span>
        <span className="text-sm font-bold tabular-nums">{fmtPounds(total)}</span>
      </div>
    </DashboardWidgetCard>
  );
}
