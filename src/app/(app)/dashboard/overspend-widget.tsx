'use client';

import Link from 'next/link';
import type { SOverspendAlert } from '@/lib/reports/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function penceToPounds(pence: number): string {
  const abs = Math.abs(pence);
  const formatted = (abs / 100).toFixed(2);
  return pence < 0 ? `-£${formatted}` : `£${formatted}`;
}

function pctDisplay(pct: number | null): string {
  if (pct === null) return '—';
  return `${(pct * 100).toFixed(1)}%`;
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  alerts: SOverspendAlert[];
  year: number;
  budgetCount?: number;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function OverspendWidget({ alerts, year, budgetCount }: Props) {
  return (
    <Card className="border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">
          Overspend Alerts
        </CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/reports/budget-vs-actual">
            View Report
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {budgetCount !== undefined && budgetCount === 0 ? (
              <div className="flex flex-col items-center text-center py-4">
                <p>Set budgets to enable overspend alerts.</p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/budgets">Manage Budgets</Link>
                </Button>
              </div>
            ) : (
              <p>
                All spending within budget for {year}. No alerts to show.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => (
              <Link
                key={alert.accountId}
                href={`/reports/budget-vs-actual`}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Badge
                    variant={alert.accountType === 'expense' ? 'destructive' : 'secondary'}
                    className="text-[10px] px-1.5 py-0 leading-tight shrink-0"
                  >
                    {alert.accountType === 'expense' ? 'overspend' : 'under-income'}
                  </Badge>
                  <span className="truncate font-medium">{alert.accountName}</span>
                </div>

                <div className="flex items-center gap-4 shrink-0 ml-4">
                  <span className="tabular-nums font-medium text-destructive">
                    {penceToPounds(alert.adverseVariancePence)}
                  </span>
                  <span className="tabular-nums text-muted-foreground w-16 text-right">
                    {pctDisplay(alert.adverseVariancePct)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
