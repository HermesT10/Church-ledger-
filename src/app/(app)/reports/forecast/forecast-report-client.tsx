'use client';

import { useState, useTransition, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { ReportShell } from '@/components/reports/report-shell';
import { getForecastReport } from '@/lib/reports/actions';
import type { SForecastReportData, SForecastReportRow } from '@/lib/reports/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
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
  return (pence / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPounds(pence: number): string {
  const pounds = pence / 100;
  const prefix = pounds < 0 ? '-£' : '£';
  return `${prefix}${Math.abs(pounds).toLocaleString('en-GB', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

/** Compute adverse risk amount for sorting (higher = more adverse). */
function adverseAmount(row: SForecastReportRow): number {
  if (row.accountType === 'expense') {
    return row.trendYearEndActual - row.annualBudget; // positive = overspend
  }
  if (row.accountType === 'income') {
    return row.annualBudget - row.trendYearEndActual; // positive = shortfall
  }
  return 0;
}

/** Sort rows: AT_RISK first (by adverse amount desc), then ON_TRACK. */
function sortRows(rows: SForecastReportRow[]): SForecastReportRow[] {
  return [...rows].sort((a, b) => {
    // AT_RISK before ON_TRACK
    if (a.riskStatus !== b.riskStatus) {
      return a.riskStatus === 'AT_RISK' ? -1 : 1;
    }
    // Within same status, sort by adverse amount descending
    return adverseAmount(b) - adverseAmount(a);
  });
}

/* ------------------------------------------------------------------ */
/*  CSV export                                                         */
/* ------------------------------------------------------------------ */

function buildCsv(rows: SForecastReportRow[], totals: SForecastReportRow): string {
  const header =
    'Account Code,Account Name,Type,Budget,Actual YTD,Baseline YE,Trend YE,Risk Delta,Status';
  const lines: string[] = [header];

  for (const row of rows) {
    lines.push(
      [
        row.accountCode,
        `"${row.accountName}"`,
        row.accountType,
        penceToPounds(row.annualBudget),
        penceToPounds(row.actualYTD),
        penceToPounds(row.baselineYearEndActual),
        penceToPounds(row.trendYearEndActual),
        penceToPounds(row.riskDelta),
        row.riskStatus === 'AT_RISK' ? 'At Risk' : 'On Track',
      ].join(','),
    );
  }

  lines.push(
    [
      '',
      'TOTALS',
      '',
      penceToPounds(totals.annualBudget),
      penceToPounds(totals.actualYTD),
      penceToPounds(totals.baselineYearEndActual),
      penceToPounds(totals.trendYearEndActual),
      penceToPounds(totals.riskDelta),
      totals.riskStatus === 'AT_RISK' ? 'At Risk' : 'On Track',
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
  initialData: SForecastReportData | null;
  orgId: string;
  initialYear: number;
  funds: { id: string; name: string }[];
  error?: string | null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ForecastReportClient({
  initialData,
  orgId,
  initialYear,
  funds,
  error,
}: Props) {
  const [data, setData] = useState<SForecastReportData | null>(initialData);
  const [year, setYear] = useState(initialYear);
  const [fundId, setFundId] = useState<string>('all');
  const [isPending, startTransition] = useTransition();

  const rows = useMemo(() => sortRows(data?.rows ?? []), [data?.rows]);
  const totals = data?.totals;
  const asOfMonth = data?.asOfMonthIndex
    ? MONTH_LABELS[data.asOfMonthIndex - 1]
    : '';

  const yearOptions = useMemo(() => {
    const result: number[] = [];
    for (let y = initialYear - 5; y <= initialYear + 1; y++) {
      result.push(y);
    }
    return result;
  }, [initialYear]);

  /* ---- Fetch helper ---- */
  const refetch = useCallback(
    (overrides: { year?: number; fundId?: string } = {}) => {
      const y = overrides.year ?? year;
      const fid = overrides.fundId ?? fundId;

      startTransition(async () => {
        const { data: newData, error } = await getForecastReport({
          organisationId: orgId,
          year: y,
          fundId: fid === 'all' ? undefined : fid,
        });

        if (error) toast.error(error);
        if (newData) setData(newData);
      });
    },
    [orgId, year, fundId],
  );

  const handleYearChange = (newYear: number) => {
    setYear(newYear);
    refetch({ year: newYear });
  };

  const handleFundChange = (newFund: string) => {
    setFundId(newFund);
    refetch({ fundId: newFund });
  };

  const handleExportCsv = () => {
    if (!data || !totals) return;
    const csv = buildCsv(rows, totals);
    downloadCsv(csv, `forecast-${year}.csv`);
    toast.success('CSV downloaded.');
  };

  /* ---- Render ---- */
  const asOfLabel = data ? (asOfMonth ? `${asOfMonth} ${year}` : String(year)) : undefined;

  return (
    <ReportShell
      title="Forecast"
      asOfDate={asOfLabel}
      description="Year-end projection based on trend and baseline."
      activeReport="/reports/forecast"
      action={
        <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="text-xs font-medium">Year</span>
          <select
            className={SELECT_CLASS}
            value={year}
            onChange={(e) => handleYearChange(Number(e.target.value))}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium">Fund</span>
          <select
            className={SELECT_CLASS}
            value={fundId}
            onChange={(e) => handleFundChange(e.target.value)}
          >
            <option value="all">All Funds (General)</option>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>

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
      {/* ---- Loading ---- */}
      {isPending && (
        <p className="text-sm text-muted-foreground">Loading...</p>
      )}

      {/* ---- Summary Cards ---- */}
      {totals && !isPending && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard
            label="Baseline YE Variance"
            value={totals.baselineVariance}
          />
          <SummaryCard
            label="Trend YE Variance"
            value={totals.trendVariance}
          />
          <SummaryCard label="Risk Delta" value={totals.riskDelta} />
        </div>
      )}

      {/* ---- Empty state ---- */}
      {!isPending && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No forecast data for {year}. Create a budget first.
        </p>
      )}

      {/* ---- Table ---- */}
      {rows.length > 0 && totals && (
        <div className="rounded-2xl border shadow-sm overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Budget</TableHead>
                <TableHead className="text-right">Actual YTD</TableHead>
                <TableHead className="text-right">Baseline YE</TableHead>
                <TableHead className="text-right">Trend YE</TableHead>
                <TableHead className="text-right">Risk Delta</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <ForecastTableRow key={row.accountId} row={row} />
              ))}

              {/* Totals */}
              <TableRow className="font-bold border-t-2">
                <TableCell>Totals</TableCell>
                <TableCell className="text-right tabular-nums">
                  {penceToPounds(totals.annualBudget)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {penceToPounds(totals.actualYTD)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {penceToPounds(totals.baselineYearEndActual)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {penceToPounds(totals.trendYearEndActual)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {penceToPounds(totals.riskDelta)}
                </TableCell>
                <TableCell className="text-center">
                  <StatusBadge status={totals.riskStatus} />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}

      {/* ---- Footer ---- */}
      {rows.length > 0 && asOfMonth && (
        <p className="text-xs text-muted-foreground">
          Forecast as of {asOfMonth} {year}
        </p>
      )}
    </ReportShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function SummaryCard({ label, value }: { label: string; value: number }) {
  const isNegative = value < 0;
  const colorClass = value === 0
    ? 'text-muted-foreground'
    : isNegative
      ? 'text-destructive'
      : 'text-emerald-600 dark:text-emerald-400';

  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`text-xl font-bold tabular-nums ${colorClass}`}>
          {formatPounds(value)}
        </p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: 'ON_TRACK' | 'AT_RISK' }) {
  if (status === 'AT_RISK') {
    return (
      <Badge variant="destructive" className="text-xs">
        At Risk
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 text-xs">
      On Track
    </Badge>
  );
}

function ForecastTableRow({ row }: { row: SForecastReportRow }) {
  return (
    <TableRow>
      <TableCell>
        <span className="font-mono text-xs text-muted-foreground mr-2">
          {row.accountCode}
        </span>
        {row.accountName}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {penceToPounds(row.annualBudget)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {penceToPounds(row.actualYTD)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {penceToPounds(row.baselineYearEndActual)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {penceToPounds(row.trendYearEndActual)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {penceToPounds(row.riskDelta)}
      </TableCell>
      <TableCell className="text-center">
        <StatusBadge status={row.riskStatus} />
      </TableCell>
    </TableRow>
  );
}
