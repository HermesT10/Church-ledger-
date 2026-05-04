'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, CircleDashed, FileArchive, LockKeyhole, Send, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  approveYearEndClose,
  generateFilingPack,
  generateYearEndAnnualAccounts,
  lockYearEndFinancialPeriod,
  markFilingPackSubmitted,
  runYearEndCloseValidation,
  submitYearEndForTrusteeReview,
  updateYearEndCloseStep,
} from '@/lib/year-end-close/actions';
import type { YearEndCloseRun, YearEndCloseStep, YearEndCloseStepStatus } from '@/lib/year-end-close/types';

const STATUS_STYLES: Record<YearEndCloseStepStatus, string> = {
  not_started: 'border-border bg-surface-muted text-muted-foreground',
  in_progress: 'border-amber-200 bg-amber-50 text-amber-700',
  complete: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  blocked: 'border-red-200 bg-red-50 text-red-700',
  waived: 'border-slate-200 bg-slate-50 text-slate-700',
};

function statusLabel(status: string) {
  return status.replaceAll('_', ' ');
}

function StepIcon({ status }: { status: YearEndCloseStepStatus }) {
  if (status === 'complete') return <CheckCircle2 className="size-4 text-emerald-600" />;
  if (status === 'blocked') return <AlertCircle className="size-4 text-red-600" />;
  return <CircleDashed className="size-4 text-muted-foreground" />;
}

