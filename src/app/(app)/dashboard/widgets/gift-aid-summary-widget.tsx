'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DashboardGiftAidSummary } from '@/lib/reports/types';

function fmtPounds(pence: number): string {
  return '£' + (pence / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function GiftAidSummaryWidget({ data }: { data: DashboardGiftAidSummary }) {
  return (
    <Card className="rounded-2xl bg-pink-100/65 border-pink-200/50 shadow-sm dark:bg-pink-950/18 dark:border-pink-800/18">
      <CardHeader className="pb-2 pt-5 px-5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Gift Aid</CardTitle>
          <Link
            href="/gift-aid"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Manage
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Reclaimable</p>
            <p className="text-sm font-bold mt-0.5 tabular-nums">{fmtPounds(data.estimatedReclaimPence)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Claimed</p>
            <p className="text-sm font-bold mt-0.5 tabular-nums">{fmtPounds(data.claimedPence)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="text-sm font-bold mt-0.5 tabular-nums text-pink-600 dark:text-pink-400">
              {fmtPounds(data.outstandingPence)}
            </p>
          </div>
        </div>
        {data.donorsMissingDeclarations > 0 && (
          <div className="mt-3 pt-3 border-t border-pink-200/50 dark:border-pink-800/18 flex items-center gap-2">
            <AlertTriangle size={13} className="text-amber-500 shrink-0" />
            <span className="text-xs text-muted-foreground">
              {data.donorsMissingDeclarations} donor{data.donorsMissingDeclarations === 1 ? '' : 's'} missing declaration
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
