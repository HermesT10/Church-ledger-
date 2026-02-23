'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { saveBudgetGrid } from '@/lib/budgets/actions';
import { MONTH_KEYS } from '@/lib/budgets/budgetMath';
import type { BudgetGrid, BudgetGridLine, GridUpdate } from '@/lib/budgets/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function lineKey(accountId: string, fundId: string | null): string {
  return `${accountId}::${fundId ?? 'null'}`;
}

function cellKey(accountId: string, fundId: string | null, monthIndex: number): string {
  return `${accountId}::${fundId ?? 'null'}::${monthIndex}`;
}

function parseCellKey(key: string): { accountId: string; fundId: string | null; monthIndex: number } {
  const parts = key.split('::');
  return {
    accountId: parts[0],
    fundId: parts[1] === 'null' ? null : parts[1],
    monthIndex: parseInt(parts[2], 10),
  };
}

/** Convert pence to pounds string for display. */
function penceToPounds(pence: number): string {
  if (pence === 0) return '';
  return (pence / 100).toFixed(2);
}

/** Convert a pounds input string to pence integer. */
function poundsToPence(value: string): number {
  const n = parseFloat(value || '0');
  return isNaN(n) ? 0 : Math.round(n * 100);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function BudgetGridEditor({
  grid,
  canEdit,
}: {
  grid: BudgetGrid;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { budget, accounts, funds, lineIndex } = grid;

  // ---- State ----

  const [fundFilter, setFundFilter] = useState<string>('all');
  const [saving, setSaving] = useState(false);

  // cells: keyed by "accountId::fundId::monthIndex" → pence value
  const [cells, setCells] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const account of accounts) {
      const activeFundId = fundFilter === 'all' ? null : fundFilter;
      const key = lineKey(account.id, activeFundId);
      const line = lineIndex[key];
      for (let m = 1; m <= 12; m++) {
        const ck = cellKey(account.id, activeFundId, m);
        init[ck] = line ? (line[MONTH_KEYS[m - 1] as keyof BudgetGridLine] as number) : 0;
      }
    }
    // Also initialise for each fund
    for (const fund of funds) {
      for (const account of accounts) {
        const key = lineKey(account.id, fund.id);
        const line = lineIndex[key];
        for (let m = 1; m <= 12; m++) {
          const ck = cellKey(account.id, fund.id, m);
          init[ck] = line ? (line[MONTH_KEYS[m - 1] as keyof BudgetGridLine] as number) : 0;
        }
      }
    }
    return init;
  });

  const [dirty, setDirty] = useState<Set<string>>(() => new Set());

  // ---- Derived ----

  const activeFundId = fundFilter === 'all' ? null : fundFilter;

  // Separate income and expense accounts
  const incomeAccounts = useMemo(
    () => accounts.filter((a) => a.type === 'income'),
    [accounts],
  );
  const expenseAccounts = useMemo(
    () => accounts.filter((a) => a.type === 'expense'),
    [accounts],
  );

  // Compute row total for a given account
  const rowTotal = useCallback(
    (accountId: string): number => {
      let sum = 0;
      for (let m = 1; m <= 12; m++) {
        sum += cells[cellKey(accountId, activeFundId, m)] ?? 0;
      }
      return sum;
    },
    [cells, activeFundId],
  );

  // Compute column totals
  const columnTotals = useMemo(() => {
    const totals = Array.from({ length: 12 }, () => 0);
    for (const account of accounts) {
      for (let m = 1; m <= 12; m++) {
        totals[m - 1] += cells[cellKey(account.id, activeFundId, m)] ?? 0;
      }
    }
    return totals;
  }, [cells, accounts, activeFundId]);

  const grandTotal = useMemo(() => columnTotals.reduce((a, b) => a + b, 0), [columnTotals]);

  // ---- Handlers ----

  function handleCellChange(accountId: string, monthIndex: number, value: string) {
    const pence = poundsToPence(value);
    const ck = cellKey(accountId, activeFundId, monthIndex);
    setCells((prev) => ({ ...prev, [ck]: pence }));
    setDirty((prev) => new Set(prev).add(ck));
  }

  async function handleSave() {
    if (dirty.size === 0) return;

    setSaving(true);

    const updates: GridUpdate[] = [];
    for (const ck of dirty) {
      const { accountId, fundId, monthIndex } = parseCellKey(ck);
      updates.push({
        accountId,
        fundId,
        monthIndex,
        amountPence: cells[ck] ?? 0,
      });
    }

    const result = await saveBudgetGrid(budget.id, updates);

    setSaving(false);

    if (result.success) {
      toast.success('Budget saved successfully.');
      setDirty(new Set());
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to save budget.');
    }
  }

  function handleFundChange(value: string) {
    setFundFilter(value);
  }

  // ---- Render helpers ----

  function renderAccountRows(accts: typeof accounts, label: string) {
    if (accts.length === 0) return null;

    return (
      <>
        <TableRow>
          <TableCell
            colSpan={14}
            className="bg-muted/50 font-semibold text-xs uppercase tracking-wide"
          >
            {label}
          </TableCell>
        </TableRow>
        {accts.map((account) => (
          <TableRow key={account.id}>
            <TableCell className="font-medium text-sm whitespace-nowrap">
              {account.code} &ndash; {account.name}
            </TableCell>
            {MONTH_LABELS.map((_, idx) => {
              const m = idx + 1;
              const ck = cellKey(account.id, activeFundId, m);
              const pence = cells[ck] ?? 0;
              const isDirty = dirty.has(ck);

              return (
                <TableCell key={m} className="p-0">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={penceToPounds(pence)}
                    onChange={(e) => handleCellChange(account.id, m, e.target.value)}
                    disabled={!canEdit}
                    className={`w-full h-9 px-2 text-right text-sm bg-transparent border-0 outline-none focus:ring-1 focus:ring-ring ${
                      isDirty ? 'bg-yellow-50 dark:bg-yellow-950/20' : ''
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  />
                </TableCell>
              );
            })}
            <TableCell className="text-right font-medium text-sm tabular-nums">
              {(rowTotal(account.id) / 100).toFixed(2)}
            </TableCell>
          </TableRow>
        ))}
      </>
    );
  }

  // ---- Main render ----

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">
            {budget.name} &mdash; {budget.year}
          </h1>
          <Badge
            variant={
              budget.status === 'approved'
                ? 'default'
                : budget.status === 'archived'
                  ? 'secondary'
                  : 'outline'
            }
          >
            {budget.status}
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          {/* Fund filter */}
          <select
            value={fundFilter}
            onChange={(e) => handleFundChange(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="all">All Funds (General)</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>

          {canEdit && (
            <Button
              onClick={handleSave}
              disabled={dirty.size === 0 || saving}
            >
              {saving ? 'Saving...' : `Save${dirty.size > 0 ? ` (${dirty.size})` : ''}`}
            </Button>
          )}

          <Button asChild variant="outline">
            <Link href="/budgets">Back</Link>
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-background z-10 min-w-[200px]">
                Account
              </TableHead>
              {MONTH_LABELS.map((label) => (
                <TableHead key={label} className="text-right min-w-[90px]">
                  {label}
                </TableHead>
              ))}
              <TableHead className="text-right min-w-[100px]">Annual</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {renderAccountRows(incomeAccounts, 'Income')}
            {renderAccountRows(expenseAccounts, 'Expense')}

            {/* Column totals */}
            <TableRow className="border-t-2 font-semibold">
              <TableCell className="sticky left-0 bg-background z-10">
                Totals
              </TableCell>
              {columnTotals.map((total, idx) => (
                <TableCell key={idx} className="text-right tabular-nums text-sm">
                  {(total / 100).toFixed(2)}
                </TableCell>
              ))}
              <TableCell className="text-right tabular-nums text-sm">
                {(grandTotal / 100).toFixed(2)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {accounts.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No income or expense accounts found. Add accounts in the{' '}
          <Link href="/accounts" className="underline">
            Chart of Accounts
          </Link>{' '}
          first.
        </p>
      )}
    </div>
  );
}
