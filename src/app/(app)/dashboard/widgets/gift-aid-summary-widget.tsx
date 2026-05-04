'use client';

import { AlertTriangle } from 'lucide-react';
import type { DashboardGiftAidSummary } from '@/lib/reports/types';
import { DashboardWidgetCard } from './dashboard-widget-card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

function fmtPounds(pence: number): string {
  return '£' + (pence / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function GiftAidSummaryWidget({ data }: { data: DashboardGiftAidSummary }) {
  const hasClaimValue = data.estimatedReclaimPence > 0 || data.claimedPence > 0 || data.outstandingPence > 0;

  return (
    <DashboardWidgetCard
      title="Gift Aid"
      href="/gift-aid"
      actionLabel="Manage"
      tint="pink"
    >
      {hasClaimValue ? (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Reclaimable</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums">
              {fmtPounds(data.estimatedReclaimPence)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Claimed</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums">
              {fmtPounds(data.claimedPence)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums text-pink-600 dark:text-pink-400">
              {fmtPounds(data.outstandingPence)}
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/70 p-4">
          <p className="text-sm font-medium">No Gift Aid claim value yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Add eligible donations and declarations before preparing a claim batch.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link href="/gift-aid/new">Prepare claim</Link>
          </Button>
        </div>
      )}
      {data.donorsMissingDeclarations > 0 ? (
        <div className="mt-4 flex items-center gap-2 border-t border-border/40 pt-4">
          <AlertTriangle size={13} className="text-amber-500 shrink-0" />
          <span className="text-xs text-muted-foreground">
            {data.donorsMissingDeclarations} donor
            {data.donorsMissingDeclarations === 1 ? '' : 's'} missing declaration
          </span>
        </div>
      ) : null}
    </DashboardWidgetCard>
  );
}
