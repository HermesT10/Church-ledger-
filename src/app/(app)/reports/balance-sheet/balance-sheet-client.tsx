'use client';

import { useState, useTransition, useCallback } from 'react';
import { toast } from 'sonner';
import { getBalanceSheetReport } from '@/lib/reports/actions';
import type { SBSReport, SBSSection, SBSAccountRow } from '@/lib/reports/types';
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
import { ReportShell } from '@/components/reports/report-shell';
import { ReportEmptyState } from '@/components/reports/report-empty-state';
import { DrillDownDialog, type DrillDownParams } from '@/components/reports/drill-down-dialog';
import { ReportFilterBar } from '@/components/reports/report-filter-bar';
import { ReportTableCard } from '@/components/reports/report-table-card';
import { SummaryMetricCard } from '@/components/finance';
import { buildBalanceSheetInsights } from '@/lib/reports/insights';
import {
  buildDateScope,
  buildFundFilterLabel,
  formatCurrencyFromPence,
  type ReportDefinition,
  type ReportKpi,
  type ReportMetadata,
} from '@/lib/reports/framework';

/* ------------------------------------------------------------------ */
/*  Constants & helpers                                                */
/* ------------------------------------------------------------------ */

const SELECT_CLASS =
  'h-10 w-full rounded-xl border border-input bg-card px-3 text-sm shadow-xs outline-none transition focus:border-primary/30 focus:ring-[3px] focus:ring-primary/10';