function StepCard({ step, onStatusChange }: {
  step: YearEndCloseStep;
  onStatusChange: (step: YearEndCloseStep, status: YearEndCloseStepStatus, notes?: string) => void;
}) {
  const [notes, setNotes] = useState(step.notes ?? '');

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <div className="mt-0.5 flex size-8 items-center justify-center rounded-full bg-surface-muted">
            <StepIcon status={step.status} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-foreground">{step.stepNumber}. {step.title}</p>
              <Badge variant="outline" className={STATUS_STYLES[step.status]}>{statusLabel(step.status)}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
          </div>
        </div>
      </div>

      {step.blockers.length > 0 && (
        <div className="mt-3 space-y-2 rounded-xl border border-red-100 bg-red-50/70 p-3">
          {step.blockers.map((blocker) => (
            <div key={blocker.id} className="text-sm">
              <p className="font-medium text-red-800">{blocker.title}</p>
              <p className="text-red-700">{blocker.message}</p>
              {blocker.href && <Link href={blocker.href} className="text-red-800 underline underline-offset-4">{blocker.recommendedAction}</Link>}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add close notes, evidence references, or examiner comments..." />
        <div className="flex flex-col gap-2">
          <Button size="sm" variant="outline" onClick={() => onStatusChange(step, 'in_progress', notes)}>In progress</Button>
          <Button size="sm" onClick={() => onStatusChange(step, 'complete', notes)}>Complete</Button>
          <Button size="sm" variant="ghost" onClick={() => onStatusChange(step, 'waived', notes || 'Waived with treasurer review note.')}>Waive</Button>
        </div>
      </div>
    </div>
  );
}

export function YearEndCloseClient({ initialRun }: { initialRun: YearEndCloseRun }) {
  const [run, setRun] = useState(initialRun);
  const [message, setMessage] = useState<string | null>(null);
  const [submissionReference, setSubmissionReference] = useState('');
  const [isPending, startTransition] = useTransition();

  const completed = useMemo(
    () => run.steps.filter((step) => step.status === 'complete' || step.status === 'waived').length,
    [run.steps],
  );
  const blocked = run.steps.filter((step) => step.status === 'blocked').length;

  function updateLocalStep(step: YearEndCloseStep, status: YearEndCloseStepStatus, notes?: string) {
    setRun((current) => ({
      ...current,
      steps: current.steps.map((item) =>
        item.id === step.id ? { ...item, status, notes: notes ?? item.notes, completedAt: status === 'complete' || status === 'waived' ? new Date().toISOString() : null } : item,
      ),
    }));
  }

  function handleStepStatus(step: YearEndCloseStep, status: YearEndCloseStepStatus, notes?: string) {
    updateLocalStep(step, status, notes);
    startTransition(async () => {
      const result = await updateYearEndCloseStep({
        stepId: step.id,
        status,
        notes,
        evidence: step.evidence,
        documents: step.documents,
        waiverReason: status === 'waived' ? notes || 'Waived after treasurer review.' : null,
      });
      if (!result.success) setMessage(result.error);
    });
  }

  function runAction(action: () => Promise<{ error: string | null } | { success: boolean; error: string | null }>, successMessage: string) {
    startTransition(async () => {
      setMessage(null);
      const result = await action();
      if ('success' in result && !result.success) {
        setMessage(result.error);
        return;
      }
      if (result.error) {
        setMessage(result.error);
        return;
      }
      setMessage(successMessage);
    });
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className="rounded-2xl border border-border/70 bg-surface-muted px-4 py-3 text-sm text-foreground">
          {message}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Progress</p>
            <p className="mt-2 text-3xl font-bold">{completed}/23</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Run status</p>
            <p className="mt-2 text-2xl font-semibold capitalize">{statusLabel(run.status)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Blockers</p>
            <p className="mt-2 text-3xl font-bold">{blocked}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Period</p>
            <p className="mt-2 text-sm font-semibold">{run.periodStart} to {run.periodEnd}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Workflow actions</CardTitle>
          <CardDescription>Run validation and move the close through accounts, review, lock, export, and submission.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Button disabled={isPending} variant="outline" onClick={() => runAction(() => runYearEndCloseValidation(run.id), 'Validation completed.')}>
            <ShieldCheck className="size-4" /> Validate readiness
          </Button>
          <Button disabled={isPending} variant="outline" onClick={() => runAction(() => generateYearEndAnnualAccounts(run.id), 'Annual accounts generated.')}>
            <FileArchive className="size-4" /> Generate accounts
          </Button>
          <Button disabled={isPending} variant="outline" onClick={() => runAction(() => submitYearEndForTrusteeReview(run.id), 'Submitted for trustee review.')}>
            <Send className="size-4" /> Trustee review
          </Button>
          <Button disabled={isPending} variant="outline" onClick={() => runAction(() => approveYearEndClose(run.id), 'Final approval recorded.')}>
            <CheckCircle2 className="size-4" /> Final approval
          </Button>
          <Button disabled={isPending} variant="outline" onClick={() => runAction(() => lockYearEndFinancialPeriod(run.id), 'Financial year locked.')}>
            <LockKeyhole className="size-4" /> Lock year
          </Button>
          <Button disabled={isPending} variant="outline" onClick={() => runAction(() => generateFilingPack(run.id), 'Filing pack generated.')}>
            <FileArchive className="size-4" /> Export filing pack
          </Button>
          <div className="md:col-span-3 flex flex-col gap-3 rounded-2xl border border-border/70 p-3 sm:flex-row">
            <input
              value={submissionReference}
              onChange={(event) => setSubmissionReference(event.target.value)}
              placeholder="Optional Charity Commission submission reference"
              className="h-10 flex-1 rounded-xl border border-input bg-card px-3 text-sm"
            />
            <Button disabled={isPending} onClick={() => runAction(() => markFilingPackSubmitted(run.id, submissionReference), 'Submission recorded.')}>
              Mark submitted
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          {run.steps.map((step) => (
            <StepCard key={step.id} step={step} onStatusChange={handleStepStatus} />
          ))}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Filing readiness</CardTitle>
              <CardDescription>What the final export includes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>Annual accounts, trustee annual report, SOFA, balance sheet, notes, trial balance, fund movements, bank reconciliation, Gift Aid, payroll summary, audit log reference, evidence index, and examiner checklist.</p>
              <Button asChild variant="outline" className="w-full">
                <Link href={`/reports/annual/accounts-builder?year=${run.financialYear}&basis=${run.basis}`}>Open annual accounts builder</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Annual Return Assistant</CardTitle>
              <CardDescription>Prepared as a reviewable data pack, not a direct submission.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Includes income, expenditure, trustees, staff/payroll, grants, fundraising, public benefit, activities, reserves, and risk notes.</p>
              <p>The treasurer remains responsible for reviewing and filing through the Charity Commission.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
