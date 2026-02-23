'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getCashPositionReport } from '@/lib/reports/glReports';
import type { SCashPositionReport } from '@/lib/reports/types';
import { ReportShell } from '@/components/reports/report-shell';

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
        <p className="text-muted-foreground">No data available.</p>
      </ReportShell>
    );
  }

  return (
    <ReportShell
      title="Cash Position"
      asOfDate={report.asOfDate}
      description="Bank balances compared to GL balances."
      activeReport="/reports/cash-position"
      action={
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </Button>
      }
      error={error}
    >
      <Card className="rounded-2xl shadow-sm border">
        <CardHeader>
          <CardTitle className="text-base">Cash Position Summary</CardTitle>
        </CardHeader>
        <CardContent>
          {report.rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">No bank accounts configured.</p>
          ) : (
            <div className="overflow-x-auto">
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
        </CardContent>
      </Card>
    </ReportShell>
  );
}
