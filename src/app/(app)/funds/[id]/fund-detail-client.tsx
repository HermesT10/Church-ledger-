'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  ChevronUp,
  Edit,
  TrendingUp,
  TrendingDown,
  Coins,
  ArrowRightLeft,
  BarChart3,
} from 'lucide-react';
import type {
  FundRow,
  FundDetailStats,
  FundAccountBreakdown,
  FundTransaction,
  PeriodPreset,
} from '@/lib/funds/types';
import { PERIOD_LABELS, getOverspendStatus, OVERSPEND_LABELS } from '@/lib/funds/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function penceToPounds(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  return sign + '£' + (Math.abs(pence) / 100).toFixed(2);
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const PERIODS: PeriodPreset[] = ['this_month', 'last_month', 'ytd', 'custom'];

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  fund: FundRow;
  fundTypeLabel: string;
  canEdit: boolean;
  stats: FundDetailStats | null;
  incomeAccounts: FundAccountBreakdown[];
  expenseAccounts: FundAccountBreakdown[];
  transactions: FundTransaction[];
  transactionTotal: number;
  currentPage: number;
  period: string;
  startDate: string;
  endDate: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function FundDetailClient({
  fund,
  fundTypeLabel,
  canEdit,
  stats,
  incomeAccounts,
  expenseAccounts,
  transactions,
  transactionTotal,
  currentPage,
  period,
  startDate,
  endDate,
}: Props) {
  const router = useRouter();

  const [showAllIncome, setShowAllIncome] = useState(false);
  const [showAllExpense, setShowAllExpense] = useState(false);
  const [customFrom, setCustomFrom] = useState(startDate);
  const [customTo, setCustomTo] = useState(endDate);

  const spendStatus = getOverspendStatus(fund.type, stats?.closing_balance_pence ?? 0);

  function buildUrl(overrides: Record<string, string | undefined>) {
    const base: Record<string, string> = { period };
    if (period === 'custom') {
      base.from = startDate;
      base.to = endDate;
    }
    const merged = { ...base, ...overrides };
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(merged)) {
      if (v !== undefined) clean[k] = v;
    }
    const qs = new URLSearchParams(clean).toString();
    return `/funds/${fund.id}${qs ? `?${qs}` : ''}`;
  }

  function handlePeriodChange(p: PeriodPreset) {
    if (p === 'custom') {
      router.push(buildUrl({ period: 'custom', from: customFrom, to: customTo }));
    } else {
      router.push(buildUrl({ period: p, from: undefined, to: undefined }));
    }
  }

  const pageSize = 25;
  const totalPages = Math.max(1, Math.ceil(transactionTotal / pageSize));

  const displayIncome = showAllIncome ? incomeAccounts : incomeAccounts.slice(0, 10);
  const displayExpense = showAllExpense ? expenseAccounts : expenseAccounts.slice(0, 10);

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/funds" className="text-sm text-muted-foreground hover:underline flex items-center gap-1">
            <ArrowLeft size={14} /> Back to Funds
          </Link>
          <h1 className="text-2xl font-bold mt-2">{fund.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline">{fundTypeLabel}</Badge>
            {spendStatus !== 'ok' && (
              <Badge variant="outline" className={
                spendStatus === 'overspent'
                  ? 'bg-red-100 text-red-800 border-red-200'
                  : 'bg-amber-100 text-amber-800 border-amber-200'
              }>
                {OVERSPEND_LABELS[spendStatus]}
              </Badge>
            )}
            {!fund.is_active && (
              <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200 text-xs">Inactive</Badge>
            )}
          </div>
          {fund.purpose_text && (
            <p className="text-sm text-muted-foreground mt-2">{fund.purpose_text}</p>
          )}
        </div>
        {canEdit && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/funds/${fund.id}/edit`}><Edit size={14} className="mr-1" /> Edit Fund</Link>
          </Button>
        )}
      </div>

      {/* Period Selector */}
      <div className="flex items-center gap-2 flex-wrap border rounded-lg p-3 bg-muted/20">
        <Calendar size={16} className="text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground mr-1">Period:</span>
        {PERIODS.map((p) => (
          <Button
            key={p}
            variant={period === p ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePeriodChange(p)}
          >
            {PERIOD_LABELS[p]}
          </Button>
        ))}
        {period === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-8 w-36 text-xs" />
            <span className="text-sm text-muted-foreground">to</span>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-8 w-36 text-xs" />
            <Button size="sm" variant="outline" onClick={() => {
              if (customFrom && customTo) router.push(buildUrl({ period: 'custom', from: customFrom, to: customTo }));
            }}>Apply</Button>
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-1">
                <Coins size={16} className="text-muted-foreground" />
                <p className="text-xs text-muted-foreground font-medium">Opening</p>
              </div>
              <p className="text-xl font-bold font-mono">{penceToPounds(stats.opening_balance_pence)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={16} className="text-green-600" />
                <p className="text-xs text-muted-foreground font-medium">Income</p>
              </div>
              <p className="text-xl font-bold font-mono text-green-700">{penceToPounds(stats.income_pence)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown size={16} className="text-red-600" />
                <p className="text-xs text-muted-foreground font-medium">Expenses</p>
              </div>
              <p className="text-xl font-bold font-mono text-red-700">{penceToPounds(stats.expense_pence)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-1">
                <ArrowRightLeft size={16} className="text-muted-foreground" />
                <p className="text-xs text-muted-foreground font-medium">Net</p>
              </div>
              <p className={`text-xl font-bold font-mono ${stats.net_movement_pence >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {penceToPounds(stats.net_movement_pence)}
              </p>
            </CardContent>
          </Card>
          <Card className={spendStatus !== 'ok' ? 'border-red-200 bg-red-100/55' : ''}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 size={16} className="text-muted-foreground" />
                <p className="text-xs text-muted-foreground font-medium">Closing</p>
              </div>
              <p className={`text-xl font-bold font-mono ${stats.closing_balance_pence >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {penceToPounds(stats.closing_balance_pence)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Breakdown Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp size={16} className="text-green-600" /> Income by Account
            </CardTitle>
            <CardDescription>{incomeAccounts.length} account(s)</CardDescription>
          </CardHeader>
          <CardContent>
            {incomeAccounts.length > 0 ? (
              <>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Lines</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayIncome.map((a) => (
                        <TableRow key={a.account_id}>
                          <TableCell><span className="text-xs text-muted-foreground mr-1">{a.account_code}</span> {a.account_name}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-green-700">{penceToPounds(a.net_pence)}</TableCell>
                          <TableCell className="text-right text-sm">{a.line_count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {incomeAccounts.length > 10 && (
                  <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setShowAllIncome(!showAllIncome)}>
                    {showAllIncome ? <><ChevronUp size={14} className="mr-1" /> Show less</> : <><ChevronDown size={14} className="mr-1" /> View all {incomeAccounts.length}</>}
                  </Button>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No income in this period.</p>
            )}
          </CardContent>
        </Card>

        {/* Expense breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingDown size={16} className="text-red-600" /> Expenses by Account
            </CardTitle>
            <CardDescription>{expenseAccounts.length} account(s)</CardDescription>
          </CardHeader>
          <CardContent>
            {expenseAccounts.length > 0 ? (
              <>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Lines</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayExpense.map((a) => (
                        <TableRow key={a.account_id}>
                          <TableCell><span className="text-xs text-muted-foreground mr-1">{a.account_code}</span> {a.account_name}</TableCell>
                          <TableCell className="text-right font-mono text-sm text-red-700">{penceToPounds(a.net_pence)}</TableCell>
                          <TableCell className="text-right text-sm">{a.line_count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {expenseAccounts.length > 10 && (
                  <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setShowAllExpense(!showAllExpense)}>
                    {showAllExpense ? <><ChevronUp size={14} className="mr-1" /> Show less</> : <><ChevronDown size={14} className="mr-1" /> View all {expenseAccounts.length}</>}
                  </Button>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No expenses in this period.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Transactions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Transactions</CardTitle>
          <CardDescription>
            {formatDate(startDate)} — {formatDate(endDate)} · Page {currentPage} of {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length > 0 ? (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                      <TableHead>Journal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((t) => (
                      <TableRow key={t.journal_line_id}>
                        <TableCell className="text-sm">{formatDate(t.journal_date)}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">
                          {t.description || t.journal_memo || '—'}
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="text-xs text-muted-foreground mr-1">{t.account_code}</span>
                          {t.account_name}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {t.debit_pence > 0 ? penceToPounds(t.debit_pence) : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {t.credit_pence > 0 ? penceToPounds(t.credit_pence) : '—'}
                        </TableCell>
                        <TableCell>
                          <Link href={`/journal/${t.journal_id}`} className="text-blue-600 hover:underline text-xs">
                            View
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => router.push(buildUrl({ page: String(currentPage - 1) }))}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => router.push(buildUrl({ page: String(currentPage + 1) }))}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">No transactions in this period.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
