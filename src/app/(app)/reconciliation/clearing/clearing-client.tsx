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
      {/* Sub-navigation */}
      <div className="flex gap-4 text-sm border-b">
        <Link
          href="/reconciliation"
          className="text-muted-foreground hover:text-foreground transition-colors pb-2"
        >
          Journal Matching
        </Link>
        <Link
          href="/reconciliation/statement"
          className="text-muted-foreground hover:text-foreground transition-colors pb-2"
        >
          Statement Reconciliation
        </Link>
        <span className="font-medium text-foreground border-b-2 border-primary pb-2">
          Clearing Accounts
        </span>
        <Link
          href="/reconciliation/history"
          className="text-muted-foreground hover:text-foreground transition-colors pb-2"
        >
          History
        </Link>
      </div>

      {/* Error */}
      {error && (
        <Card className="border border-destructive rounded-2xl">
          <CardContent className="py-4 text-destructive text-sm">
            {error}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title="Total Clearing Balance"
          value={`£${penceToPounds(totalBalance)}`}
          subtitle={totalBalance === 0 ? 'All clear' : 'Outstanding from platforms'}
          href="/reconciliation/clearing"
          gradient={
            totalBalance === 0
              ? 'bg-gradient-to-br from-emerald-500 to-emerald-700'
              : 'bg-gradient-to-br from-amber-500 to-amber-700'
          }
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
          gradient="bg-gradient-to-br from-violet-500 to-violet-700"
          icon={<AlertTriangle size={20} />}
        />
        <StatCard
          title="Oldest Payout"
          value={oldestDate ? formatDate(oldestDate) : '—'}
          subtitle={oldestDate ? 'Oldest unmatched payout' : 'No open payouts'}
          href="/reconciliation/clearing"
          gradient="bg-gradient-to-br from-slate-500 to-slate-700"
          icon={<Clock size={20} />}
        />
      </div>

      {/* Provider table */}
      {rows.length > 0 ? (
        <Card className="border shadow-sm rounded-2xl">
          <CardHeader>
            <CardTitle>Provider Clearing Balances</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
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
                        row.balancePence !== 0 ? 'bg-yellow-100/75' : ''
                      }
                    >
                      <TableCell className="font-medium">
                        {PROVIDER_LABELS[row.provider] ?? row.provider}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.clearingAccountName}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono ${
                          row.balancePence === 0
                            ? 'text-green-600'
                            : 'text-amber-600 font-semibold'
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
        <Card className="border shadow-sm rounded-2xl">
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
