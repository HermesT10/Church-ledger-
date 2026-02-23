'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DashboardRecentTxn } from '@/lib/reports/types';

function fmtPounds(pence: number): string {
  return '£' + (pence / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const TYPE_LABELS: Record<string, string> = {
  manual: 'Manual',
  bill: 'Invoice',
  payment: 'Payment',
  gift_aid: 'Gift Aid',
  payroll: 'Payroll',
  cash_spend: 'Cash',
  donation: 'Donation',
};

export function RecentTransactionsWidget({ data }: { data: DashboardRecentTxn[] }) {
  if (data.length === 0) return null;

  return (
    <Card className="rounded-2xl bg-slate-100/65 border-slate-200/50 shadow-sm dark:bg-slate-950/18 dark:border-slate-800/18">
      <CardHeader className="pb-2 pt-5 px-5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Recent Transactions</CardTitle>
          <Link
            href="/journals"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View all
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="space-y-2">
          {data.map((txn) => (
            <Link
              key={txn.id}
              href={`/journals/${txn.id}`}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 text-sm hover:bg-muted/50 transition-colors"
            >
              <span className="text-xs text-muted-foreground w-12 shrink-0 tabular-nums">
                {fmtDate(txn.date)}
              </span>
              <span className="flex-1 truncate">{txn.description}</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                {TYPE_LABELS[txn.type] ?? txn.type}
              </Badge>
              <span className="text-sm font-medium tabular-nums shrink-0">
                {fmtPounds(txn.amountPence)}
              </span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
