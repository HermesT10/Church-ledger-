'use client';

import type { DashboardSupplierSpend } from '@/lib/reports/types';
import { DashboardWidgetCard } from './dashboard-widget-card';

function fmtPounds(pence: number): string {
  return '£' + (pence / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function SupplierSpendWidget({ data }: { data: DashboardSupplierSpend[] }) {
  if (data.length === 0) return null;

  const maxSpend = data[0]?.totalPence ?? 1;

  return (
    <DashboardWidgetCard
      title="Top suppliers"
      href="/reports/supplier-spend"
      actionLabel="Full report"
      tint="orange"
    >
      <div className="space-y-3">
        {data.map((s, i) => {
          const pct = maxSpend > 0 ? (s.totalPence / maxSpend) * 100 : 0;
          return (
            <div key={i}>
              <div className="mb-1 flex items-center justify-between">
                <span className="flex-1 truncate text-sm">{s.supplierName}</span>
                <span className="ml-2 text-sm font-medium tabular-nums">
                  {fmtPounds(s.totalPence)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-orange-100 dark:bg-orange-900/10">
                <div
                  className="h-full rounded-full bg-orange-400 dark:bg-orange-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </DashboardWidgetCard>
  );
}
