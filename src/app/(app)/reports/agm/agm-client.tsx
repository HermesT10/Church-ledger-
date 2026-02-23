'use client';

import { useState, useCallback } from 'react';
import { getAGMReport } from '@/lib/reports/actions';
import { ReportShell } from '@/components/reports/report-shell';
import type { SAGMReport } from '@/lib/reports/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

function p(pence: number): string {
  return (pence / 100).toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
  });
}

interface Props {
  initialData: SAGMReport | null;
  orgId: string;
  role: string;
  defaultYear: number;
  error?: string | null;
}

export function AGMClient({ initialData, orgId, role, defaultYear, error }: Props) {
  const [report, setReport] = useState<SAGMReport | null>(initialData);
  const [year, setYear] = useState(defaultYear);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(
    async (y: number) => {
      setLoading(true);
      try {
        const { data } = await getAGMReport({ organisationId: orgId, year: y });
        setReport(data);
      } finally {
        setLoading(false);
      }
    },
    [orgId],
  );

  const handleYearChange = (v: string) => {
    const y = Number(v);
    setYear(y);
    reload(y);
  };

  const years = Array.from({ length: 5 }, (_, i) => defaultYear - i);

  return (
    <ReportShell
      title="AGM Report Pack"
      asOfDate={report ? String(year) : undefined}
      description="A simplified, presentation-ready financial summary suitable for Annual General Meetings."
      activeReport="/reports/agm"
      action={
        <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Select value={String(year)} onValueChange={handleYearChange}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {loading && <Loader2 size={16} className="animate-spin text-muted-foreground" />}

        <button
          className="ml-auto text-sm text-primary hover:underline print:hidden"
          onClick={() => window.print()}
        >
          Print / Save as PDF
        </button>
        </div>
      }
      error={error}
    >
      {!report && !loading && (
        <p className="text-sm text-muted-foreground">No data available.</p>
      )}

      {report && (
        <div className="space-y-8">
          {/* Key Financial Summary */}
          <section>
            <h2 className="text-lg font-semibold mb-4">
              Financial Summary — {report.year}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Income
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold font-mono text-emerald-600">
                    {p(report.totalIncomePence)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Expenses
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold font-mono text-red-600">
                    {p(report.totalExpensePence)}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-2 border-primary/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Net Result
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className={`text-2xl font-bold font-mono ${report.netResultPence >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {p(report.netResultPence)}
                  </p>
                  <Badge
                    variant={report.netResultPence >= 0 ? 'default' : 'destructive'}
                    className="mt-1"
                  >
                    {report.netResultPence >= 0 ? 'Surplus' : 'Deficit'}
                  </Badge>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Restricted Funds */}
          {report.restrictedFunds.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold mb-3">
                Restricted Fund Balances
              </h2>
              <p className="text-sm text-muted-foreground mb-3">
                These funds can only be used for their designated purpose.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fund</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.restrictedFunds.map((f) => (
                    <TableRow key={f.fundName}>
                      <TableCell className="font-medium">{f.fundName}</TableCell>
                      <TableCell className={`text-right font-mono text-sm ${f.balancePence < 0 ? 'text-red-600' : ''}`}>
                        {p(f.balancePence)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          )}

          {/* General Fund Summary */}
          <section>
            <h2 className="text-lg font-semibold mb-3">
              General Fund Balances
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Unrestricted (General)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-lg font-semibold font-mono">
                    {p(report.unrestrictedBalancePence)}
                  </p>
                </CardContent>
              </Card>
              {report.designatedBalancePence !== 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Designated
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-lg font-semibold font-mono">
                      {p(report.designatedBalancePence)}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </section>

          {/* Commentary Placeholder */}
          <section className="print:break-before-page">
            <h2 className="text-lg font-semibold mb-3">
              Treasurer&apos;s Commentary
            </h2>
            <div className="rounded-lg border border-dashed border-muted-foreground/30 p-6 text-sm text-muted-foreground">
              <p>
                This section can be used to provide a narrative summary for the AGM.
                Add context about key financial achievements, challenges, and outlook.
              </p>
              <p className="mt-2 italic">
                Commentary can be added when preparing the printed AGM pack.
              </p>
            </div>
          </section>
        </div>
      )}
    </ReportShell>
  );
}
