'use client';

import { useState, useTransition, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { ReportShell } from '@/components/reports/report-shell';
import { ReportEmptyState } from '@/components/reports/report-empty-state';
import { DrillDownDialog, type DrillDownParams } from '@/components/reports/drill-down-dialog';
import { ReportFilterBar } from '@/components/reports/report-filter-bar';
import { ReportTableCard } from '@/components/reports/report-table-card';
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
import { buildBudgetInsights } from '@/lib/reports/insights';
import {
  buildDateScope,
  buildFundFilterLabel,
  formatCurrencyFromPence,
  type ReportDefinition,
  type ReportKpi,
  type ReportMetadata,
} from '@/lib/reports/framework';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const SELECT_CLASS =
  'h-10 w-full rounded-xl border border-input bg-card px-3 text-sm shadow-xs outline-none transition focus:border-primary/30 focus:ring-[3px] focus:ring-primary/10';

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
  initialYear: number;
  error?: string | null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function BvaReportClient({ initialData, orgId, initialYear, error }: Props) {
  const [data, setData] = useState<BvaReportData | null>(initialData);
  const [year, setYear] = useState(initialYear);
  const [budgetId, setBudgetId] = useState<string>(
    initialData?.budgets[0]?.id ?? '',
  );
  const [fundId, setFundId] = useState<string>('all');
  const [period, setPeriod] = useState<'YTD' | 'MTD'>('YTD');
  const [monthIndex, setMonthIndex] = useState(new Date().getMonth() + 1);
  const [isPending, startTransition] = useTransition();
  const [drillDown, setDrillDown] = useState<DrillDownParams | null>(null);

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
  const selectedBudget = budgets.find((budget) => budget.id === budgetId) ?? budgets[0];

  const metadata: ReportMetadata | undefined = data
    ? {
        scope:
          period === 'YTD'
            ? buildDateScope({ year, ytd: true })
            : buildDateScope({ year, month: monthIndex }),
        comparison: 'Budget compared with posted actuals for the same scope',
        source: 'Approved budget lines combined with posted ledger actuals.',
        filters: [
          { label: 'Budget', value: selectedBudget?.name ?? 'No budget selected' },
          { label: 'Fund', value: buildFundFilterLabel(activeFundId ?? null, funds, 'General / all funds') },
          { label: 'View', value: periodLabel },
        ],
        footnotes: [
          {
            text: 'Variance direction depends on account type: positive expense variance is adverse, negative income variance is adverse.',
          },
          {
            text: 'Click an account row to inspect the supporting transactions for the selected scope.',
          },
        ],
      }
    : undefined;

  const currentTotals =
    totals && period === 'MTD' ? totals.months[MONTH_KEYS[monthIndex - 1]] : totals?.ytd;

  const kpis: ReportKpi[] | undefined = currentTotals
    ? [
        {
          label: 'Budget',
          value: formatCurrencyFromPence(currentTotals.budget),
        },
        {
          label: 'Actual',
          value: formatCurrencyFromPence(currentTotals.actual),
        },
        {
          label: 'Variance',
          value: formatCurrencyFromPence(currentTotals.variance),
          tone: currentTotals.variance <= 0 ? 'positive' : 'caution',
        },
        {
          label: 'Variance %',
          value: pctDisplay(currentTotals.variancePct),
          helper: 'Calculated against the selected budget scope.',
          tone: currentTotals.variancePct !== null && currentTotals.variancePct <= 0 ? 'positive' : 'neutral',
        },
      ]
    : undefined;

  const definitions: ReportDefinition[] = [
    {
      term: 'Budget',
      meaning: 'Planned spend or income for the selected report scope.',
    },
    {
      term: 'Actual',
      meaning: 'Posted ledger movement for the same account and scope.',
    },
    {
      term: 'Adverse variance',
      meaning: 'Expense higher than budget or income lower than budget.',
    },
  ];

  const openDrillDown = (selectedRow: SBvaRow) => {
    const isMtd = period === 'MTD';
    const startDate = isMtd
      ? `${year}-${String(monthIndex).padStart(2, '0')}-01`
      : `${year}-01-01`;
    const endDate = isMtd
      ? `${year}-${String(monthIndex).padStart(2, '0')}-${String(new Date(year, monthIndex, 0).getDate()).padStart(2, '0')}`
      : `${year}-${String(monthIndex).padStart(2, '0')}-${String(new Date(year, monthIndex, 0).getDate()).padStart(2, '0')}`;

    setDrillDown({
      organisationId: orgId,
      accountId: selectedRow.accountId,
      accountName: selectedRow.accountName,
      startDate,
      endDate,
      fundId: activeFundId,
      title: `Budget variance support for ${selectedRow.accountName}`,
    });
  };

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
        <ReportFilterBar>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Year</span>
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

        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Budget</span>
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

        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Fund</span>
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

        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Period</span>
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
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Month</span>
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
          className="h-10 self-end rounded-xl"
          onClick={handleExportCsv}
          disabled={rows.length === 0}
        >
          Export CSV
        </Button>
        </ReportFilterBar>
      }
      error={error}
      metadata={metadata}
      kpis={kpis}
      insights={data ? buildBudgetInsights(data, period, MONTH_KEYS[monthIndex - 1]) : undefined}
      definitions={definitions}
    >
      {/* ---- Loading indicator ---- */}
      {isPending && (
        <p className="text-sm text-muted-foreground">Loading...</p>
      )}

      {/* ---- Empty state ---- */}
      {!isPending && rows.length === 0 && (
        <ReportEmptyState
          title="No budget data found"
          description={`No budget data was found for ${year}. Create and approve a budget before using this report.`}
        />
      )}

      {/* ---- Table ---- */}
      {rows.length > 0 && totals && (
        <ReportTableCard
          title="Budget Analysis"
          description={`Showing ${periodLabel} variance across income and expense accounts.`}
        >
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
                  <BvaTableRow
                    key={row.accountId}
                    row={row}
                    period={period}
                    monthIndex={monthIndex}
                    onDrillDown={openDrillDown}
                  />
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
                  <BvaTableRow
                    key={row.accountId}
                    row={row}
                    period={period}
                    monthIndex={monthIndex}
                    onDrillDown={openDrillDown}
                  />
                ))}

              {/* ---- Totals ---- */}
              <TotalsRow totals={totals} period={period} monthIndex={monthIndex} />
            </TableBody>
          </Table>
        </ReportTableCard>
      )}

      {/* ---- Period label ---- */}
      {rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing: {periodLabel} {year}
        </p>
      )}

      <DrillDownDialog params={drillDown} onClose={() => setDrillDown(null)} />
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
  onDrillDown,
}: {
  row: SBvaRow;
  period: 'YTD' | 'MTD';
  monthIndex: number;
  onDrillDown: (row: SBvaRow) => void;
}) {
  const cell = pickCell(row, period, monthIndex);
  const adverse = isAdverse(row.accountType, cell.variance);

  return (
    <TableRow className="cursor-pointer hover:bg-primary/5" onClick={() => onDrillDown(row)}>
      <TableCell className="font-mono text-xs">{row.accountCode}</TableCell>
      <TableCell className="text-primary hover:underline">{row.accountName}</TableCell>
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
