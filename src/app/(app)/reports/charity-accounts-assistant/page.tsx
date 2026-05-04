import Link from 'next/link';
import { ArrowRight, Download, FileCheck2, FileText, ShieldAlert, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { PageShell } from '@/components/page-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { getCharityAccountsAssistantSnapshot, saveTrusteeReportNarrativeAction } from '@/lib/charity-accounts-assistant/actions';
import type { CharityAccountsChecklistStatus } from '@/lib/charity-accounts-assistant/types';
import type { AnnualAccountsBasis } from '@/lib/annual-accounts/types';

function money(pence: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(pence / 100);
}

function statusLabel(status: CharityAccountsChecklistStatus) {
  return status.replace('_', ' ');
}

function statusClassName(status: CharityAccountsChecklistStatus) {
  switch (status) {
    case 'ready':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'blocked':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'missing':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    default:
      return 'border-sky-200 bg-sky-50 text-sky-700';
  }
}

function StepBadge({ status }: { status: CharityAccountsChecklistStatus }) {
  return (
    <Badge variant="outline" className={statusClassName(status)}>
      {statusLabel(status)}
    </Badge>
  );
}

export default async function CharityAccountsAssistantPage({
  searchParams,
}: {
  searchParams?: Promise<{ year?: string; basis?: string; saved?: string; error?: string }>;
}) {
  const params = await searchParams;
  const financialYear = params?.year ? Number(params.year) : new Date().getFullYear();
  const basis: AnnualAccountsBasis = params?.basis === 'cash' ? 'cash' : 'accruals';
  const { data: snapshot, error } = await getCharityAccountsAssistantSnapshot({ financialYear, basis });

  return (
    <PageShell>
      <PageHeader
        title="Charity Accounts Assistant"
        subtitle="A guided workflow for annual accounts, trustee report, examiner evidence, and Charity Commission Annual Return preparation."
      />

      {params?.saved ? (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="py-4 text-sm font-medium text-emerald-800">Trustee report narrative saved to the annual accounts draft.</CardContent>
        </Card>
      ) : null}

      {params?.error ? (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="py-4 text-sm font-medium text-rose-800">The assistant could not complete that action. Please review the annual accounts data and try again.</CardContent>
        </Card>
      ) : null}

      {error || !snapshot ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">{error ?? 'The assistant could not be loaded.'}</CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card className="overflow-hidden border-primary/10 bg-gradient-to-br from-card via-card to-primary/5">
            <CardContent className="grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-4">
                <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
                  <Sparkles className="size-3" />
                  Annual Return preparation
                </Badge>
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">{snapshot.charityDetails.charityName || 'Charity accounts pack'}</h2>
                  <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                    Financial year {snapshot.financialYear}, {snapshot.basis} basis. This assistant prepares the data pack for manual Charity Commission filing and blocks final approval when core accounting checks fail.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border bg-background/80 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gross income</p>
                    <p className="mt-2 text-xl font-semibold">{money(snapshot.annualReturnDataPack.grossIncomePence)}</p>
                  </div>
                  <div className="rounded-2xl border bg-background/80 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gross expenditure</p>
                    <p className="mt-2 text-xl font-semibold">{money(snapshot.annualReturnDataPack.grossExpenditurePence)}</p>
                  </div>
                  <div className="rounded-2xl border bg-background/80 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Trustees</p>
                    <p className="mt-2 text-xl font-semibold">{snapshot.annualReturnDataPack.trusteeCount}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border bg-background/90 p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Readiness score</p>
                    <p className="mt-1 text-4xl font-semibold tracking-tight">{snapshot.readiness.score}%</p>
                  </div>
                  <Badge variant="outline" className={snapshot.readiness.status === 'blocked' ? 'border-rose-200 bg-rose-50 text-rose-700' : snapshot.readiness.status === 'ready' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-sky-200 bg-sky-50 text-sky-700'}>
                    {snapshot.readiness.status.replace('_', ' ')}
                  </Badge>
                </div>
                <Progress value={snapshot.readiness.score} className="mt-5" />
                <p className="mt-3 text-sm text-muted-foreground">
                  {snapshot.readiness.readyCount} of {snapshot.readiness.totalCount} checks are ready. {snapshot.readiness.blockers.length} blocking issue(s) must be resolved before final approval.
                </p>
                <Button asChild className="mt-5 w-full">
                  <Link href="/reports/annual/accounts-builder">
                    Open annual accounts builder
                    <ArrowRight />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileCheck2 className="size-4 text-primary" />
                  Guided Workflow
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {snapshot.checklist.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{entry.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{entry.description}</p>
                        <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{entry.source}</p>
                      </div>
                      <StepBadge status={entry.status} />
                    </div>
                    {entry.href ? (
                      <Button asChild variant="link" className="mt-2 h-auto px-0 text-primary">
                        <Link href={entry.href}>Review source</Link>
                      </Button>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldAlert className="size-4 text-primary" />
                    Approval Blockers
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {snapshot.readiness.blockers.length > 0 ? snapshot.readiness.blockers.map((blocker) => (
                    <div key={blocker.id} className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                      <p className="font-semibold">{blocker.title}</p>
                      <p className="mt-1">{blocker.description}</p>
                    </div>
                  )) : (
                    <p className="text-sm text-muted-foreground">No blocking issues. The final pack still needs trustee review before filing.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="size-4 text-primary" />
                    Supporting Schedules
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {snapshot.supportingSchedules.map((schedule) => (
                    <div key={schedule.id} className="flex items-start justify-between gap-3 rounded-xl border p-3">
                      <div>
                        <p className="text-sm font-medium">{schedule.title}</p>
                        <p className="text-xs text-muted-foreground">{schedule.description}</p>
                      </div>
                      <StepBadge status={schedule.status} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Trustee Report Narrative</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveTrusteeReportNarrativeAction} className="grid gap-4 lg:grid-cols-2">
                <input type="hidden" name="financialYear" value={snapshot.financialYear} />
                <input type="hidden" name="basis" value={snapshot.basis} />
                {[
                  ['objectivesActivities', 'Objectives and activities', snapshot.narrativeSections.objectivesActivities],
                  ['publicBenefit', 'Public benefit', snapshot.narrativeSections.publicBenefit],
                  ['achievementsPerformance', 'Achievements', snapshot.narrativeSections.achievementsPerformance],
                  ['financialReview', 'Financial review', snapshot.narrativeSections.financialReview],
                  ['reservesPolicy', 'Reserves policy', snapshot.narrativeSections.reservesPolicy],
                  ['principalRisks', 'Risks', snapshot.narrativeSections.principalRisks],
                  ['futurePlans', 'Future plans', snapshot.narrativeSections.futurePlans],
                ].map(([name, label, value]) => (
                  <div key={name} className="space-y-2">
                    <Label htmlFor={name}>{label}</Label>
                    <Textarea id={name} name={name} defaultValue={value} className="min-h-28" />
                  </div>
                ))}
                <label className="flex items-center gap-2 rounded-xl border p-3 text-sm font-medium lg:col-span-2">
                  <input type="checkbox" name="reviewed" defaultChecked={snapshot.narrativeSections.reviewed} />
                  Mark trustee narrative as reviewed
                </label>
                <div className="lg:col-span-2">
                  <Button type="submit">Save trustee narrative</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Annual Return Data Pack</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {snapshot.annualReturnDataPack.keyFinancialFigures.map((figure) => (
                  <div key={figure.label} className="flex items-center justify-between rounded-xl border p-3">
                    <span className="text-muted-foreground">{figure.label}</span>
                    <span className="font-semibold">{money(figure.amountPence)}</span>
                  </div>
                ))}
                <div className="rounded-xl border p-3">
                  <p className="font-medium">Staff/payroll indicator</p>
                  <p className="mt-1 text-muted-foreground">{snapshot.annualReturnDataPack.hasStaffOrPayroll ? 'Payroll activity detected. Confirm staff disclosures before filing.' : 'No payroll activity detected.'}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="size-4 text-primary" />
                  Final Pack
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {snapshot.finalPackDocuments.map((document) => (
                  <div key={document.id} className="flex items-start justify-between gap-3 rounded-xl border p-3">
                    <div>
                      <p className="text-sm font-medium">{document.title}</p>
                      <p className="text-xs text-muted-foreground">{document.description}</p>
                    </div>
                    <Badge variant="outline">{document.format}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </PageShell>
  );
}
