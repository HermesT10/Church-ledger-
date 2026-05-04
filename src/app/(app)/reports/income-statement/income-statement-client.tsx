'use client';

import { useState, useCallback } from 'react';
import { getIncomeExpenditureReport } from '@/lib/reports/actions';
import { exportIncomeExpenditureCsv } from '@/lib/exports/actions';
import type { SIEReport } from '@/lib/reports/types';
import { DrillDownDialog, type DrillDownParams } from '@/components/reports/drill-down-dialog';
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
import { Badge } from '@/components/ui/badge';
import { Download, Loader2 } from 'lucide-react';
import { ReportShell } from '@/components/reports/report-shell';
import { ReportEmptyState } from '@/components/reports/report-empty-state';
import { ReportFilterBar } from '@/components/reports/report-filter-bar';
import { ReportTableCard } from '@/components/reports/report-table-card';
import { SummaryMetricCard } from '@/components/finance';
import { buildIncomeStatementInsights } from '@/lib/reports/insights';
import {
  buildDateScope,
  buildFundFilterLabel,
  formatCurrencyFromPence,
  type ReportDefinition,
  type ReportKpi,
  type ReportMetadata,
} from '@/lib/reports/framework';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
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
  initialData: SIEReport | null;
  orgId: string;
  role: string;
  funds: { id: string; name: string }[];
  defaultYear: number;
  defaultMonth: number;
  error?: string | null;
}

