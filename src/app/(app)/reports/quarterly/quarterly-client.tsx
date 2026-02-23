'use client';

import { useState, useCallback } from 'react';
import { getQuarterlyReport } from '@/lib/reports/actions';
import { ReportShell } from '@/components/reports/report-shell';
import type { SQuarterlyReport } from '@/lib/reports/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

function penceToPounds(pence: number): string {
  const val = pence / 100;
  return val.toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
  });
}

interface Props {
  initialData: SQuarterlyReport | null;
  orgId: string;
  role: string;
  defaultYear: number;
  error?: string | null;
}

export function QuarterlyClient({ initialData, orgId, role, defaultYear, error }: Props) {
  const [report, setReport] = useState<SQuarterlyReport | null>(initialData);
  const [year, setYear] = useState(defaultYear);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(
    async (y: number) => {
      setLoading(true);
      try {
        const { data } = await getQuarterlyReport({ organisationId: orgId, year: y });
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
      title="Quarterly Report"
      asOfDate={report ? String(year) : undefined}
      description="Quarter-by-quarter income, expenses, and fund balances for the financial year."
      activeReport="/reports/quarterly"
      action={
        <div className="flex flex-wrap items-center gap-3">
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
        </div>
      }
      error={error}
    >
      {!report && !loading && (
        <p className="text-sm text-muted-foreground">No data available.</p>
      )}

      {report && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {report.quarters.map((q) => (
              <Card key={q.quarter}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {q.quarter}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Income</span>
                    <span className="font-mono">{penceToPounds(q.incomeTotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Expenses</span>
                    <span className="font-mono">{penceToPounds(q.expenseTotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold pt-1 border-t">
                    <span>Surplus</span>
                    <span className={`font-mono ${q.surplus >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {penceToPounds(q.surplus)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Quarter-by-Quarter Table */}
          <div>
            <h3 className="text-base font-semibold mb-2">Quarter-by-Quarter Summary</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Income</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Surplus / (Deficit)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.quarters.map((q) => (
                  <TableRow key={q.quarter}>
                    <TableCell className="font-medium">{q.quarter}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {penceToPounds(q.incomeTotal)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {penceToPounds(q.expenseTotal)}
                    </TableCell>
                    <TableCell className={`text-right font-mono text-sm font-medium ${q.surplus >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {penceToPounds(q.surplus)}
                    </TableCell>
                  </TableRow>
                ))}
                {/* Annual Total */}
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell>Annual Total</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {penceToPounds(report.annualTotal.incomeTotal)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {penceToPounds(report.annualTotal.expenseTotal)}
                  </TableCell>
                  <TableCell className={`text-right font-mono text-sm ${report.annualTotal.surplus >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {penceToPounds(report.annualTotal.surplus)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {/* Fund Balances */}
          {report.fundBalances.length > 0 && (
            <div>
              <h3 className="text-base font-semibold mb-2">Fund Balances</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fund</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.fundBalances.map((f) => (
                    <TableRow key={f.fundId}>
                      <TableCell>{f.fundName}</TableCell>
                      <TableCell>
                        <Badge variant={f.fundType === 'restricted' ? 'destructive' : 'secondary'}>
                          {f.fundType}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm ${f.balancePence < 0 ? 'text-red-600' : ''}`}>
                        {penceToPounds(f.balancePence)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </ReportShell>
  );
}
