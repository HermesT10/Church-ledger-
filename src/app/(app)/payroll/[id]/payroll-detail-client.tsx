'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CheckCircle,
  Trash2,
  ExternalLink,
  Users,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  postPayrollRun,
  deletePayrollRun,
  exportHmrcSummaryCsv,
} from '@/lib/payroll/actions';
import type { PayrollRunDetail } from '@/lib/payroll/types';
import type { OrgSettings } from '@/app/(app)/settings/types';
import { buildPayrollJournalLines } from '@/lib/payroll/validation';
import type { PayrollSplit, PayrollAccountIds } from '@/lib/payroll/validation';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatPounds(pence: number): string {
  return '£' + (pence / 100).toFixed(2);
}

function formatMonth(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

const STATUS_VARIANTS: Record<
  string,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  draft: 'outline',
  posted: 'default',
};

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  run: PayrollRunDetail;
  settings: OrgSettings | null;
  canEdit: boolean;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PayrollDetailClient({ run, settings, canEdit }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState(false);

  const isDraft = run.status === 'draft';
  const isPosted = run.status === 'posted';

  // Build journal preview lines
  const accountsConfigured = !!(
    settings?.payrollSalariesAccountId &&
    settings?.payrollErNicAccountId &&
    settings?.payrollPensionAccountId &&
    settings?.payrollPayeNicLiabilityId &&
    settings?.payrollPensionLiabilityId &&
    settings?.payrollNetPayLiabilityId
  );

  const previewLines = useMemo(() => {
    if (!accountsConfigured || !settings) return [];

    const accountIds: PayrollAccountIds = {
      salariesAccountId: settings.payrollSalariesAccountId!,
      erNicAccountId: settings.payrollErNicAccountId!,
      pensionAccountId: settings.payrollPensionAccountId!,
      payeNicLiabilityId: settings.payrollPayeNicLiabilityId!,
      pensionLiabilityId: settings.payrollPensionLiabilityId!,
      netPayLiabilityId: settings.payrollNetPayLiabilityId!,
    };

    const splits: PayrollSplit[] | undefined =
      run.splits.length > 0
        ? run.splits.map((s) => ({
            fundId: s.fundId,
            amountPence: s.amountPence,
          }))
        : undefined;

    try {
      return buildPayrollJournalLines({
        grossPence: run.totalGrossPence,
        netPence: run.totalNetPence,
        payePence: run.totalPayePence,
        nicPence: run.totalNicPence,
        pensionPence: run.totalPensionPence,
        splits,
        accountIds,
      });
    } catch {
      return [];
    }
  }, [run, settings, accountsConfigured]);

  // Account labels mapping (using account IDs -> placeholder labels)
  const accountLabels: Record<string, string> = useMemo(() => {
    if (!settings) return {};
    return {
      [settings.payrollSalariesAccountId ?? '']: 'Salaries Expense',
      [settings.payrollErNicAccountId ?? '']: 'Employer NIC Expense',
      [settings.payrollPensionAccountId ?? '']: 'Pension Expense',
      [settings.payrollPayeNicLiabilityId ?? '']: 'PAYE/NIC Liability',
      [settings.payrollPensionLiabilityId ?? '']: 'Pension Liability',
      [settings.payrollNetPayLiabilityId ?? '']: 'Net Pay Liability',
    };
  }, [settings]);

  const fundNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of run.splits) {
      if (s.fundId && s.fundName) m.set(s.fundId, s.fundName);
    }
    return m;
  }, [run.splits]);

  const totalDebits = previewLines.reduce((s, l) => s + l.debitPence, 0);
  const totalCredits = previewLines.reduce((s, l) => s + l.creditPence, 0);

  /* ------------------------------------------------------------------ */
  /*  Handlers                                                          */
  /* ------------------------------------------------------------------ */

  function handlePost() {
    startTransition(async () => {
      const result = await postPayrollRun(run.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Payroll run posted and journal created.');
      router.refresh();
    });
  }

  async function handleExportHmrc() {
    const res = await exportHmrcSummaryCsv(run.id);
    if (res.error || !res.data) {
      toast.error(res.error ?? 'Export failed.');
      return;
    }
    const blob = new Blob([res.data], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hmrc-summary-${run.payrollMonth.slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('HMRC summary exported.');
  }

  function handleDelete() {
    if (!confirm('Are you sure you want to delete this draft payroll run?')) {
      return;
    }
    setIsDeleting(true);
    startTransition(async () => {
      const result = await deletePayrollRun(run.id);
      if (result.error) {
        toast.error(result.error);
        setIsDeleting(false);
        return;
      }
      toast.success('Payroll run deleted.');
      router.push('/payroll');
    });
  }

  return (
    <div className="space-y-6">
      <div className="app-toolbar">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link href="/payroll">
              <ArrowLeft size={16} className="mr-1" />
              Back
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">
                Payroll - {formatMonth(run.payrollMonth)}
              </h2>
              <Badge variant={STATUS_VARIANTS[run.status] ?? 'outline'}>
                {run.status === 'draft' ? 'Draft' : 'Posted'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {run.id.slice(0, 8)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDraft && canEdit && (
            <>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isPending || isDeleting}
              >
                <Trash2 size={14} className="mr-1" />
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
              <Button onClick={handlePost} disabled={isPending || !accountsConfigured}>
                <CheckCircle size={14} className="mr-1" />
                {isPending ? 'Posting...' : 'Post Payroll'}
              </Button>
            </>
          )}
          {isPosted && (
            <>
              {run.journalId && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/journals/${run.journalId}`}>
                    <ExternalLink size={14} className="mr-1" />
                    View Journal
                  </Link>
                </Button>
              )}
              {run.payrollLines && run.payrollLines.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleExportHmrc}>
                  <Download size={14} className="mr-1" />
                  HMRC Export
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {!accountsConfigured && isDraft && (
        <div className="rounded-[1.25rem] border border-amber-200/70 bg-amber-50/80 p-3 text-sm text-amber-800">
          Payroll accounts must be configured in{' '}
          <Link href="/settings" className="underline font-medium">
            Settings
          </Link>{' '}
          before posting.
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Gross', value: run.totalGrossPence },
          { label: 'Net Pay', value: run.totalNetPence },
          { label: 'PAYE', value: run.totalPayePence },
          { label: 'Employer NIC', value: run.totalNicPence },
          { label: 'Employer Pension', value: run.totalPensionPence },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="text-lg font-bold">{formatPounds(item.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Employee Payroll Lines */}
      {run.payrollLines && run.payrollLines.length > 0 && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="p-6 pb-0">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-muted-foreground" />
              <CardTitle className="text-base">Employee Breakdown</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-6 pt-4">
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                    <TableHead className="text-right">Pension</TableHead>
                    <TableHead className="text-right">Employer NI</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {run.payrollLines.map((pl) => (
                    <TableRow key={pl.id}>
                      <TableCell className="font-medium">{pl.employee_name}</TableCell>
                      <TableCell className="text-right">{formatPounds(pl.gross_pence)}</TableCell>
                      <TableCell className="text-right">{formatPounds(pl.tax_pence)}</TableCell>
                      <TableCell className="text-right">{formatPounds(pl.pension_pence)}</TableCell>
                      <TableCell className="text-right">{formatPounds(pl.employer_ni_pence)}</TableCell>
                      <TableCell className="text-right">{formatPounds(pl.net_pence)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold border-t-2">
                    <TableCell>Totals</TableCell>
                    <TableCell className="text-right">{formatPounds(run.totalGrossPence)}</TableCell>
                    <TableCell className="text-right">{formatPounds(run.totalPayePence)}</TableCell>
                    <TableCell className="text-right">{formatPounds(run.totalPensionPence)}</TableCell>
                    <TableCell className="text-right">{formatPounds(run.totalNicPence)}</TableCell>
                    <TableCell className="text-right">{formatPounds(run.totalNetPence)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fund Splits */}
      {run.splits.length > 0 && (
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="p-6 pb-0">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-muted-foreground" />
              <CardTitle className="text-base">Fund Splits</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-6 pt-4">
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fund</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">% of Gross</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {run.splits.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.fundName ?? 'Untagged'}</TableCell>
                      <TableCell className="text-right">
                        {formatPounds(s.amountPence)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {run.totalGrossPence > 0
                          ? ((s.amountPence / run.totalGrossPence) * 100).toFixed(
                              1,
                            )
                          : 0}
                        %
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Journal Preview */}
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="p-6 pb-0">
          <CardTitle className="text-base">
            {isPosted ? 'Journal Entry' : 'Journal Preview'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-4">
          {previewLines.length > 0 ? (
            <div className="space-y-2">
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Fund</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewLines.map((line, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-sm">
                          {accountLabels[line.accountId] ?? line.accountId}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {line.fundId
                            ? fundNames.get(line.fundId) ?? line.fundId
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {line.debitPence > 0
                            ? formatPounds(line.debitPence)
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {line.creditPence > 0
                            ? formatPounds(line.creditPence)
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-semibold border-t-2">
                      <TableCell colSpan={2}>Total</TableCell>
                      <TableCell className="text-right">
                        {formatPounds(totalDebits)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatPounds(totalCredits)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              {totalDebits === totalCredits && (
                <p className="text-xs text-emerald-600 font-medium">
                  Journal is balanced.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {accountsConfigured
                ? 'Unable to generate journal preview.'
                : 'Configure payroll accounts in Settings to see the journal preview.'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
