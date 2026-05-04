'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ReportEmptyState } from '@/components/reports/report-empty-state';
import { ReportShell } from '@/components/reports/report-shell';
import type { SBankReconciliationSummaryReport } from '@/lib/reports/types';
import { formatCurrencyFromPence, type ReportDefinition, type ReportInsight, type ReportKpi, type ReportMetadata } from '@/lib/reports/framework';

interface Props {
  initialData: SBankReconciliationSummaryReport | null;
  error?: string | null;
}

function buildCsv(data: SBankReconciliationSummaryReport): string {
  const lines = [
    'Bank Account,Statement Date,Statement Balance,GL Balance,Difference,Unreconciled Lines,Status',
    ...data.rows.map((row) =>
      [
        row.bankAccountName,
        row.lastStatementDate ?? 'N/A',
        row.statementBalancePence === null ? 'N/A' : formatCurrencyFromPence(row.statementBalancePence),
        formatCurrencyFromPence(row.glBalancePence),
        formatCurrencyFromPence(row.differencePence),
        row.unreconciledLines,
        row.isBalanced ? 'Balanced' : 'Difference',
      ].join(','),
    ),
  ];

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

export function BankReconciliationSummaryClient({ initialData, error }: Props) {
  const metadata: ReportMetadata | undefined = initialData
    ? {
        scope: `As of ${initialData.asOfDate}`,
        comparison: 'Statement balance vs general ledger by active bank account',
        source: 'Latest reconciliation record, imported bank lines, and posted ledger balances.',
        filters: [
          { label: 'Status scope', value: 'Active bank accounts' },
          { label: 'Date', value: initialData.asOfDate },
        ],
        footnotes: [
          {
            text: 'A zero difference means the latest statement balance agrees to the ledger balance for that bank account.',
          },
          {
            text: 'Unreconciled line counts reflect bank lines that are still unmatched or not locked into a final reconciliation.',
          },
        ],
      }
    : undefined;

  const kpis: ReportKpi[] | undefined = initialData
    ? [
        {
          label: 'Statement Cash',
          value: formatCurrencyFromPence(initialData.totals.statementBalancePence),
          helper: 'Sum of latest statement balances on file.',
        },
        {
          label: 'Ledger Cash',
          value: formatCurrencyFromPence(initialData.totals.glBalancePence),
          helper: 'Sum of the linked bank control accounts.',
        },
        {
          label: 'Difference',
          value: formatCurrencyFromPence(initialData.totals.differencePence),
          helper: 'Group-level reconciliation gap across bank accounts.',
          tone: initialData.totals.differencePence === 0 ? 'positive' : 'critical',
        },
        {
          label: 'Unreconciled Lines',
          value: String(initialData.totals.unreconciledLines),
          helper: 'Bank lines still awaiting reconciliation work.',
          tone: initialData.totals.unreconciledLines === 0 ? 'positive' : 'caution',
        },
      ]
    : undefined;

  const outOfBalanceCount =
    initialData?.rows.filter((row) => !row.isBalanced).length ?? 0;

  const insights: ReportInsight[] | undefined = initialData
    ? [
        {
          title:
            outOfBalanceCount === 0
              ? 'Cash reconciliation looks clean'
              : 'Cash trust needs attention',
          body:
            outOfBalanceCount === 0
              ? 'All active bank accounts currently agree between statement and ledger.'
              : `${outOfBalanceCount} bank account${outOfBalanceCount === 1 ? '' : 's'} are out of balance and should be reviewed before month-end sign-off.`,
          tone: outOfBalanceCount === 0 ? 'positive' : 'critical',
        },
        {
          title: 'Use this report before board circulation',
          body: 'This page helps confirm that reported cash is supported by both statements and posted journals. Open reconciliation for any row with a difference or a high count of unreconciled items.',
          tone: 'neutral',
        },
      ]
    : undefined;

  const definitions: ReportDefinition[] = [
    {
      term: 'Statement balance',
      meaning: 'The closing bank balance from the latest statement or reconciliation record in the system.',
    },
    {
      term: 'Ledger cash',
      meaning: 'The balance of the linked bank control account in the posted general ledger.',
    },
    {
      term: 'Unreconciled line',
      meaning: 'A bank line that has not yet been matched and locked into a completed reconciliation.',
    },
  ];

  return (
    <ReportShell
      title="Bank Reconciliation Summary"
      description="Trust report for cash, statement support, and outstanding bank reconciliation work."
      activeReport="/reports/bank-reconciliation-summary"
      error={error}
      metadata={metadata}
      kpis={kpis}
      insights={insights}
      definitions={definitions}
      action={
        initialData ? (
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  buildCsv(initialData),
                  `bank-reconciliation-summary-${initialData.asOfDate}.csv`,
                )
              }
            >
              Export CSV
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/reconciliation">Open Reconciliation</Link>
            </Button>
          </div>
        ) : undefined
      }
    >
      {!initialData ? (
        <ReportEmptyState
          title="No bank reconciliation data yet"
          description="Add bank accounts, import statements, and complete reconciliations to populate this report."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/reconciliation">Go to Reconciliation</Link>
            </Button>
          }
        />
      ) : (
        <Card className="rounded-2xl border shadow-sm">
          <CardContent className="p-6">
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bank Account</TableHead>
                    <TableHead>Latest Statement</TableHead>
                    <TableHead className="text-right">Statement</TableHead>
                    <TableHead className="text-right">Ledger</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                    <TableHead className="text-right">Unreconciled</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {initialData.rows.map((row) => (
                    <TableRow key={row.bankAccountId}>
                      <TableCell className="font-medium">{row.bankAccountName}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span>{row.lastStatementDate ?? 'No statement'}</span>
                          <Badge variant={row.isBalanced ? 'default' : 'destructive'}>
                            {row.isBalanced ? 'Balanced' : 'Difference'}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {row.statementBalancePence === null
                          ? 'N/A'
                          : formatCurrencyFromPence(row.statementBalancePence)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrencyFromPence(row.glBalancePence)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrencyFromPence(row.differencePence)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {row.unreconciledLines}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="ghost" size="sm">
                          <Link href="/reconciliation">Review</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </ReportShell>
  );
}
