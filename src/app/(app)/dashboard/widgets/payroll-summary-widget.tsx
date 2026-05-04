'use client';

import { Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { DashboardPayrollSummary } from '@/lib/reports/types';
import { DashboardWidgetCard } from './dashboard-widget-card';

function fmtPounds(pence: number): string {
  return '£' + (pence / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function PayrollSummaryWidget({ data }: { data: DashboardPayrollSummary | null }) {
  return (
    <DashboardWidgetCard
      title="Payroll"
      href="/payroll"
      actionLabel="Details"
      tint="cyan"
    >
      {data ? (
        <>
          <div className="mb-3 flex items-center gap-2">
            <Users size={14} className="text-cyan-600 dark:text-cyan-400" />
            <span className="text-xs text-muted-foreground">{data.periodLabel}</span>
            <Badge
              variant="secondary"
              className={`ml-auto text-[10px] px-1.5 py-0 ${
                data.status === 'posted'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
              }`}
            >
              {data.status === 'posted' ? 'Posted' : 'Draft'}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Gross</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums">
                {fmtPounds(data.grossPence)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Net</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums">
                {fmtPounds(data.netPence)}
              </p>
            </div>
          </div>
        </>
      ) : (
        <div className="py-4 text-center">
          <p className="text-sm text-muted-foreground">No payroll runs yet.</p>
        </div>
      )}
    </DashboardWidgetCard>
  );
}
