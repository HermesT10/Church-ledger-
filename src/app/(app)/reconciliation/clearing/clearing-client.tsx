'use client';

import Link from 'next/link';
import {
  Wallet,
  AlertTriangle,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/stat-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PROVIDER_LABELS } from '@/lib/giving-platforms/types';
import type { ClearingProviderRow } from '@/lib/reconciliation/clearingReport';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  rows: ClearingProviderRow[];
  error: string | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function penceToPounds(pence: number): string {
  return (Math.abs(pence) / 100).toFixed(2);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function statusBadge(status: string) {
  switch (status) {
    case 'clear':
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200">
          Clear
        </Badge>
      );
    case 'outstanding':
      return (
        <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
          Outstanding
        </Badge>
      );
    case 'overdue':
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200">
          Overdue
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ClearingClient({ rows, error }: Props) {
  const totalBalance = rows.reduce((s, r) => s + r.balancePence, 0);
  const outstandingProviders = rows.filter((r) => r.status !== 'clear').length;
  const allDates = rows
    .map((r) => r.oldestOpenPayoutDate)
    .filter(Boolean)
    .sort();
  const oldestDate = allDates[0] ?? null;

  return (
    <div className="space-y-8">
      <div className="app-tab-bar">
        <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          href="/reconciliation"
          className="app-tab-link"
        >
          Journal Matching
        </Link>
        <Link
          href="/reconciliation/statement"
          className="app-tab-link"
        >
          Statement Reconciliation
        </Link>
        <span className="app-tab-link-active">
          Clearing Accounts
        </span>
        <Link
          href="/reconciliation/history"
          className="app-tab-link"
        >
          History
        </Link>
        </div>
      </div>

      {/* Error */}
      {error && (
        <Card className="border border-destructive/40 rounded-[1.5rem] bg-rose-50/50">
          <CardContent className="py-4 text-destructive text-sm">
            {error}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          title="Total Clearing Balance"
          value={`£${penceToPounds(totalBalance)}`}
          subtitle={totalBalance === 0 ? 'All clear' : 'Outstanding from platforms'}
          href="/reconciliation/clearing"
          tint={totalBalance === 0 ? 'emerald' : 'amber'}
          icon={<Wallet size={20} />}
        />
        <StatCard
          title="Providers Outstanding"
          value={outstandingProviders}
          subtitle={
            outstandingProviders === 0
              ? 'All providers reconciled'
              : `${outstandingProviders} provider(s) with balance`
          }
          href="/reconciliation/clearing"
          tint="violet"
          icon={<AlertTriangle size={20} />}
        />
        <StatCard
          title="Oldest Payout"
          value={oldestDate ? formatDate(oldestDate) : '—'}
          subtitle={oldestDate ? 'Oldest unmatched payout' : 'No open payouts'}
          href="/reconciliation/clearing"
          tint="slate"
          icon={<Clock size={20} />}
        />
      </div>

      {/* Provider table */}
      {rows.length > 0 ? (
        <Card className="app-surface">
          <CardHeader>
            <CardTitle>Provider Clearing Balances</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="app-table-shell">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Clearing Account</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">Open Payouts</TableHead>
                    <TableHead>Oldest Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.provider}
                      className={
                        row.balancePence !== 0 ? 'bg-amber-50/80' : ''
                      }
                    >
                      <TableCell className="font-medium">
                        {PROVIDER_LABELS[row.provider] ?? row.provider}
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {row.clearingAccountName}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono ${
                          row.balancePence === 0
                            ? 'app-table-amount-positive'
                            : 'font-semibold text-amber-600'
                        }`}
                      >
                        £{penceToPounds(row.balancePence)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {row.openPayoutCount}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(row.oldestOpenPayoutDate)}
                      </TableCell>
                      <TableCell>{statusBadge(row.status)}</TableCell>
                      <TableCell>
                        <Button asChild variant="outline" size="sm">
                          <Link href="/reconciliation">
                            View Payouts
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="app-empty-state">
          <CardContent className="py-12 text-center space-y-3">
            <CheckCircle2 className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">
              No giving platforms configured yet.
            </p>
            <p className="text-sm text-muted-foreground">
              Set up giving platforms and import CSVs to see clearing balances.
            </p>
            <Button asChild variant="outline">
              <Link href="/giving-platforms">Configure Platforms</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
