'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getTrialBalance } from '@/lib/reports/glReports';
import type { STrialBalanceReport } from '@/lib/reports/types';
import { ReportShell } from '@/components/reports/report-shell';
import { ReportFilterBar } from '@/components/reports/report-filter-bar';

const FILTER_SELECT_CLASS = 'h-10 w-full rounded-xl border border-input bg-card px-3 text-sm shadow-xs outline-none transition focus:border-primary/30 focus:ring-[3px] focus:ring-primary/10';

function pence(v: number) {
  return `£${(v / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;
}

interface Props {
  initialReport: STrialBalanceReport | null;
  funds: { id: string; name: string }[];
  error?: string | null;
}

export function TrialBalanceClient({ initialReport, funds, error }: Props) {
  const [report, setReport] = useState(initialReport);
  const [asOfDate, setAsOfDate] = useState(initialReport?.asOfDate ?? new Date().toISOString().slice(0, 10));
  const [fundId, setFundId] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await getTrialBalance({ asOfDate, fundId: fundId || null });
    setReport(data);
    setLoading(false);
  }, [asOfDate, fundId]);

  if (!report) {
    return (
      <ReportShell
        title="Trial Balance"
        description="All accounts with debit and credit totals."
        activeReport="/reports/trial-balance"
        error={error}
      >
        <p className="text-muted-foreground">No data available.</p>
      </ReportShell>
    );
  }

  return (
    <ReportShell
      title="Trial Balance"
      asOfDate={report.asOfDate}
      description="All accounts with debit and credit totals."
      activeReport="/reports/trial-balance"
      action={
        <ReportFilterBar>
          <label className="space-y-1.5">
            <span className="block text-xs font-semibold text-muted-foreground">As of date</span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className={FILTER_SELECT_CLASS}
            />
          </label>
          <label className="space-y-1.5">
            <span className="block text-xs font-semibold text-muted-foreground">Fund</span>
            <select
              value={fundId}
              onChange={(e) => setFundId(e.target.value)}
              className={FILTER_SELECT_CLASS}
            >
              <option value="">All Funds</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </label>
          <Button variant="outline" size="sm" className="h-10 self-end rounded-xl" onClick={refresh} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </ReportFilterBar>
      }
      error={error}
    >
      <Card className="rounded-2xl shadow-sm border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Trial Balance as of {report.asOfDate}</CardTitle>
          <Badge variant={report.isBalanced ? 'default' : 'destructive'}>
            {report.isBalanced ? 'Balanced' : 'UNBALANCED'}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4">Code</th>
                  <th className="py-2 pr-4">Account</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4 text-right">Debit</th>
                  <th className="py-2 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.accountId} className="border-b">
                    <td className="py-2 pr-4 font-mono text-xs">{row.accountCode}</td>
                    <td className="py-2 pr-4">{row.accountName}</td>
                    <td className="py-2 pr-4 capitalize">{row.accountType}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {row.netBalancePence > 0 ? pence(row.netBalancePence) : ''}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {row.netBalancePence < 0 ? pence(Math.abs(row.netBalancePence)) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <td colSpan={3} className="py-2">Total</td>
                  <td className="py-2 text-right tabular-nums">{pence(report.totalDebitPence)}</td>
                  <td className="py-2 text-right tabular-nums">{pence(report.totalCreditPence)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </ReportShell>
  );
}
