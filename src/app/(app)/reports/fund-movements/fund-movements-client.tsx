'use client';

import { useState, useTransition, useCallback } from 'react';
import { toast } from 'sonner';
import { ReportShell } from '@/components/reports/report-shell';
import { ReportEmptyState } from '@/components/reports/report-empty-state';
import { DrillDownDialog, type DrillDownParams } from '@/components/reports/drill-down-dialog';
import { ReportFilterBar } from '@/components/reports/report-filter-bar';
import { ReportTableCard } from '@/components/reports/report-table-card';
import { getFundMovementsReport } from '@/lib/reports/actions';
import type { SFMReport, SFMFundRow } from '@/lib/reports/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { buildFundInsights } from '@/lib/reports/insights';
import {
  buildDateScope,
  formatCurrencyFromPence,
  type ReportDefinition,
  type ReportKpi,
  type ReportMetadata,
} from '@/lib/reports/framework';

/* ------------------------------------------------------------------ */
/*  Constants & helpers                                                */
/* ------------------------------------------------------------------ */

const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const SELECT_CLASS =
  'h-10 w-full rounded-xl border border-input bg-card px-3 text-sm shadow-xs outline-none transition focus:border-primary/30 focus:ring-[3px] focus:ring-primary/10';

function penceToPounds(pence: number): string {
  if (pence === 0) return '—';
  const pounds = pence / 100;
  const prefix = pounds < 0 ? '-' : '';
  return `${prefix}£${Math.abs(pounds).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPounds(pence: number): string {
  const pounds = pence / 100;
  const prefix = pounds < 0 ? '-£' : '£';
  return `${prefix}${Math.abs(pounds).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/* ------------------------------------------------------------------ */
/*  Fund type badge                                                    */
/* ------------------------------------------------------------------ */

function FundTypeBadge({ type }: { type: string }) {
  switch (type) {
    case 'restricted':
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs">
          Restricted
        </Badge>
      );
    case 'designated':
      return (
        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-xs">
          Designated
        </Badge>
      );
    default:
      return (
        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 text-xs">
          Unrestricted
        </Badge>
      );
  }
}

/* ------------------------------------------------------------------ */
/*  CSV export                                                         */
/* ------------------------------------------------------------------ */

function buildCsv(report: SFMReport): string {
  const header =
    'Fund,Type,Opening,Income,Expenditure,Net Movement,Closing';
  const lines: string[] = [header];

  for (const row of report.funds) {
    lines.push(
      [
        `"${row.fundName}"`,
        row.fundType,
        penceToPounds(row.openingBalancePence),
        penceToPounds(row.incomePence),
        penceToPounds(row.expenditurePence),
        penceToPounds(row.netMovementPence),
        penceToPounds(row.closingBalancePence),
      ].join(','),
    );
  }

  lines.push(
    [
      'Totals',
      '',
      penceToPounds(report.totals.openingBalancePence),
      penceToPounds(report.totals.incomePence),
      penceToPounds(report.totals.expenditurePence),
      penceToPounds(report.totals.netMovementPence),
      penceToPounds(report.totals.closingBalancePence),
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
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  initialData: SFMReport | null;
  orgId: string;
  funds: { id: string; name: string; type: string }[];
  defaultYear: number;
  error?: string | null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function FundMovementsClient({
  initialData,
  orgId,
  funds,
  defaultYear,
  error,
}: Props) {
  const [data, setData] = useState<SFMReport | null>(initialData);
  const [year, setYear] = useState(defaultYear);
  const [mode, setMode] = useState<'MONTH' | 'YTD'>('YTD');
  const [month, setMonth] = useState(new Date().getMonth() + 1); // 1-based
  const [fundFilter, setFundFilter] = useState('ALL');
  const [isPending, startTransition] = useTransition();
  const [drillDown, setDrillDown] = useState<DrillDownParams | null>(null);

  const hasData = data && data.funds.length > 0;

  /* ---- Build fundFilter param for server action ---- */
  const buildFundFilter = useCallback(
    (
      filterValue: string,
    ):
      | 'ALL'
      | 'RESTRICTED'
      | 'UNRESTRICTED'
      | 'DESIGNATED'
      | { fundId: string } => {
      if (
        filterValue === 'ALL' ||
        filterValue === 'RESTRICTED' ||
        filterValue === 'UNRESTRICTED' ||
        filterValue === 'DESIGNATED'
      ) {
        return filterValue;
      }
      return { fundId: filterValue };
    },
    [],
  );

  /* ---- Fetch helper ---- */
  const refetch = useCallback(
    (overrides: {
      year?: number;
      mode?: 'MONTH' | 'YTD';
      month?: number;
      fundFilter?: string;
    } = {}) => {
      const y = overrides.year ?? year;
      const m = overrides.mode ?? mode;
      const mo = overrides.month ?? month;
      const ff = overrides.fundFilter ?? fundFilter;

      startTransition(async () => {
        const { data: newData, error } = await getFundMovementsReport({
          organisationId: orgId,
          year: y,
          month: m === 'MONTH' ? mo : undefined,
          mode: m,
          fundFilter: buildFundFilter(ff),
        });

        if (error) toast.error(error);
        if (newData) setData(newData);
      });
    },
    [orgId, year, mode, month, fundFilter, buildFundFilter],
  );

  /* ---- Filter handlers ---- */
  const handleYearChange = (v: string) => {
    const newYear = Number(v);
    setYear(newYear);
    refetch({ year: newYear });
  };

  const handleModeChange = (v: string) => {
    const newMode = v as 'MONTH' | 'YTD';
    setMode(newMode);
    refetch({ mode: newMode });
  };

  const handleMonthChange = (v: string) => {
    const newMonth = Number(v);
    setMonth(newMonth);
    refetch({ month: newMonth });
  };

  const handleFundFilterChange = (v: string) => {
    setFundFilter(v);
    refetch({ fundFilter: v });
  };

  const handleExportCsv = () => {
    if (!data) return;
    const csv = buildCsv(data);
    const suffix =
      mode === 'MONTH'
        ? `${year}-${String(month).padStart(2, '0')}`
        : `${year}-ytd`;
    downloadCsv(csv, `fund-movements-${suffix}.csv`);
    toast.success('CSV downloaded.');
  };

  /* ---- Period description ---- */
  const periodDesc =
    mode === 'MONTH' && data?.period.month
      ? `${MONTH_LABELS[data.period.month - 1]} ${data.period.year}`
      : `YTD ${data?.period.year ?? year}`;

  const metadata: ReportMetadata | undefined = data
    ? {
        scope: buildDateScope({
          startDate: data.period.startDate,
          endDate: data.period.endDate,
        }),
        comparison: 'Opening balance + income - expenditure = closing balance',
        source: 'Posted journal lines with fund allocation.',
        filters: [
          { label: 'Mode', value: mode === 'MONTH' ? 'Single month' : 'Year to date' },
          { label: 'Period', value: periodDesc },
          { label: 'Fund filter', value: fundFilter },
        ],
        footnotes: [
          {
            text: 'Fund movements reflect only transactions that have been posted and allocated to a fund.',
          },
          {
            text: 'Click any fund row to inspect the posted movement behind that balance change.',
          },
        ],
      }
    : undefined;

  const kpis: ReportKpi[] | undefined = data
    ? [
        {
          label: 'Opening',
          value: formatCurrencyFromPence(data.totals.openingBalancePence),
        },
        {
          label: 'Income',
          value: formatCurrencyFromPence(data.totals.incomePence),
          tone: 'positive',
        },
        {
          label: 'Expenditure',
          value: formatCurrencyFromPence(data.totals.expenditurePence),
        },
        {
          label: 'Closing',
          value: formatCurrencyFromPence(data.totals.closingBalancePence),
          tone: data.totals.closingBalancePence >= 0 ? 'positive' : 'caution',
        },
      ]
    : undefined;

  const definitions: ReportDefinition[] = [
    {
      term: 'Opening balance',
      meaning: 'The balance carried into the selected period.',
    },
    {
      term: 'Net movement',
      meaning: 'Income minus expenditure for the selected scope.',
    },
    {
      term: 'Closing balance',
      meaning: 'The opening balance adjusted for all posted movement in the selected scope.',
    },
  ];

  /* ---- Year range ---- */
  const years: number[] = [];
  for (let y = defaultYear - 5; y <= defaultYear + 1; y++) {
    years.push(y);
  }

  /* ---- Render ---- */
  return (
    <ReportShell
      title="Fund Movements"
      asOfDate={periodDesc}
      description="Opening balances, income, expenditure, and closing balances per fund."
      activeReport="/reports/fund-movements"
      action={
        <ReportFilterBar>
        {/* Year */}
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Year</span>
          <select
            className={SELECT_CLASS}
            value={year}
            onChange={(e) => handleYearChange(e.target.value)}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        {/* Mode */}
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Mode</span>
          <select
            className={SELECT_CLASS}
            value={mode}
            onChange={(e) => handleModeChange(e.target.value)}
          >
            <option value="YTD">Year to Date</option>
            <option value="MONTH">Month</option>
          </select>
        </label>

        {/* Month (only when mode=MONTH) */}
        {mode === 'MONTH' && (
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Month</span>
            <select
              className={SELECT_CLASS}
              value={month}
              onChange={(e) => handleMonthChange(e.target.value)}
            >
              {MONTH_LABELS.map((label, i) => (
                <option key={i + 1} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Fund filter */}
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">Fund</span>
          <select
            className={SELECT_CLASS}
            value={fundFilter}
            onChange={(e) => handleFundFilterChange(e.target.value)}
          >
            <option value="ALL">All Funds</option>
            <option value="RESTRICTED">Restricted</option>
            <option value="UNRESTRICTED">Unrestricted</option>
            <option value="DESIGNATED">Designated</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>

        {/* Export */}
        <Button
          variant="outline"
          size="sm"
          className="h-10 self-end rounded-xl"
          onClick={handleExportCsv}
          disabled={!hasData}
        >
          Export CSV
        </Button>
        </ReportFilterBar>
      }
      error={error}
      metadata={metadata}
      kpis={kpis}
      insights={data ? buildFundInsights(data) : undefined}
      definitions={definitions}
    >
      {/* ---- Loading ---- */}
      {isPending && (
        <p className="text-sm text-muted-foreground">Loading...</p>
      )}

      {/* ---- Empty state ---- */}
      {!isPending && !hasData && (
        <ReportEmptyState
          title="No fund movement data for this period"
          description="Post journals with fund allocations to see balances and movements here."
        />
      )}

      {/* ---- Table ---- */}
      {hasData && data && (
        <ReportTableCard
          title="Fund Movement Schedule"
          description={`Opening balances, activity, and closing balances for ${periodDesc}.`}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fund</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Opening</TableHead>
                <TableHead className="text-right">Income</TableHead>
                <TableHead className="text-right">Expenditure</TableHead>
                <TableHead className="text-right">Net Movement</TableHead>
                <TableHead className="text-right">Closing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.funds.map((row) => (
                <FundRow
                  key={row.fundId}
                  row={row}
                  onDrillDown={(selectedRow) =>
                    setDrillDown({
                      organisationId: orgId,
                      fundId: selectedRow.fundId,
                      fundName: selectedRow.fundName,
                      startDate: data.period.startDate,
                      endDate: data.period.endDate,
                      title: `Fund movements supporting ${selectedRow.fundName}`,
                    })
                  }
                />
              ))}

              {/* Totals */}
              <TableRow className="font-bold border-t-2">
                <TableCell>Totals</TableCell>
                <TableCell />
                <TableCell className="text-right tabular-nums">
                  {penceToPounds(data.totals.openingBalancePence)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {penceToPounds(data.totals.incomePence)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {penceToPounds(data.totals.expenditurePence)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {penceToPounds(data.totals.netMovementPence)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {penceToPounds(data.totals.closingBalancePence)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </ReportTableCard>
      )}

      {/* ---- Summary cards ---- */}
      {hasData && data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                Total Closing Balance
              </p>
              <p className="text-xl font-bold tabular-nums">
                {formatPounds(data.totals.closingBalancePence)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                Net Movement ({periodDesc})
              </p>
              <p
                className={`text-xl font-bold tabular-nums ${
                  data.totals.netMovementPence < 0
                    ? 'text-red-600 dark:text-red-400'
                    : data.totals.netMovementPence > 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : ''
                }`}
              >
                {formatPounds(data.totals.netMovementPence)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ---- Footer ---- */}
      {hasData && data && (
        <p className="text-xs text-muted-foreground">
          Fund Movements for {periodDesc} &middot; {data.period.startDate} to{' '}
          {data.period.endDate}
        </p>
      )}

      <DrillDownDialog params={drillDown} onClose={() => setDrillDown(null)} />
    </ReportShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function FundRow({
  row,
  onDrillDown,
}: {
  row: SFMFundRow;
  onDrillDown: (row: SFMFundRow) => void;
}) {
  return (
    <TableRow className="cursor-pointer hover:bg-primary/5" onClick={() => onDrillDown(row)}>
      <TableCell className="font-medium text-primary hover:underline">{row.fundName}</TableCell>
      <TableCell>
        <FundTypeBadge type={row.fundType} />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {penceToPounds(row.openingBalancePence)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {penceToPounds(row.incomePence)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {penceToPounds(row.expenditurePence)}
      </TableCell>
      <TableCell
        className={`text-right tabular-nums ${
          row.netMovementPence < 0
            ? 'text-red-600 dark:text-red-400'
            : row.netMovementPence > 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : ''
        }`}
      >
        {penceToPounds(row.netMovementPence)}
      </TableCell>
      <TableCell className="text-right tabular-nums font-medium">
        {penceToPounds(row.closingBalancePence)}
      </TableCell>
    </TableRow>
  );
}
