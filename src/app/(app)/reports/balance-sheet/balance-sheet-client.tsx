'use client';

import { useState, useTransition, useCallback } from 'react';
import { toast } from 'sonner';
import { getBalanceSheetReport } from '@/lib/reports/actions';
import type { SBSReport, SBSSection, SBSAccountRow } from '@/lib/reports/types';
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
import { ReportShell } from '@/components/reports/report-shell';

/* ------------------------------------------------------------------ */
/*  Constants & helpers                                                */
/* ------------------------------------------------------------------ */

const SELECT_CLASS =
  'flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

function penceToPounds(pence: number): string {
  if (pence === 0) return '—';
  const pounds = pence / 100;
  const prefix = pounds < 0 ? '-' : '';
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

  /* ---- Render ---- */
  return (
    <ReportShell
      title="Balance Sheet"
      asOfDate={asOfDate}
      description="Assets, liabilities, and net assets as of a date."
      activeReport="/reports/balance-sheet"
      action={
        <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="text-xs font-medium">As of date</span>
          <input
            type="date"
            className={SELECT_CLASS}
            value={asOfDate}
            onChange={(e) => handleDateChange(e.target.value)}
          />
        </label>

        <label className="space-y-1">
          <span className="text-xs font-medium">Fund</span>
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
          onClick={handleExportCsv}
          disabled={!hasData}
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

      {/* ---- Empty state ---- */}
      {!isPending && !hasData && (
        <p className="text-sm text-muted-foreground">
          No balance sheet data as of {asOfDate}. Post journals to see balances.
        </p>
      )}

      {/* ---- Table ---- */}
      {hasData && data && (
        <div className="rounded-2xl border shadow-sm overflow-x-auto">
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
              />

              {/* Liabilities */}
              <SectionBlock
                label="Liabilities"
                section={data.sections.liabilities}
              />

              {/* Equity */}
              <SectionBlock
                label="Equity"
                section={data.sections.equity}
              />
            </TableBody>
          </Table>
        </div>
      )}

      {/* ---- Summary cards ---- */}
      {hasData && data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Net Assets */}
          <Card className="rounded-2xl shadow-sm border">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Net Assets</p>
              <p className="text-xl font-bold tabular-nums">
                {formatPounds(data.netAssets)}
              </p>
            </CardContent>
          </Card>

          {/* Balance check */}
          <Card className="rounded-2xl shadow-sm border">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Accounting Equation</p>
              <div className="mt-1 flex items-center gap-2">
                {data.check.balances ? (
                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 text-xs">
                    Balanced
                  </Badge>
                ) : (
                  <>
                    <Badge variant="destructive" className="text-xs">
                      Out of balance
                    </Badge>
                    <span className="text-sm text-destructive font-medium tabular-nums">
                      Difference: {formatPounds(data.check.difference)}
                    </span>
                  </>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Assets = Liabilities + Equity
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ---- Footer ---- */}
      {hasData && (
        <p className="text-xs text-muted-foreground">
          Balance Sheet as of {asOfDate}
        </p>
      )}
    </ReportShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function SectionBlock({
  label,
  section,
}: {
  label: string;
  section: SBSSection;
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
          <AccountRow key={row.accountId} row={row} />
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

function AccountRow({ row }: { row: SBSAccountRow }) {
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{row.accountCode}</TableCell>
      <TableCell>{row.accountName}</TableCell>
      <TableCell className="text-right tabular-nums">
        {penceToPounds(row.balance)}
      </TableCell>
    </TableRow>
  );
}
