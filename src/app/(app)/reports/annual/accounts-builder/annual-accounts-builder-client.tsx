'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  AnnualAccountsApprovalPage,
  AnnualAccountsBalanceSheet,
  AnnualAccountsCashflow,
  AnnualAccountsContents,
  AnnualAccountsCover,
  AnnualAccountsEvidenceIndex,
  AnnualAccountsExportActions,
  AnnualAccountsNotes,
  AnnualAccountsSOFA,
  AnnualAccountsStepper,
  AnnualAccountsValidationPanel,
  CharityInformationSection,
  ExaminerPlaceholderSection,
  TrusteesAnnualReportSection,
} from '@/components/annual-accounts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { saveAnnualAccountsDraft, approveAnnualAccountsPack } from '@/lib/annual-accounts/data';
import type { AnnualAccountsPack, AnnualAccountsStep } from '@/lib/annual-accounts/types';

interface Props {
  initialPack: AnnualAccountsPack | null;
  initialError?: string | null;
}

export function AnnualAccountsBuilderClient({ initialPack, initialError }: Props) {
  const [pack, setPack] = useState(initialPack);
  const [currentStep, setCurrentStep] = useState<AnnualAccountsStep>('select-financial-year');
  const [message, setMessage] = useState(initialError ?? '');
  const [isPending, startTransition] = useTransition();

  const blockerCount = useMemo(
    () => pack?.validationResults.filter((item) => item.severity === 'blocker' && item.status === 'failed').length ?? 0,
    [pack],
  );

  if (!pack) {
    return (
      <main className="space-y-4 p-6">
        <Card>
          <CardHeader><CardTitle>Annual Accounts Builder</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{message || 'Unable to load annual accounts pack.'}</CardContent>
        </Card>
      </main>
    );
  }

  const saveDraft = () => {
    startTransition(async () => {
      const res = await saveAnnualAccountsDraft({
        financialYear: pack.financialYear,
        basis: pack.basis,
        currentStep,
        pack,
      });
      setMessage(res.error ?? 'Draft saved.');
    });
  };

  const approvePack = () => {
    startTransition(async () => {
      const approvedPack = {
        ...pack,
        approval: {
          ...pack.approval,
          final: true,
          signatureName: pack.approval.signatureName || pack.generatedBy || 'Trustee',
          approvedByName: pack.approval.approvedByName || pack.generatedBy || 'Trustee',
          approvedAt: new Date().toISOString(),
        },
      };
      const res = await approveAnnualAccountsPack({
        financialYear: pack.financialYear,
        basis: pack.basis,
        pack: approvedPack,
      });
      if (!res.error) setPack(approvedPack);
      setMessage(res.error ?? `Approved and versioned as ${res.data?.reportVersionId}.`);
    });
  };

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Reports / Annual Accounts</p>
          <h1 className="text-3xl font-semibold tracking-tight">Annual Accounts Builder</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Guided Charity Commission and trustee-ready accounts pack for {pack.financialYear}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild><Link href="/reports/annual">Back to annual report</Link></Button>
          <Button variant="outline" onClick={saveDraft} disabled={isPending}>{isPending ? 'Saving...' : 'Save draft'}</Button>
          <Button onClick={approvePack} disabled={isPending || blockerCount > 0}>{blockerCount > 0 ? 'Resolve blockers' : 'Approve pack'}</Button>
        </div>
      </div>

      {message && (
        <div className="rounded-2xl border border-border/70 bg-card px-4 py-3 text-sm text-muted-foreground">{message}</div>
      )}

      <AnnualAccountsStepper currentStep={currentStep} onStepChange={setCurrentStep} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <AnnualAccountsCover pack={pack} />
          <AnnualAccountsContents />
          <CharityInformationSection pack={pack} />
          <TrusteesAnnualReportSection pack={pack} />
          <ExaminerPlaceholderSection pack={pack} />
          <AnnualAccountsSOFA pack={pack} />
          <AnnualAccountsBalanceSheet pack={pack} />
          <AnnualAccountsCashflow />
          <AnnualAccountsNotes pack={pack} />
          <AnnualAccountsApprovalPage pack={pack} />
          <AnnualAccountsEvidenceIndex pack={pack} />
        </div>
        <aside className="space-y-6 xl:sticky xl:top-4 xl:self-start">
          <AnnualAccountsValidationPanel pack={pack} />
          <AnnualAccountsExportActions pack={pack} />
        </aside>
      </div>
    </main>
  );
}
