'use client';

import { useState, useCallback } from 'react';
import { getCashFlowReport } from '@/lib/reports/actions';
import type { SCashFlowReport } from '@/lib/reports/types';
import { Button } from '@/components/ui/button';
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
import { Loader2 } from 'lucide-react';
import { ReportShell } from '@/components/reports/report-shell';

const MONTHS = [
  'Full Year', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function penceToPounds(pence: number): string {
  const val = pence / 100;
  return val.toLocaleString('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
  });
}

interface Props {
  initialData: SCashFlowReport | null;
  orgId: string;
  role: string;
  defaultYear: number;
  error?: string | null;
}

export function CashFlowClient({ initialData, orgId, role, defaultYear, error }: Props) {
  const [report, setReport] = useState<SCashFlowReport | null>(initialData);
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(
    async (y: number, m: number | undefined) => {
      setLoading(true);
      try {
        const { data } = await getCashFlowReport({
          organisationId: orgId,
          year: y,
          month: m,
        });
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
    reload(y, month);
  };

  const handleMonthChange = (v: string) => {
    const m = v === '0' ? undefined : Number(v);
    setMonth(m);
    reload(year, m);
  };

  const years = Array.from({ length: 5 }, (_, i) => defaultYear - i);
  const asOfLabel = report ? (month ? `${MONTHS[month]} ${year}` : `${year}`) : undefined;

  return (
    <ReportShell
      title="Cash Flow Statement"
      asOfDate={asOfLabel}
      description="Cash movements through operating, investing, and financing activities."
      activeReport="/reports/cash-flow"
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

        <Select value={String(month ?? 0)} onValueChange={handleMonthChange}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((m, idx) => (
              <SelectItem key={idx} value={String(idx)}>
                {m}
              </SelectItem>
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Opening Balance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold font-mono">
                  {penceToPounds(report.openingBalancePence)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Net Change
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-lg font-semibold font-mono ${report.netChangePence >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {penceToPounds(report.netChangePence)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Closing Balance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold font-mono">
                  {penceToPounds(report.closingBalancePence)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Cash Flow Sections */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right w-40">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Opening */}
              <TableRow className="bg-muted/30 font-semibold">
                <TableCell>Opening Cash Balance</TableCell>
                <TableCell className="text-right font-mono">
                  {penceToPounds(report.openingBalancePence)}
                </TableCell>
              </TableRow>

              {report.sections.map((section) => (
                <>
                  {/* Section header */}
                  <TableRow key={section.label + '-header'} className="border-t-2">
                    <TableCell colSpan={2} className="text-sm font-semibold text-muted-foreground pt-4 pb-1">
                      {section.label}
                    </TableCell>
                  </TableRow>
                  {/* Section items */}
                  {section.items.map((item, idx) => (
                    <TableRow key={`${section.label}-${idx}`}>
                      <TableCell className="pl-6">{item.label}</TableCell>
                      <TableCell className={`text-right font-mono ${item.amountPence < 0 ? 'text-red-600' : ''}`}>
                        {penceToPounds(item.amountPence)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Section total */}
                  <TableRow key={section.label + '-total'} className="font-medium">
                    <TableCell className="pl-6">Net {section.label}</TableCell>
                    <TableCell className={`text-right font-mono ${section.totalPence < 0 ? 'text-red-600' : ''}`}>
                      {penceToPounds(section.totalPence)}
                    </TableCell>
                  </TableRow>
                </>
              ))}

              {/* Net Change */}
              <TableRow className="border-t-2 font-semibold">
                <TableCell>Net Increase / (Decrease) in Cash</TableCell>
                <TableCell className={`text-right font-mono ${report.netChangePence < 0 ? 'text-red-600' : ''}`}>
                  {penceToPounds(report.netChangePence)}
                </TableCell>
              </TableRow>

              {/* Closing */}
              <TableRow className="bg-muted/30 font-semibold">
                <TableCell>Closing Cash Balance</TableCell>
                <TableCell className="text-right font-mono">
                  {penceToPounds(report.closingBalancePence)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          {/* Reconciliation check */}
          <div className="text-xs text-muted-foreground">
            Opening ({penceToPounds(report.openingBalancePence)}) + Net Change ({penceToPounds(report.netChangePence)}) = Closing ({penceToPounds(report.closingBalancePence)})
          </div>
        </div>
      )}
    </ReportShell>
  );
}
