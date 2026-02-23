'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getSOFAReport } from '@/lib/reports/glReports';
import type { SSOFAReport, SSOFARow } from '@/lib/reports/types';
import { ReportShell } from '@/components/reports/report-shell';

function pence(v: number) {
  if (v === 0) return '-';
  return `£${(v / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;
}

interface Props {
  initialReport: SSOFAReport | null;
  error?: string | null;
}

export function SOFAClient({ initialReport, error }: Props) {
  const [report, setReport] = useState(initialReport);
  const [year, setYear] = useState(initialReport?.year ?? new Date().getFullYear());
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await getSOFAReport({ year });
    setReport(data);
    setLoading(false);
  }, [year]);

  if (!report) {
    return (
      <ReportShell
        title="Statement of Financial Activities (SOFA)"
        description="Statement of Financial Activities by fund type."
        activeReport="/reports/sofa"
        error={error}
      >
        <p className="text-muted-foreground">No data available.</p>
      </ReportShell>
    );
  }

  function renderRows(rows: SSOFARow[]) {
    return rows.map((row) => (
      <tr key={row.accountId} className="border-b">
        <td className="py-2 pr-4 font-mono text-xs">{row.accountCode}</td>
        <td className="py-2 pr-4">{row.accountName}</td>
        <td className="py-2 text-right tabular-nums">{pence(row.unrestrictedPence)}</td>
        <td className="py-2 text-right tabular-nums">{pence(row.restrictedPence)}</td>
        <td className="py-2 text-right tabular-nums">{pence(row.designatedPence)}</td>
        <td className="py-2 text-right tabular-nums font-medium">{pence(row.totalPence)}</td>
      </tr>
    ));
  }

  function renderTotalRow(label: string, t: { unrestrictedPence: number; restrictedPence: number; designatedPence: number; totalPence: number }) {
    return (
      <tr className="border-t-2 font-semibold">
        <td colSpan={2} className="py-2">{label}</td>
        <td className="py-2 text-right tabular-nums">{pence(t.unrestrictedPence)}</td>
        <td className="py-2 text-right tabular-nums">{pence(t.restrictedPence)}</td>
        <td className="py-2 text-right tabular-nums">{pence(t.designatedPence)}</td>
        <td className="py-2 text-right tabular-nums">{pence(t.totalPence)}</td>
      </tr>
    );
  }

  return (
    <ReportShell
      title="Statement of Financial Activities (SOFA)"
      asOfDate={String(report.year)}
      description="Statement of Financial Activities by fund type."
      activeReport="/reports/sofa"
      action={
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-sm text-muted-foreground block">Year</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="flex h-9 w-28 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
            />
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      }
      error={error}
    >
      <Card className="rounded-2xl shadow-sm border">
        <CardHeader>
          <CardTitle className="text-base">SOFA — Year {report.year}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4">Code</th>
                  <th className="py-2 pr-4">Account</th>
                  <th className="py-2 text-right">Unrestricted</th>
                  <th className="py-2 text-right">Restricted</th>
                  <th className="py-2 text-right">Designated</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {report.incomeRows.length > 0 && (
                  <>
                    <tr>
                      <td colSpan={6} className="pt-4 pb-2 font-semibold text-green-700">Income</td>
                    </tr>
                    {renderRows(report.incomeRows)}
                    {renderTotalRow('Total Income', report.incomeTotals)}
                  </>
                )}
                {report.expenditureRows.length > 0 && (
                  <>
                    <tr>
                      <td colSpan={6} className="pt-4 pb-2 font-semibold text-red-700">Expenditure</td>
                    </tr>
                    {renderRows(report.expenditureRows)}
                    {renderTotalRow('Total Expenditure', report.expenditureTotals)}
                  </>
                )}
              </tbody>
              <tfoot>
                {renderTotalRow('Net Movement', report.netTotals)}
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </ReportShell>
  );
}
