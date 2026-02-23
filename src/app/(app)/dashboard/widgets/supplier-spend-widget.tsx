'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardSupplierSpend } from '@/lib/reports/types';

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
    <Card className="rounded-2xl bg-orange-100/65 border-orange-200/50 shadow-sm dark:bg-orange-950/18 dark:border-orange-800/18">
      <CardHeader className="pb-2 pt-5 px-5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Top Suppliers</CardTitle>
          <Link
            href="/reports/supplier-spend"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Full report
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="space-y-3">
          {data.map((s, i) => {
            const pct = maxSpend > 0 ? (s.totalPence / maxSpend) * 100 : 0;
            return (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm truncate flex-1">{s.supplierName}</span>
                  <span className="text-sm font-medium tabular-nums ml-2">
                    {fmtPounds(s.totalPence)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-orange-50 dark:bg-orange-900/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-orange-400 dark:bg-orange-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
