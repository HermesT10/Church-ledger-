'use client';

import { useState, useTransition, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { ReportShell } from '@/components/reports/report-shell';
import { MONTH_KEYS } from '@/lib/budgets/budgetMath';
import { getBudgetVsActualReport } from '@/lib/reports/actions';
import type { BvaReportData, SBvaRow, SMonthCell, SBvaTotals } from '@/lib/reports/types';
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

const SELECT_CLASS =
  'flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function penceToPounds(pence: number): string {
  if (pence === 0) return '—';
  return (pence / 100).toFixed(2);
}

function pctDisplay(pct: number | null): string {
  if (pct === null) return '—';
  return `${(pct * 100).toFixed(1)}%`;
}

/** True when the variance is adverse for this account type. */
function isAdverse(accountType: string, variance: number): boolean {
  if (accountType === 'expense') return variance > 0;
  if (accountType === 'income') return variance < 0;
  return false;
}

/** Pick the correct cell based on the period selection. */
function pickCell(
  row: { months: Record<string, SMonthCell>; ytd: SMonthCell },
  period: 'YTD' | 'MTD',
  monthIndex: number,
): SMonthCell {
  if (period === 'MTD') {
    return row.months[MONTH_KEYS[monthIndex - 1]];
  }
  return row.ytd;
}

/* ------------------------------------------------------------------ */
/*  CSV export                                                         */
/* ------------------------------------------------------------------ */

function buildCsv(
  rows: SBvaRow[],
  totals: SBvaTotals,
  period: 'YTD' | 'MTD',
  monthIndex: number,
): string {
  const header = 'Account Code,Account Name,Type,Budget,Actual,Variance,Variance %';
  const lines: string[] = [header];

  for (const row of rows) {
    const cell = pickCell(row, period, monthIndex);
    lines.push(
      [
        row.accountCode,
        `"${row.accountName}"`,
        row.accountType,
        penceToPounds(cell.budget),
        penceToPounds(cell.actual),
        penceToPounds(cell.variance),
        pctDisplay(cell.variancePct),
      ].join(','),
    );
  }

  const totalsCell = period === 'MTD' ? totals.months[MONTH_KEYS[monthIndex - 1]] : totals.ytd;
  lines.push(
    [
      '',
      'TOTALS',
      '',
      penceToPounds(totalsCell.budget),
      penceToPounds(totalsCell.actual),
      penceToPounds(totalsCell.variance),
      pctDisplay(totalsCell.variancePct),
    ].join(','),
  );

  return lines.join('\n');
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/*  Component props                                                    */
/* ------------------------------------------------------------------ */

interface Props {
  initialData: BvaReportData | null;
  orgId: string;
  role: string;
  initialYear: number;
  error?: string | null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function BvaReportClient({ initialData, orgId, role, initialYear, error }: Props) {
  const [data, setData] = useState<BvaReportData | null>(initialData);
  const [year, setYear] = useState(initialYear);
  const [budgetId, setBudgetId] = useState<string>(
    initialData?.budgets[0]?.id ?? '',
  );
  const [fundId, setFundId] = useState<string>('all');
  const [period, setPeriod] = useState<'YTD' | 'MTD'>('YTD');
  const [monthIndex, setMonthIndex] = useState(new Date().getMonth() + 1);
  const [isPending, startTransition] = useTransition();

  /* ---- Derived state ---- */
  const activeFundId = fundId === 'all' ? undefined : fundId;
  const rows = data?.rows ?? [];
  const totals = data?.totals;
  const budgets = data?.budgets ?? [];
  const funds = data?.funds ?? [];

  /* ---- Year range ---- */
  const yearOptions = useMemo(() => {
    const result: number[] = [];
    for (let y = initialYear - 5; y <= initialYear + 1; y++) {
      result.push(y);
    }
    return result;
  }, [initialYear]);

  /* ---- Fetch helper ---- */
  const refetch = useCallback(
    (
      overrides: {
        year?: number;
        budgetId?: string;
        fundId?: string;
      } = {},
    ) => {
      const y = overrides.year ?? year;
      const fid = overrides.fundId ?? fundId;
      const bid = overrides.budgetId ?? budgetId;

      startTransition(async () => {
        const { data: newData, error } = await getBudgetVsActualReport({
          orgId,
          year: y,
          budgetId: bid || undefined,
          fundId: fid === 'all' ? undefined : fid,
        });

        if (error) {
          toast.error(error);
        }

        if (newData) {
          setData(newData);
          // Auto-select first budget if current selection no longer valid
          if (
            newData.budgets.length > 0 &&
            !newData.budgets.some((b) => b.id === bid)
          ) {
            setBudgetId(newData.budgets[0].id);
          }
        }
      });
    },
    [orgId, year, budgetId, fundId],
  );

  /* ---- Event handlers ---- */
  const handleYearChange = (newYear: number) => {
    setYear(newYear);
    setBudgetId('');
    refetch({ year: newYear, budgetId: '' });
  };

  const handleBudgetChange = (newId: string) => {
    setBudgetId(newId);
    refetch({ budgetId: newId });
  };

  const handleFundChange = (newFund: string) => {
    setFundId(newFund);
    refetch({ fundId: newFund });
  };

  const handleExportCsv = () => {
    if (!data || !totals) return;
    const csv = buildCsv(rows, totals, period, monthIndex);
    const periodLabel = period === 'YTD' ? 'ytd' : MONTH_LABELS[monthIndex - 1].toLowerCase();
    downloadCsv(csv, `bva-${year}-${periodLabel}.csv`);
    toast.success('CSV downloaded.');
  };

  /* ---- Period label for the table header ---- */
  const periodLabel = period === 'YTD' ? 'Year to Date' : MONTH_LABELS[monthIndex - 1];

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  const asOfLabel = data ? `${year}` : undefined;

  return (
    <ReportShell
      title="Budget vs Actual"
      asOfDate={asOfLabel}
      description="Compare planned budget to actual results."
      activeReport="/reports/budget-vs-actual"
      action={
        <div className="flex flex-wrap items-end gap-3">
        {/* Year */}
        <label className="space-y-1">
          <span className="text-xs font-medium">Year</span>
          <select
            className={SELECT_CLASS}
            value={year}
            onChange={(e) => handleYearChange(Number(e.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>

        {/* Budget */}
        <label className="space-y-1">
          <span className="text-xs font-medium">Budget</span>
          <select
            className={SELECT_CLASS}
            value={budgetId}
            onChange={(e) => handleBudgetChange(e.target.value)}
          >
            {budgets.length === 0 && <option value="">No budgets</option>}
            {budgets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.status})
              </option>
            ))}
          </select>
        </label>

        {/* Fund */}
        <label className="space-y-1">
          <span className="text-xs font-medium">Fund</span>
          <select
            className={SELECT_CLASS}
            value={fundId}
            onChange={(e) => handleFundChange(e.target.value)}
          >
            <option value="all">All Funds (General)</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </label>

        {/* Period */}
        <label className="space-y-1">
          <span className="text-xs font-medium">Period</span>
          <select
            className={SELECT_CLASS}
            value={period}
            onChange={(e) => setPeriod(e.target.value as 'YTD' | 'MTD')}
          >
            <option value="YTD">Year to Date</option>
            <option value="MTD">Month</option>
          </select>
        </label>

        {/* Month (only when MTD) */}
        {period === 'MTD' && (
          <label className="space-y-1">
            <span className="text-xs font-medium">Month</span>
            <select
              className={SELECT_CLASS}
              value={monthIndex}
              onChange={(e) => setMonthIndex(Number(e.target.value))}
            >
              {MONTH_LABELS.map((label, i) => (
                <option key={i} value={i + 1}>{label}</option>
              ))}
            </select>
          </label>
        )}

        {/* Export CSV */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCsv}
          disabled={rows.length === 0}
        >
          Export CSV
        </Button>
        </div>
      }
      error={error}
    >
      {/* ---- Loading indicator ---- */}
      {isPending && (
        <p className="text-sm text-muted-foreground">Loading...</p>
      )}

      {/* ---- Empty state ---- */}
      {!isPending && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No budget data found for {year}. Create a budget first.
        </p>
      )}

      {/* ---- Table ---- */}
      {rows.length > 0 && totals && (
        <div className="rounded-2xl border shadow-sm overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Code</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Variance</TableHead>
                <TableHead className="text-right">Var %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* ---- Income section ---- */}
              <TableRow>
                <TableCell colSpan={6} className="font-semibold bg-muted/50">
                  Income
                </TableCell>
              </TableRow>
              {rows
                .filter((r) => r.accountType === 'income')
                .map((row) => (
                  <BvaTableRow key={row.accountId} row={row} period={period} monthIndex={monthIndex} />
                ))}

              {/* ---- Expense section ---- */}
              <TableRow>
                <TableCell colSpan={6} className="font-semibold bg-muted/50">
                  Expenses
                </TableCell>
              </TableRow>
              {rows
                .filter((r) => r.accountType === 'expense')
                .map((row) => (
                  <BvaTableRow key={row.accountId} row={row} period={period} monthIndex={monthIndex} />
                ))}

              {/* ---- Totals ---- */}
              <TotalsRow totals={totals} period={period} monthIndex={monthIndex} />
            </TableBody>
          </Table>
        </div>
      )}

      {/* ---- Period label ---- */}
      {rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing: {periodLabel} {year}
        </p>
      )}
    </ReportShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Table row components                                               */
