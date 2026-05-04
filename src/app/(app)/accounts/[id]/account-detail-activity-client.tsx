'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { AccountActivityRow } from '@/lib/accounts/balances';
import type { AccountType } from '@/lib/accounts/types';
import { buildAccountTransactionSummaryRows } from '@/lib/accounts/transaction-summary';
import { MoneyAmount } from '@/components/money/money-amount';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

type TabKey = 'summary' | 'lines';

export function AccountDetailActivityClient(props: {
  accountType: AccountType;
  activity: AccountActivityRow[];
  totalLines: number;
}) {
  const { accountType, activity, totalLines } = props;
  const [tab, setTab] = useState<TabKey>('summary');

  const summaryRows = useMemo(
    () => buildAccountTransactionSummaryRows(activity, accountType),
    [activity, accountType],
  );

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Account activity</CardTitle>
            <CardDescription className="mt-1.5 max-w-2xl">
              <strong>Transaction summary</strong> rolls journal lines into one row per posted journal (donation, bank
              match, manual entry, reversal, etc.). Use <strong>Journal lines</strong> for raw debit/credit detail.
              Debits increase asset/expense balances; credits increase liability/income balances — net here is for this
              account only.
            </CardDescription>
          </div>
          <div className="flex shrink-0 gap-1 rounded-lg border border-border/80 bg-muted/40 p-1">
            <Button
              type="button"
              variant={tab === 'summary' ? 'default' : 'ghost'}
              size="sm"
              className={cn('rounded-md', tab !== 'summary' && 'shadow-none')}
              onClick={() => setTab('summary')}
            >
              Transaction summary
            </Button>
            <Button
              type="button"
              variant={tab === 'lines' ? 'default' : 'ghost'}
              size="sm"
              className={cn('rounded-md', tab !== 'lines' && 'shadow-none')}
              onClick={() => setTab('lines')}
            >
              Journal lines
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Showing {activity.length} of {totalLines} posted line{totalLines === 1 ? '' : 's'} loaded on this page.
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {tab === 'summary' ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Journal</TableHead>
                <TableHead>Reference / memo</TableHead>
                <TableHead>Fund</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaryRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground text-sm">
                    No posted journal lines yet.
                  </TableCell>
                </TableRow>
              ) : (
                summaryRows.map((r) => (
                  <TableRow key={r.journal_id}>
                    <TableCell className="whitespace-nowrap">{r.journal_date}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-sm">{r.kind_label}</span>
                        {r.badges.includes('reversal') && (
                          <Badge variant="secondary" className="text-xs">
                            Reversal
                          </Badge>
                        )}
                        {r.badges.includes('reversed_original') && (
                          <Badge variant="outline" className="text-xs">
                            Superseded
                          </Badge>
                        )}
                        {r.badges.includes('warning') && r.warnings.length > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            Check
                          </Badge>
                        )}
                      </div>
                      {r.warnings.length > 0 && (
                        <ul className="mt-1 list-inside list-disc text-xs text-warning">
                          {r.warnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link className="text-primary underline text-sm" href={`/journals/${r.journal_id}`}>
                        {r.line_count > 1 ? `${r.line_count} lines` : 'View'}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[14rem] text-sm text-muted-foreground">
                      {[r.reference, r.memo].filter(Boolean).join(' — ') || '—'}
                    </TableCell>
                    <TableCell className="text-sm">{r.fund_labels.length ? r.fund_labels.join(', ') : '—'}</TableCell>
                    <TableCell className="text-right">
                      <MoneyAmount amountPence={r.debit_pence} toneMode="neutral" size="sm" />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyAmount amountPence={r.credit_pence} toneMode="neutral" size="sm" />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyAmount amountPence={r.net_pence} semantic="ledger_net" size="sm" />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Journal</TableHead>
                <TableHead>Fund</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activity.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground text-sm">
                    No posted journal lines yet.
                  </TableCell>
                </TableRow>
              ) : (
                activity.map((r) => (
                  <TableRow key={r.journal_line_id}>
                    <TableCell className="whitespace-nowrap">{r.journal_date}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Link className="text-primary underline text-sm" href={`/journals/${r.journal_id}`}>
                          View
                        </Link>
                        {r.reversal_of && (
                          <span className="text-xs text-muted-foreground">
                            Reversal of{' '}
                            <Link className="text-primary underline" href={`/journals/${r.reversal_of}`}>
                              original
                            </Link>
                          </span>
                        )}
                        {r.reversed_by && (
                          <span className="text-xs text-muted-foreground">
                            Superseded by{' '}
                            <Link className="text-primary underline" href={`/journals/${r.reversed_by}`}>
                              reversal
                            </Link>
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{r.fund_name ?? '—'}</TableCell>
                    <TableCell className="max-w-[12rem] truncate text-sm text-muted-foreground">
                      {r.description || r.memo || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyAmount amountPence={r.debit_pence} toneMode="neutral" size="sm" />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyAmount amountPence={r.credit_pence} toneMode="neutral" size="sm" />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyAmount amountPence={r.net_pence} semantic="ledger_net" size="sm" />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
