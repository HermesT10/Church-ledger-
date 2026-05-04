'use client';

import { useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getCashPositionReport } from '@/lib/reports/glReports';
import type { SCashPositionReport } from '@/lib/reports/types';
import { ReportShell } from '@/components/reports/report-shell';
import { ReportEmptyState } from '@/components/reports/report-empty-state';
import { ReportFilterBar } from '@/components/reports/report-filter-bar';
import { ReportTableCard } from '@/components/reports/report-table-card';
import { buildCashPositionInsights } from '@/lib/reports/insights';
import {
  buildDateScope,
  formatCurrencyFromPence,
  type ReportDefinition,
  type ReportKpi,
  type ReportMetadata,
} from '@/lib/reports/framework';

function pence(v: number | null) {
  if (v === null) return 'N/A';
  return `£${(v / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;
}

interface Props {
  initialReport: SCashPositionReport | null;
  error?: string | null;
}

export function CashPositionClient({ initialReport, error }: Props) {
  const [report, setReport] = useState(initialReport);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await getCashPositionReport();
    setReport(data);
    setLoading(false);
  }, []);

  if (!report) {
    return (
      <ReportShell
        title="Cash Position"
        description="Bank balances compared to GL balances."
        activeReport="/reports/cash-position"
        error={error}
      >
        <ReportEmptyState
          title="No cash position data available"
          description="Add bank accounts and reconcile activity to populate this report."
        />
      </ReportShell>
    );
  }

  const metadata: ReportMetadata = {
    scope: buildDateScope({ asOfDate: report.asOfDate }),
    comparison: 'Latest statement balance compared with the linked general ledger balance',
    source: 'Bank accounts, statement balances, and posted general ledger cash balances.',
    footnotes: [
      {
        text: 'Differences should usually be explained by outstanding reconciliation work or missing bank imports.',
      },
    ],
  };

  const kpis: ReportKpi[] = [
    {
      label: 'Statement Cash',
      value: formatCurrencyFromPence(report.totalStatementPence),
    },
    {
      label: 'Ledger Cash',
      value: formatCurrencyFromPence(report.totalGLPence),
    },
    {
      label: 'Difference',
      value: formatCurrencyFromPence(report.totalDifferencePence),
      tone: report.totalDifferencePence === 0 ? 'positive' : 'critical',
    },
    {
      label: 'Accounts',
      value: String(report.rows.length),
      helper: 'Active bank accounts included in the report.',
    },
  ];

  const definitions: ReportDefinition[] = [
    {
      term: 'Statement balance',
      meaning: 'The latest known closing balance from the bank statement or imported bank feed.',
    },
    {
      term: 'GL balance',
      meaning: 'The posted balance of the linked cash ledger account.',
    },
    {
      term: 'Difference',
      meaning: 'The amount that still needs reconciliation between bank evidence and the ledger.',
    },
  ];

  return (
    <ReportShell
      title="Cash Position"
      asOfDate={report.asOfDate}
      description="Bank balances compared to GL balances."
      activeReport="/reports/cash-position"
      action={
        <ReportFilterBar>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </ReportFilterBar>
      }
      error={error}
      metadata={metadata}
      kpis={kpis}
      insights={buildCashPositionInsights(report)}
      definitions={definitions}
    >
      <ReportTableCard
        title="Cash Position Summary"
        description="Use this table to compare imported statement balances with linked ledger balances."
      >
        <div className="p-6">
          {report.rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">No bank accounts configured.</p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">Bank Account</th>
                    <th className="py-2 text-right">Statement Balance</th>
                    <th className="py-2 text-right">GL Balance</th>
                    <th className="py-2 text-right">Difference</th>
                    <th className="py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.bankAccountId} className="border-b">
                      <td className="py-2 pr-4 font-medium">{row.bankAccountName}</td>
                      <td className="py-2 text-right tabular-nums">{pence(row.bankStatementBalancePence)}</td>
                      <td className="py-2 text-right tabular-nums">{pence(row.glBalancePence)}</td>
                      <td className={`py-2 text-right tabular-nums ${row.differencePence !== 0 ? 'text-destructive font-medium' : ''}`}>
                        {pence(row.differencePence)}
                      </td>
                      <td className="py-2 text-center">
                        <Badge variant={row.differencePence === 0 ? 'default' : 'destructive'}>
                          {row.differencePence === 0 ? 'Reconciled' : 'Difference'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="py-2">Total</td>
                    <td className="py-2 text-right tabular-nums">{pence(report.totalStatementPence)}</td>
                    <td className="py-2 text-right tabular-nums">{pence(report.totalGLPence)}</td>
                    <td className={`py-2 text-right tabular-nums ${report.totalDifferencePence !== 0 ? 'text-destructive' : ''}`}>
                      {pence(report.totalDifferencePence)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </ReportTableCard>
    </ReportShell>
  );
}