/* ------------------------------------------------------------------ */

function BvaTableRow({
  row,
  period,
  monthIndex,
}: {
  row: SBvaRow;
  period: 'YTD' | 'MTD';
  monthIndex: number;
}) {
  const cell = pickCell(row, period, monthIndex);
  const adverse = isAdverse(row.accountType, cell.variance);

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{row.accountCode}</TableCell>
      <TableCell>{row.accountName}</TableCell>
      <TableCell className="text-right tabular-nums">
        {penceToPounds(cell.budget)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {penceToPounds(cell.actual)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <span className="inline-flex items-center gap-1">
          {penceToPounds(cell.variance)}
          {adverse && (
            <Badge variant="destructive" className="text-[10px] px-1 py-0 leading-tight">
              adverse
            </Badge>
          )}
        </span>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {pctDisplay(cell.variancePct)}
      </TableCell>
    </TableRow>
  );
}

function TotalsRow({
  totals,
  period,
  monthIndex,
}: {
  totals: SBvaTotals;
  period: 'YTD' | 'MTD';
  monthIndex: number;
}) {
  const cell = pickCell(totals, period, monthIndex);

  return (
    <TableRow className="font-bold border-t-2">
      <TableCell />
      <TableCell>Totals</TableCell>
      <TableCell className="text-right tabular-nums">
        {penceToPounds(cell.budget)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {penceToPounds(cell.actual)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {penceToPounds(cell.variance)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {pctDisplay(cell.variancePct)}
      </TableCell>
    </TableRow>
  );
}
