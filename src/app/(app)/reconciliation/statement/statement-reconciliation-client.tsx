'use client';

import { useState, useCallback, useTransition, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  CheckCircle2,
  AlertCircle,
  Lock,
  DollarSign,
  ArrowRight,
  Search,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  getLastReconciliation,
  startReconciliation,
  getClearableLines,
  toggleClearLine,
  getReconciliationSummary,
  finalizeReconciliation,
} from '@/lib/reconciliation/actions';
import type {
  ReconciliationRow,
  ClearableBankLine,
  ReconciliationSummary,
} from '@/lib/reconciliation/types';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  bankAccounts: { id: string; name: string }[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function penceToPounds(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  return `${sign}£${(Math.abs(pence) / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function StatementReconciliationClient({ bankAccounts }: Props) {
  const [selectedBankId, setSelectedBankId] = useState(bankAccounts[0]?.id ?? '');
  const [isPending, startTransition] = useTransition();

  // Setup state
  const [statementDate, setStatementDate] = useState('');
  const [statementBalanceInput, setStatementBalanceInput] = useState('');
  const [lastReconciliation, setLastReconciliation] = useState<ReconciliationRow | null>(null);

  // Active reconciliation state
  const [activeRec, setActiveRec] = useState<ReconciliationRow | null>(null);
  const [lines, setLines] = useState<ClearableBankLine[]>([]);
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Pagination
  const PAGE_SIZE = 50;
  const [currentPage, setCurrentPage] = useState(0);

  // Load the last reconciliation when bank account changes
  useEffect(() => {
    if (!selectedBankId) return;
    startTransition(async () => {
      const res = await getLastReconciliation(selectedBankId);
      setLastReconciliation(res.data);
      setActiveRec(null);
      setLines([]);
      setSummary(null);
    });
  }, [selectedBankId]);

  // Refresh summary whenever lines change
  const refreshSummary = useCallback(async () => {
    if (!activeRec) return;
    const res = await getReconciliationSummary({
      reconciliationId: activeRec.id,
      bankAccountId: activeRec.bank_account_id,
      statementDate: activeRec.statement_date,
    });
    if (res.data) setSummary(res.data);
  }, [activeRec]);

  // Start reconciliation
  const handleStart = useCallback(() => {
    if (!selectedBankId || !statementDate || !statementBalanceInput) {
      toast.error('Please fill in all fields.');
      return;
    }

    const balancePence = Math.round(parseFloat(statementBalanceInput) * 100);
    if (isNaN(balancePence)) {
      toast.error('Invalid closing balance amount.');
      return;
    }

    startTransition(async () => {
      const res = await startReconciliation({
        bankAccountId: selectedBankId,
        statementDate,
        statementClosingBalancePence: balancePence,
      });

      if (res.error) {
        toast.error(res.error);
        return;
      }

      if (res.data) {
        setActiveRec(res.data);
        // Load clearable lines
        const linesRes = await getClearableLines({
          bankAccountId: selectedBankId,
          statementDate,
          reconciliationId: res.data.id,
        });
        setLines(linesRes.data);
        setCurrentPage(0);

        // Load summary
        const summaryRes = await getReconciliationSummary({
          reconciliationId: res.data.id,
          bankAccountId: selectedBankId,
          statementDate,
        });
        if (summaryRes.data) setSummary(summaryRes.data);
        toast.success('Reconciliation started.');
      }
    });
  }, [selectedBankId, statementDate, statementBalanceInput]);

  // Toggle cleared status
  const handleToggleClear = useCallback(
    async (lineId: string, currentCleared: boolean) => {
      if (!activeRec) return;
      const res = await toggleClearLine({
        reconciliationId: activeRec.id,
        bankLineId: lineId,
        cleared: !currentCleared,
      });

      if (res.error) {
        toast.error(res.error);
        return;
      }

      // Update local state optimistically
      setLines((prev) =>
        prev.map((l) => (l.id === lineId ? { ...l, cleared: !currentCleared } : l)),
      );

      // Refresh summary from server
      await refreshSummary();
    },
    [activeRec, refreshSummary],
  );

  // Finalize
  const handleFinalize = useCallback(() => {
    if (!activeRec) return;
    startTransition(async () => {
      const res = await finalizeReconciliation(activeRec.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success('Reconciliation finalized and locked.');
      setActiveRec(null);
      setLines([]);
      setSummary(null);
      setStatementDate('');
      setStatementBalanceInput('');
      // Reload last reconciliation
      const lastRes = await getLastReconciliation(selectedBankId);
      setLastReconciliation(lastRes.data);
    });
  }, [activeRec, selectedBankId]);

  // Clear all / Select all
  const handleSelectAll = useCallback(async () => {
    if (!activeRec) return;
    const unclearedLines = lines.filter((l) => !l.cleared);
    for (const line of unclearedLines) {
      await toggleClearLine({
        reconciliationId: activeRec.id,
        bankLineId: line.id,
        cleared: true,
      });
    }
    setLines((prev) => prev.map((l) => ({ ...l, cleared: true })));
    await refreshSummary();
  }, [activeRec, lines, refreshSummary]);

  const handleClearAll = useCallback(async () => {
    if (!activeRec) return;
    const clearedLines = lines.filter((l) => l.cleared);
    for (const line of clearedLines) {
      await toggleClearLine({
        reconciliationId: activeRec.id,
        bankLineId: line.id,
        cleared: false,
      });
    }
    setLines((prev) => prev.map((l) => ({ ...l, cleared: false })));
    await refreshSummary();
  }, [activeRec, lines, refreshSummary]);

  // Filtered + paginated lines
  const filteredLines = useMemo(() => {
    if (!searchTerm.trim()) return lines;
    const term = searchTerm.toLowerCase();
    return lines.filter(
      (l) =>
        l.description?.toLowerCase().includes(term) ||
        l.reference?.toLowerCase().includes(term) ||
        penceToPounds(l.amount_pence).includes(term),
    );
  }, [lines, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredLines.length / PAGE_SIZE));
  const pagedLines = filteredLines.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const openingBalanceDisplay = lastReconciliation
    ? penceToPounds(lastReconciliation.statement_closing_balance_pence)
    : '£0.00';

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <div className="space-y-6">
      <div className="app-tab-bar">
        <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link
          href="/reconciliation"
          className="app-tab-link"
        >
          Journal Matching
        </Link>
        <span className="app-tab-link-active">
          Statement Reconciliation
        </span>
        <Link
          href="/reconciliation/clearing"
          className="app-tab-link"
        >
          Clearing Accounts
        </Link>
        <Link
          href="/reconciliation/history"
          className="app-tab-link"
        >
          History
        </Link>
        </div>
      </div>

      {/* ---- SETUP SECTION ---- */}
      {!activeRec && (
        <Card className="app-surface">
          <CardHeader>
            <CardTitle>Statement Reconciliation Setup</CardTitle>
            <CardDescription>
              Select a bank account and enter the statement details from your bank.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Last reconciliation info */}
            {lastReconciliation && (
              <div className="rounded-[1.25rem] border border-blue-200/80 bg-blue-50/80 p-4 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
                <p className="font-medium">Last Reconciliation</p>
                <p className="mt-1">
                  Date: {formatDate(lastReconciliation.statement_date)} · Closing Balance:{' '}
                  {penceToPounds(lastReconciliation.statement_closing_balance_pence)} ·{' '}
                  {lastReconciliation.lines_cleared} lines cleared
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Bank Account */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Bank Account</label>
                <select
                  value={selectedBankId}
                  onChange={(e) => setSelectedBankId(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {bankAccounts.map((ba) => (
                    <option key={ba.id} value={ba.id}>
                      {ba.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Statement Date */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Statement Date</label>
                <input
                  type="date"
                  value={statementDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setStatementDate(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              {/* Statement Closing Balance */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Statement Closing Balance (£)</label>
                <input
                  type="number"
                  step="0.01"
                  value={statementBalanceInput}
                  onChange={(e) => setStatementBalanceInput(e.target.value)}
                  placeholder="e.g. 5685.20"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              {/* Opening Balance (computed) */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Opening Balance</label>
                <div className="flex h-9 items-center rounded-md border border-input bg-muted px-3 text-sm font-mono">
                  {openingBalanceDisplay}
                </div>
              </div>
            </div>

            <Button
              onClick={handleStart}
              disabled={isPending || !selectedBankId || !statementDate || !statementBalanceInput}
              className="mt-2"
            >
              {isPending ? 'Starting...' : 'Start Reconciliation'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ---- ACTIVE RECONCILIATION ---- */}
      {activeRec && summary && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="app-surface p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">Opening Balance</p>
                <DollarSign className="h-5 w-5 text-slate-400" />
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-800">
                {penceToPounds(summary.openingBalancePence)}
              </p>
            </div>

            <div className="app-surface border-blue-200/60 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">Cleared Total</p>
                <CheckCircle2 className="h-5 w-5 text-blue-500" />
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-800">
                {penceToPounds(summary.openingBalancePence + summary.clearedTotalPence)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {summary.clearedCount} of {summary.totalLines} lines
              </p>
            </div>

            <div className="app-surface border-emerald-200/60 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">Statement Balance</p>
                <DollarSign className="h-5 w-5 text-emerald-500" />
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-800">
                {penceToPounds(summary.statementBalancePence)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {activeRec.statement_date}
              </p>
            </div>

            <div
              className={`app-surface p-5 ${
                summary.isBalanced
                  ? 'border-emerald-200/70'
                  : 'border-rose-200/70'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">Difference</p>
                {summary.isBalanced ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-rose-500" />
                )}
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-800">
                {penceToPounds(summary.differencePence)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {summary.isBalanced ? 'Balanced — ready to finalize' : 'Must be £0.00 to finalize'}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="app-filter-bar justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search lines..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(0);
                  }}
                  className="flex h-9 rounded-md border border-input bg-transparent pl-8 pr-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring w-56"
                />
              </div>
              <Button variant="outline" size="sm" onClick={handleSelectAll}>
                Select All
              </Button>
              <Button variant="outline" size="sm" onClick={handleClearAll}>
                Clear All
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActiveRec(null);
                  setLines([]);
                  setSummary(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleFinalize}
                disabled={isPending || !summary.isBalanced}
                className={
                  summary.isBalanced
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : ''
                }
              >
                {isPending ? 'Finalizing...' : (
                  <>
                    <Lock className="mr-2 h-4 w-4" />
                    Finalize Reconciliation
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Bank lines table */}
          <Card className="app-surface">
            <CardContent className="pt-4">
              <div className="app-table-shell">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <span className="sr-only">Cleared</span>
                      </TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedLines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No bank lines found for this period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      pagedLines.map((line) => (
                        <TableRow
                          key={line.id}
                          className={`cursor-pointer transition-colors ${
                            line.cleared
                              ? 'bg-emerald-50/85 hover:bg-emerald-100/70 dark:bg-green-950/20 dark:hover:bg-green-950/40'
                              : 'hover:bg-slate-50/85'
                          }`}
                          onClick={() => handleToggleClear(line.id, line.cleared)}
                        >
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={line.cleared}
                              onChange={() => handleToggleClear(line.id, line.cleared)}
                              onClick={(e) => e.stopPropagation()}
                              className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {formatDate(line.txn_date)}
                          </TableCell>
                          <TableCell className="max-w-[250px] truncate text-sm">
                            {line.description ?? '—'}
                          </TableCell>
                          <TableCell className="font-mono text-xs max-w-[150px] truncate">
                            {line.reference ?? '—'}
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono text-sm ${
                              line.amount_pence >= 0 ? 'app-table-amount-positive' : 'app-table-amount-negative'
                            }`}
                          >
                            {penceToPounds(line.amount_pence)}
                          </TableCell>
                          <TableCell>
                            {line.allocated ? (
                              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                Allocated
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs bg-gray-50 text-gray-500 border-gray-200">
                                Unallocated
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between border-t border-slate-200/80 pt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {currentPage * PAGE_SIZE + 1}–
                    {Math.min((currentPage + 1) * PAGE_SIZE, filteredLines.length)} of{' '}
                    {filteredLines.length} lines
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage === 0}
                      onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={currentPage >= totalPages - 1}
                      onClick={() => setCurrentPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
