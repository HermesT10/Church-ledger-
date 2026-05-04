'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { DashboardRecentTxn } from '@/lib/reports/types';
import { DashboardWidgetCard } from './dashboard-widget-card';

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
    <DashboardWidgetCard title="Recent transactions" href="/journals" tint="slate">
      <div className="space-y-2">
        {data.map((txn) => (
          <Link
            key={txn.id}
            href={`/journals/${txn.id}`}
            className="flex items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 text-sm transition-colors hover:bg-muted/50"
          >
            <span className="w-12 shrink-0 text-xs tabular-nums text-muted-foreground">
              {fmtDate(txn.date)}
            </span>
            <span className="flex-1 truncate">{txn.description}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
              {TYPE_LABELS[txn.type] ?? txn.type}
            </Badge>
            <span className="shrink-0 text-sm font-medium tabular-nums">
              {fmtPounds(txn.amountPence)}
            </span>
          </Link>
        ))}
      </div>
    </DashboardWidgetCard>
  );
}
