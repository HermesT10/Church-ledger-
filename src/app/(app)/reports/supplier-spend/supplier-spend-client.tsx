'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getSupplierSpendReport } from '@/lib/reports/glReports';
import type { SSupplierSpendReport } from '@/lib/reports/types';
import { ReportShell } from '@/components/reports/report-shell';

function pence(v: number) {
  return `£${(v / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;
}

interface Props {
  initialReport: SSupplierSpendReport | null;
  error?: string | null;
}

export function SupplierSpendClient({ initialReport, error }: Props) {
  const [report, setReport] = useState(initialReport);
  const [year, setYear] = useState(initialReport?.year ?? new Date().getFullYear());
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await getSupplierSpendReport({ year });
    setReport(data);
    setLoading(false);
  }, [year]);

  if (!report) {
    return (
      <ReportShell
        title="Supplier Spend"
        description="Total spending by supplier for the year."
        activeReport="/reports/supplier-spend"
        error={error}
      >
        <p className="text-muted-foreground">No data available.</p>
      </ReportShell>
    );
  }

  return (
    <ReportShell
      title="Supplier Spend"
      asOfDate={String(report.year)}
      description="Total spending by supplier for the year."
      activeReport="/reports/supplier-spend"
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
          <CardTitle className="text-base">Supplier Spend — Year {report.year}</CardTitle>
        </CardHeader>
        <CardContent>
          {report.rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">No supplier-tagged transactions found for this year.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">Supplier</th>
                    <th className="py-2 text-right">Transactions</th>
                    <th className="py-2 text-right">Total Spend</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.supplierId} className="border-b">
                      <td className="py-2 pr-4">{row.supplierName}</td>
                      <td className="py-2 text-right">{row.transactionCount}</td>
                      <td className="py-2 text-right tabular-nums font-medium">{pence(row.totalPence)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold">
                    <td className="py-2">Grand Total</td>
                    <td className="py-2 text-right">{report.rows.reduce((s, r) => s + r.transactionCount, 0)}</td>
                    <td className="py-2 text-right tabular-nums">{pence(report.grandTotalPence)}</td>
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