export function IncomeStatementClient({
  initialData,
  orgId,
  role,
  funds,
  defaultYear,
  defaultMonth,
  error,
}: Props) {
  const [report, setReport] = useState<SIEReport | null>(initialData);
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [fundId, setFundId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [drillDown, setDrillDown] = useState<DrillDownParams | null>(null);

  const canExport = role === 'admin' || role === 'treasurer';

  const openDrillDown = (accountId: string, accountName: string) => {
    const lastDay = new Date(year, month, 0).getDate();
    setDrillDown({
      organisationId: orgId,
      accountId,
      accountName,
      startDate: `${year}-${String(month).padStart(2, '0')}-01`,
      endDate: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      fundId: fundId,
    });
  };

  const reload = useCallback(
    async (y: number, m: number, f: string | null) => {
      setLoading(true);
      try {
        const { data } = await getIncomeExpenditureReport({
          organisationId: orgId,
          year: y,
          month: m,
          fundId: f,
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
    reload(y, month, fundId);
  };

  const handleMonthChange = (v: string) => {
    const m = Number(v);
    setMonth(m);
    reload(year, m, fundId);
  };

  const handleFundChange = (v: string) => {
    const f = v === '__all__' ? null : v;
    setFundId(f);
    reload(year, month, f);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data: csv, error } = await exportIncomeExpenditureCsv({
        year,
        month,
        fundId,
      });
      if (csv && !error) {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `income-statement-${year}-${String(month).padStart(2, '0')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting(false);
    }
  };

  const years = Array.from({ length: 5 }, (_, i) => defaultYear - i);

  const incomeCategory = report?.categories.find((c) => c.categoryName === 'Income');
  const expenseCategory = report?.categories.find((c) => c.categoryName === 'Expenses');

  const asOfLabel = report ? `${MONTHS[month - 1]} ${year}` : undefined;
  const metadata: ReportMetadata | undefined = report
    ? {
        scope: buildDateScope({ year, month, ytd: true }),
        comparison: `${MONTHS[month - 1]} monthly result plus year-to-date totals`,
        source: 'Posted journals and journal lines for income and expense accounts.',
        filters: [
          { label: 'Year', value: String(year) },
          { label: 'Month', value: MONTHS[month - 1] },
          { label: 'Fund', value: buildFundFilterLabel(fundId, funds) },
        ],
        footnotes: [
          {
            text: 'Only posted journals are included so draft or approved-but-unposted activity is excluded.',
          },
          {
            text: 'Each account row can be drilled back to the underlying journal activity for the selected scope.',
          },
        ],
      }
    : undefined;

  const kpis: ReportKpi[] | undefined = report
    ? [
        {
          label: `${MONTHS[month - 1]} Net Result`,
          value: formatCurrencyFromPence(report.totals.monthlyActual),
          helper: 'Income less expenditure for the selected month.',
          tone: report.totals.monthlyActual >= 0 ? 'positive' : 'critical',
        },
        {
          label: 'Year To Date',
          value: formatCurrencyFromPence(report.totals.ytdActual),
          helper: 'Cumulative net result from the start of the year.',
          tone: report.totals.ytdActual >= 0 ? 'positive' : 'caution',
        },
        {
          label: 'Income',
          value: formatCurrencyFromPence(incomeCategory?.totals.ytdActual ?? 0),
          helper: 'Total posted income year to date.',
          tone: 'positive',
        },
        {
          label: 'Expenses',
          value: formatCurrencyFromPence(expenseCategory?.totals.ytdActual ?? 0),
          helper: 'Total posted expenditure year to date.',
        },
      ]
    : undefined;

  const definitions: ReportDefinition[] = [
    {
      term: 'Monthly actual',
      meaning: 'Posted activity in the selected month only.',
    },
    {
      term: 'Year to date',
      meaning: 'Posted activity from the start of the financial year up to the selected month.',
    },
    {
      term: 'Net surplus / deficit',
      meaning: 'Income less expenditure. Positive is a surplus; negative is a deficit.',
    },
  ];

  return (
    <ReportShell
      title="Income Statement"
      asOfDate={asOfLabel}
      description="Revenue and expenses by account, with monthly and year-to-date totals."
      activeReport="/reports/income-statement"
      action={
        <ReportFilterBar className="items-center">
        <Select value={String(year)} onValueChange={handleYearChange}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(month)} onValueChange={handleMonthChange}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map((m, idx) => (
              <SelectItem key={idx + 1} value={String(idx + 1)}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={fundId ?? '__all__'} onValueChange={handleFundChange}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Funds" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Funds</SelectItem>
            {funds.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {canExport && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? <Loader2 size={14} className="animate-spin mr-1" /> : <Download size={14} className="mr-1" />}
            Export CSV
          </Button>
        )}

        {loading && <Loader2 size={16} className="animate-spin text-muted-foreground" />}
        </ReportFilterBar>
      }
      error={error}
      metadata={metadata}
      kpis={kpis}
      insights={report ? buildIncomeStatementInsights(report) : undefined}
      definitions={definitions}
    >
      {!report && !loading && (
        <ReportEmptyState
          title="No income statement data available"
          description="Post income and expense journals to populate this report."
        />
      )}

      {report && (
        <div className="space-y-6">
          {/* Income Section */}
          <IncomeExpenseSection
            title="Income"
            category={incomeCategory}
            monthLabel={MONTHS[month - 1]}
            onDrillDown={openDrillDown}
          />

          {/* Expenses Section */}
          <IncomeExpenseSection
            title="Expenses"
            category={expenseCategory}
            monthLabel={MONTHS[month - 1]}
            onDrillDown={openDrillDown}
          />

          {/* Net Position */}
          <div className="grid gap-4 md:grid-cols-2">
            <SummaryMetricCard
              label="Net Monthly Result"
              value={<span className="font-mono">{penceToPounds(report.totals.monthlyActual)}</span>}
              helper={`${MONTHS[month - 1]} surplus or deficit.`}
            />
            <SummaryMetricCard
              label="Net Year To Date"
              value={<span className="font-mono">{penceToPounds(report.totals.ytdActual)}</span>}
              helper="Cumulative position from the start of the year."
            />
          </div>
        </div>
      )}

      <DrillDownDialog params={drillDown} onClose={() => setDrillDown(null)} />
    </ReportShell>
  );
}

function IncomeExpenseSection({
  title,
  category,
  monthLabel,
  onDrillDown,
}: {
  title: string;
  category: { rows: { accountId: string; accountCode: string; accountName: string; monthlyActual: number; ytdActual: number }[]; totals: { monthlyActual: number; ytdActual: number } } | undefined;
  monthLabel: string;
  onDrillDown: (accountId: string, accountName: string) => void;
}) {
  if (!category) return null;

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-base font-semibold">
        {title}
        <Badge variant={title === 'Income' ? 'default' : 'secondary'}>
          {category.rows.length} accounts
        </Badge>
      </h3>

      <ReportTableCard description={`${title} accounts for ${monthLabel} and the selected year-to-date scope.`}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Code</TableHead>
            <TableHead>Account</TableHead>
            <TableHead className="text-right w-36">{monthLabel}</TableHead>
            <TableHead className="text-right w-36">Year to Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {category.rows
            .filter((r) => r.monthlyActual !== 0 || r.ytdActual !== 0)
            .map((row) => (
              <TableRow
                key={row.accountId}
                className="cursor-pointer hover:bg-primary/5"
                onClick={() => onDrillDown(row.accountId, row.accountName)}
              >
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {row.accountCode}
                </TableCell>
                <TableCell className="text-primary hover:underline">
                  {row.accountName}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {penceToPounds(row.monthlyActual)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm font-medium">
                  {penceToPounds(row.ytdActual)}
                </TableCell>
              </TableRow>
            ))}

          {/* Section totals */}
          <TableRow className="bg-muted/50 font-semibold">
            <TableCell />
            <TableCell>Total {title}</TableCell>
            <TableCell className="text-right font-mono text-sm">
              {penceToPounds(category.totals.monthlyActual)}
            </TableCell>
            <TableCell className="text-right font-mono text-sm">
              {penceToPounds(category.totals.ytdActual)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      </ReportTableCard>
    </div>
  );
}