function penceToPounds(pence: number): string {
  if (pence === 0) return '—';
  const pounds = pence / 100;
  const prefix = pounds < 0 ? '-£' : '£';
  return `${prefix}${Math.abs(pounds).toLocaleString('en-GB', {
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
/*  CSV export                                                         */
/* ------------------------------------------------------------------ */

function buildCsv(report: SBSReport): string {
  const header = 'Account Code,Account Name,Type,Balance';
  const lines: string[] = [header];

  const addSection = (section: SBSSection, typeName: string) => {
    for (const row of section.rows) {
      lines.push(
        [
          row.accountCode,
          `"${row.accountName}"`,
          typeName,
          penceToPounds(row.balance),
        ].join(','),
      );
    }
    lines.push(['', `Total ${typeName}`, '', penceToPounds(section.total)].join(','));
  };

  addSection(report.sections.assets, 'Assets');
  addSection(report.sections.liabilities, 'Liabilities');
  addSection(report.sections.equity, 'Equity');
  lines.push(['', 'Net Assets', '', penceToPounds(report.netAssets)].join(','));

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
  initialData: SBSReport | null;
  orgId: string;
  initialAsOfDate: string;
  funds: { id: string; name: string }[];
  error?: string | null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function BalanceSheetClient({
  initialData,
  orgId,
  initialAsOfDate,
  funds,
  error,
}: Props) {
  const [data, setData] = useState<SBSReport | null>(initialData);
  const [asOfDate, setAsOfDate] = useState(initialAsOfDate);
  const [fundId, setFundId] = useState<string>('all');
  const [isPending, startTransition] = useTransition();
  const [drillDown, setDrillDown] = useState<DrillDownParams | null>(null);

  const hasData =
    data &&
    (data.sections.assets.rows.length > 0 ||
      data.sections.liabilities.rows.length > 0 ||
      data.sections.equity.rows.length > 0);

  /* ---- Fetch helper ---- */
  const refetch = useCallback(
    (overrides: { asOfDate?: string; fundId?: string } = {}) => {
      const d = overrides.asOfDate ?? asOfDate;
      const fid = overrides.fundId ?? fundId;

      startTransition(async () => {
        const { data: newData, error } = await getBalanceSheetReport({
          organisationId: orgId,
          asOfDate: d,
          fundId: fid === 'all' ? undefined : fid,
        });

        if (error) toast.error(error);
        if (newData) setData(newData);
      });
    },
    [orgId, asOfDate, fundId],
  );

  const handleDateChange = (newDate: string) => {
    setAsOfDate(newDate);
    refetch({ asOfDate: newDate });
  };

  const handleFundChange = (newFund: string) => {
    setFundId(newFund);
    refetch({ fundId: newFund });
  };

  const handleExportCsv = () => {
    if (!data) return;
    const csv = buildCsv(data);
    downloadCsv(csv, `balance-sheet-${asOfDate}.csv`);
    toast.success('CSV downloaded.');
  };

  const openDrillDown = (row: SBSAccountRow) => {
    setDrillDown({
      organisationId: orgId,
      accountId: row.accountId,
      accountName: row.accountName,
      startDate: '1900-01-01',
      endDate: asOfDate,
      fundId: fundId === 'all' ? undefined : fundId,
      title: `Activity supporting ${row.accountName}`,
    });
  };

  const metadata: ReportMetadata | undefined = data
    ? {
        scope: buildDateScope({ asOfDate }),
        comparison: 'Accounting equation: assets = liabilities + equity',
        source: 'Posted journals only, filtered by reporting date and optional fund scope.',
        filters: [
          { label: 'As of', value: asOfDate },
          {
            label: 'Fund',
            value: buildFundFilterLabel(
              fundId === 'all' ? null : fundId,
              funds,
            ),
          },
        ],
        footnotes: [
          {
            text: 'Balance sheet amounts are cumulative balances up to the selected date, not period movement.',
          },
        ],
      }
    : undefined;

  const kpis: ReportKpi[] | undefined = data
    ? [
        {
          label: 'Assets',
          value: formatCurrencyFromPence(data.sections.assets.total),
        },
        {
          label: 'Liabilities',
          value: formatCurrencyFromPence(data.sections.liabilities.total),
        },
        {
          label: 'Net Assets',
          value: formatCurrencyFromPence(data.netAssets),
          tone: data.netAssets >= 0 ? 'positive' : 'caution',
        },
        {
          label: 'Equation Check',
          value: data.check.balances ? 'Balanced' : 'Out of balance',
          helper: data.check.balances
            ? 'Assets reconcile to liabilities plus equity.'
            : `Difference ${formatCurrencyFromPence(data.check.difference)}.`,
          tone: data.check.balances ? 'positive' : 'critical',
        },
      ]
    : undefined;

  const definitions: ReportDefinition[] = [
    {
      term: 'Assets',
      meaning: 'Resources the organisation controls, including cash and other balances.',
    },
    {
      term: 'Liabilities',
      meaning: 'Amounts owed by the organisation at the reporting date.',
    },
    {
      term: 'Net assets / equity',
      meaning: 'The residual value after liabilities are deducted from assets.',
    },
  ];

  /* ---- Render ---- */
  return (
    <ReportShell
      title="Balance Sheet"
      asOfDate={asOfDate}
      description="Assets, liabilities, and net assets as of a date."
      activeReport="/reports/balance-sheet"
      action={
        <ReportFilterBar>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">As of date</span>
            <input
              type="date"
              className={SELECT_CLASS}
              value={asOfDate}
              onChange={(e) => handleDateChange(e.target.value)}
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Fund</span>
            <select
              className={SELECT_CLASS}
              value={fundId}
              onChange={(e) => handleFundChange(e.target.value)}
            >
              <option value="all">All Funds</option>
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
      insights={data ? buildBalanceSheetInsights(data) : undefined}
      definitions={definitions}
    >
      {/* ---- Loading ---- */}
      {isPending && (
        <p className="text-sm text-muted-foreground">Loading...</p>
      )}

      {/* ---- Empty state ---- */}
      {!isPending && !hasData && (
        <ReportEmptyState
          title="No balance sheet data for this date"
          description={`No posted balances were found as of ${asOfDate}. Post journals to populate the statement of financial position.`}
        />
      )}

      {/* ---- Table ---- */}
      {hasData && data && (
        <ReportTableCard
          title="Statement of Financial Position"
          description="Click an account row to inspect the supporting journal activity up to the selected date."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Code</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Assets */}
              <SectionBlock
                label="Assets"
                section={data.sections.assets}
                onDrillDown={openDrillDown}
              />

              {/* Liabilities */}
              <SectionBlock
                label="Liabilities"
                section={data.sections.liabilities}
                onDrillDown={openDrillDown}
              />

              {/* Equity */}
              <SectionBlock
                label="Equity"
                section={data.sections.equity}
                onDrillDown={openDrillDown}
              />
            </TableBody>
          </Table>
        </ReportTableCard>
      )}

      {/* ---- Summary cards ---- */}
      {hasData && data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SummaryMetricCard
            label="Net Assets"
            value={<span className="tabular-nums">{formatPounds(data.netAssets)}</span>}
            helper="Residual value after liabilities are deducted from assets."
          />

          <SummaryMetricCard
            label="Accounting Equation"
            value={
              <div className="flex items-center gap-2">
                {data.check.balances ? (
                  <Badge className="bg-emerald-100 text-emerald-800 text-xs">
                    Balanced
                  </Badge>
                ) : (
                  <>
                    <Badge variant="destructive" className="text-xs">
                      Out of balance
                    </Badge>
                    <span className="text-sm text-destructive font-medium tabular-nums">
                      {formatPounds(data.check.difference)}
                    </span>
                  </>
                )}
              </div>
            }
            helper="Assets should equal liabilities plus equity."
          />
        </div>
      )}

      {/* ---- Footer ---- */}
      {hasData && (
        <p className="text-xs text-muted-foreground">
          Balance Sheet as of {asOfDate}
        </p>
      )}

      <DrillDownDialog params={drillDown} onClose={() => setDrillDown(null)} />
    </ReportShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function SectionBlock({
  label,
  section,
  onDrillDown,
}: {
  label: string;
  section: SBSSection;
  onDrillDown: (row: SBSAccountRow) => void;
}) {
  return (
    <>
      {/* Section header */}
      <TableRow>
        <TableCell colSpan={3} className="font-semibold bg-muted/50">
          {label}
        </TableCell>
      </TableRow>

      {/* Account rows */}
      {section.rows.length === 0 ? (
        <TableRow>
          <TableCell colSpan={3} className="text-sm text-muted-foreground italic">
            No {label.toLowerCase()} accounts
          </TableCell>
        </TableRow>
      ) : (
        section.rows.map((row) => (
          <AccountRow key={row.accountId} row={row} onDrillDown={onDrillDown} />
        ))
      )}

      {/* Section total */}
      <TableRow className="font-bold border-t">
        <TableCell />
        <TableCell>Total {label}</TableCell>
        <TableCell className="text-right tabular-nums">
          {penceToPounds(section.total)}
        </TableCell>
      </TableRow>
    </>
  );
}

function AccountRow({
  row,
  onDrillDown,
}: {
  row: SBSAccountRow;
  onDrillDown: (row: SBSAccountRow) => void;
}) {
  return (
    <TableRow className="cursor-pointer hover:bg-primary/5" onClick={() => onDrillDown(row)}>
      <TableCell className="font-mono text-xs">{row.accountCode}</TableCell>
      <TableCell className="text-primary hover:underline">{row.accountName}</TableCell>
      <TableCell className="text-right tabular-nums">
        {penceToPounds(row.balance)}
      </TableCell>
    </TableRow>
  );
}
