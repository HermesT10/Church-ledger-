'use client';

import Link from 'next/link';
import { Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardPayrollSummary } from '@/lib/reports/types';

function fmtPounds(pence: number): string {
  return '£' + (pence / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function PayrollSummaryWidget({ data }: { data: DashboardPayrollSummary | null }) {
  return (
    <Card className="rounded-2xl bg-cyan-100/65 border-cyan-200/50 shadow-sm dark:bg-cyan-950/18 dark:border-cyan-800/18">
      <CardHeader className="pb-2 pt-5 px-5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Payroll</CardTitle>
          <Link
            href="/payroll"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Details
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        {data ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <Users size={14} className="text-cyan-600 dark:text-cyan-400" />
              <span className="text-xs text-muted-foreground">{data.periodLabel}</span>
              <Badge
                variant="secondary"
                className={`text-[10px] px-1.5 py-0 ml-auto ${
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
                <p className="text-sm font-bold mt-0.5 tabular-nums">{fmtPounds(data.grossPence)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Net</p>
                <p className="text-sm font-bold mt-0.5 tabular-nums">{fmtPounds(data.netPence)}</p>
              </div>
            </div>
          </>
        ) : (
          <div className="py-4 text-center">
            <p className="text-sm text-muted-foreground">No payroll runs yet.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
