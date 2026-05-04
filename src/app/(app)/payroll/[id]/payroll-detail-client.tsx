'use client';

import { useState, useMemo, useTransition, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  CheckCircle,
  Trash2,
  ExternalLink,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  approvePayrollRun,
  postPayrollRun,
  deletePayrollRun,
  exportHmrcSummaryCsv,
  markPayrollPaid,
  markPayrollReconciled,
  reversePayrollRun,
  reviewPayrollRun,
  updatePayrollRunAttachment,
} from '@/lib/payroll/actions';
import { uploadFinancialEvidence } from '@/lib/evidence/actions';
import type { PayrollRunDetail } from '@/lib/payroll/types';
import type { OrgSettings } from '@/app/(app)/settings/types';
import { buildPayrollJournalLines } from '@/lib/payroll/validation';
import type { PayrollSplit, PayrollAccountIds } from '@/lib/payroll/validation';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { SummaryMetricCard } from '@/components/finance';
import { SectionCard } from '@/components/section-card';

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
  const [uploadingFile, setUploadingFile] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState(run.attachmentUrl);

  const isDraft = run.status === 'draft';
  const isReviewed = run.status === 'reviewed';
  const isApproved = run.status === 'approved';
  const isPosted = run.status === 'posted';
  const isPaid = run.status === 'paid';
  const isReconciled = run.status === 'reconciled';

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
        employeeNicPence: run.totalEmployeeNicPence ?? 0,
        employerNicPence: run.totalEmployerNicPence ?? run.totalNicPence,
        employeePensionPence: run.totalEmployeePensionPence ?? 0,
        employerPensionPence: run.totalEmployerPensionPence ?? run.totalPensionPence,
        otherDeductionsPence: run.totalOtherDeductionsPence ?? 0,
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

  function handleReview() {
    startTransition(async () => {
      const result = await reviewPayrollRun(run.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Payroll run reviewed.');
      router.refresh();
    });
  }

  function handleApprove() {
    startTransition(async () => {
      const result = await approvePayrollRun(run.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Payroll run approved.');
      router.refresh();
    });
  }

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

  function handleMarkPaid() {
    const reference = window.prompt('Payment reference, if available') ?? undefined;
    startTransition(async () => {
      const result = await markPayrollPaid(run.id, reference);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Payroll marked as paid.');
      router.refresh();
    });
  }

  function handleMarkReconciled() {
    startTransition(async () => {
      const result = await markPayrollReconciled(run.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Payroll marked as reconciled.');
      router.refresh();
    });
  }

  function handleReverse() {
    const reason = window.prompt('Explain the reversal reason');
    if (!reason) return;

    startTransition(async () => {
      const result = await reversePayrollRun(run.id, reason);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Payroll run reversed.');
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

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', 'payroll-runs');
    const uploadRes = await uploadFinancialEvidence(formData);
    setUploadingFile(false);

    if (uploadRes.error || !uploadRes.url) {
      toast.error(uploadRes.error ?? 'Upload failed.');
      return;
    }

    const saveRes = await updatePayrollRunAttachment(run.id, uploadRes.url);
    if (saveRes.error) {
      toast.error(saveRes.error);
      return;
    }

    setAttachmentUrl(uploadRes.url);
    toast.success('Evidence attached.');
    router.refresh();
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
    <PageShell className="max-w-6xl">
      <PageHeader
        title={`Payroll — ${formatMonth(run.payrollMonth)}`}
        subtitle={run.id.slice(0, 8)}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              status={run.status}
              label={
                run.status === 'draft'
                  ? 'Draft'
                  : run.status === 'reviewed'
                    ? 'Reviewed'
                    : run.status === 'approved'
                      ? 'Approved'
                      : run.status === 'paid'
                        ? 'Paid'
                        : run.status === 'reconciled'
                          ? 'Reconciled'
                          : run.status === 'reversed'
                            ? 'Reversed'
                            : 'Posted'
              }
            />
            <Button asChild variant="outline" size="sm">
              <Link href="/payroll">
                <ArrowLeft size={14} className="mr-1.5" />
                Back
              </Link>
            </Button>
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
              <Button onClick={handleReview} disabled={isPending || !accountsConfigured}>
                <CheckCircle size={14} className="mr-1" />
                {isPending ? 'Reviewing...' : 'Review Payroll'}
              </Button>
            </>
          )}
          {isReviewed && canEdit && (
            <Button onClick={handleApprove} disabled={isPending || !accountsConfigured}>
                <CheckCircle size={14} className="mr-1" />
                {isPending ? 'Approving...' : 'Approve Payroll'}
              </Button>
          )}
          {isApproved && canEdit && (
            <Button onClick={handlePost} disabled={isPending || !accountsConfigured}>
              <CheckCircle size={14} className="mr-1" />
              {isPending ? 'Posting...' : 'Post Payroll'}
            </Button>
          )}
          {(isPosted || isPaid || isReconciled) && (
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
              {isPosted && canEdit && (
                <Button variant="outline" size="sm" onClick={handleMarkPaid} disabled={isPending}>
                  <CheckCircle size={14} className="mr-1" />
                  Mark Paid
                </Button>
              )}
              {isPaid && canEdit && (
                <Button variant="outline" size="sm" onClick={handleMarkReconciled} disabled={isPending}>
                  <CheckCircle size={14} className="mr-1" />
                  Mark Reconciled
                </Button>
              )}
              {canEdit && !isReconciled && (
                <Button variant="destructive" size="sm" onClick={handleReverse} disabled={isPending}>
                  Reverse
                </Button>
              )}
            </>
          )}
          </div>
        }
      />

      {!accountsConfigured && (isDraft || isApproved) && (
        <div className="rounded-2xl border border-amber-200 bg-warning-soft p-4 text-sm text-amber-800 shadow-card">
          Payroll accounts must be configured in{' '}
          <Link href="/settings" className="underline font-medium">
            Settings
          </Link>{' '}
          before posting.
        </div>
      )}

      {(isDraft || isReviewed || isApproved) && canEdit && (
        <SectionCard title="Evidence" contentClassName="space-y-3">
            <Input
              type="file"
              onChange={handleFileUpload}
              disabled={uploadingFile || isPending}
            />
            {attachmentUrl && (
              <Link
                href={attachmentUrl}
                target="_blank"
                className="text-sm text-blue-600 underline hover:no-underline"
              >
                View attached evidence
              </Link>
            )}
        </SectionCard>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        {[
          { label: 'Gross', value: run.totalGrossPence },
          { label: 'Net Pay', value: run.totalNetPence },
          { label: 'PAYE', value: run.totalPayePence },
          { label: 'Employer NIC', value: run.totalNicPence },
          { label: 'Employer Pension', value: run.totalPensionPence },
          {
            label: 'Employer Cost',
            value: run.totalEmployerCostPence ?? run.totalGrossPence + run.totalNicPence + run.totalPensionPence,
          },
        ].map((item) => (
          <SummaryMetricCard
            key={item.label}
            label={item.label}
            value={formatPounds(item.value)}
          />
        ))}
      </div>

      {/* Employee Payroll Lines */}
      {run.payrollLines && run.payrollLines.length > 0 && (
        <SectionCard
          title="Employee Breakdown"
          description="Gross pay, deductions, employer costs, and net pay by employee."
        >
            <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card">
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
        </SectionCard>
      )}

      {/* Fund Splits */}
      {run.splits.length > 0 && (
        <SectionCard
          title="Fund Splits"
          description="Allocation of payroll costs across funds."
        >
            <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card">
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
        </SectionCard>
      )}

      {/* Journal Preview */}
      <SectionCard
        title={isPosted ? 'Journal Entry' : 'Journal Preview'}
        description="Preview of the double-entry posting generated from this payroll run."
      >
          {previewLines.length > 0 ? (
            <div className="space-y-2">
              <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card">
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
      </SectionCard>
    </PageShell>
  );
}
