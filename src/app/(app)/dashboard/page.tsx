import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { getInsightSnapshot } from '@/lib/insights/actions';
import { getDashboardOverview } from '@/lib/reports/dashboard';
import { getDashboardLayout } from '@/lib/dashboard/actions';
import { getRoleDashboardPreset } from '@/lib/product/role-dashboard-presets';
import { PageShell } from '@/components/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { DashboardClient } from './dashboard-client';
import { skipDashboardSetupAction } from './setup-actions';

interface SetupDashboardState {
  setupMode: boolean;
  setupType: 'blank' | 'guided' | 'import_first';
  skipped: boolean;
  bankAdded: boolean;
  statementUploaded: boolean;
  transactionsCategorised: boolean;
  fundsCreated: boolean;
  reportsViewed: boolean;
  hasAnyActivity: boolean;
}

async function getSetupDashboardState(orgId: string): Promise<SetupDashboardState> {
  const supabase = await createClient();
  const [
    orgResult,
    progressResult,
    bankAccountsResult,
    bankLinesResult,
    fundsResult,
    journalsResult,
  ] = await Promise.all([
    supabase.from('organisations').select('setup_mode, setup_type').eq('id', orgId).single(),
    supabase.from('workspace_setup_progress').select('*').eq('workspace_id', orgId).maybeSingle(),
    supabase.from('bank_accounts').select('id', { count: 'exact', head: true }).eq('organisation_id', orgId),
    supabase.from('bank_lines').select('id', { count: 'exact', head: true }).eq('organisation_id', orgId),
    supabase.from('funds').select('id', { count: 'exact', head: true }).eq('organisation_id', orgId),
    supabase.from('journals').select('id', { count: 'exact', head: true }).eq('organisation_id', orgId),
  ]);

  const progress = progressResult.data;
  return {
    setupMode: Boolean(orgResult.data?.setup_mode ?? false),
    setupType: (orgResult.data?.setup_type ?? 'blank') as SetupDashboardState['setupType'],
    skipped: Boolean(progress?.skipped),
    bankAdded: Boolean(progress?.bank_added) || Number(bankAccountsResult.count ?? 0) > 0,
    statementUploaded: Boolean(progress?.statement_uploaded) || Number(bankLinesResult.count ?? 0) > 0,
    transactionsCategorised: Boolean(progress?.transactions_categorised),
    fundsCreated: Boolean(progress?.funds_created) || Number(fundsResult.count ?? 0) > 0,
    reportsViewed: Boolean(progress?.reports_viewed),
    hasAnyActivity:
      Number(bankAccountsResult.count ?? 0) > 0 ||
      Number(bankLinesResult.count ?? 0) > 0 ||
      Number(fundsResult.count ?? 0) > 0 ||
      Number(journalsResult.count ?? 0) > 0,
  };
}

function SetupDashboard({ state }: { state: SetupDashboardState }) {
  const steps = [
    { label: 'Add bank account', complete: state.bankAdded, href: '/banking' },
    { label: 'Upload bank statement', complete: state.statementUploaded, href: '/banking' },
    { label: 'Categorise transactions', complete: state.transactionsCategorised, href: '/reconciliation' },
    { label: 'Create funds', complete: state.fundsCreated, href: '/funds' },
    { label: 'Review reports', complete: state.reportsViewed, href: '/reports' },
  ];
  const completeCount = steps.filter((step) => step.complete).length;
  const percent = Math.round((completeCount / steps.length) * 100);
  const setupTitle =
    state.setupType === 'import_first'
      ? 'Import your first statement'
      : state.setupType === 'guided'
        ? 'Finish guided setup'
        : 'Start from a blank canvas';

  return (
    <PageShell className="py-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <Card className="overflow-hidden border-border/80 bg-gradient-to-br from-background to-surface-muted/70">
          <CardHeader className="space-y-3">
            <div className="inline-flex w-fit rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
              Setup {percent}% complete
            </div>
            <div className="space-y-2">
              <CardTitle className="text-3xl">{setupTitle}</CardTitle>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Your workspace starts empty. Add a bank account, upload real statement
                data, then create only the funds, accounts, and categories your church
                actually needs.
              </p>
            </div>
            <Progress value={percent} />
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/onboarding/setup">Continue setup</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/banking">Add bank account</Link>
            </Button>
            <form action={skipDashboardSetupAction}>
              <Button type="submit" variant="ghost">
                Skip setup and open dashboard
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-5">
          {steps.map((step, index) => (
            <Card key={step.label} className={step.complete ? 'border-primary/30 bg-primary/5' : 'border-dashed'}>
              <CardContent className="space-y-3 p-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border bg-background text-sm font-semibold">
                  {index + 1}
                </div>
                <div>
                  <p className="text-sm font-medium">{step.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {step.complete ? 'Complete' : 'Not started'}
                  </p>
                </div>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href={step.href}>{step.complete ? 'Review' : 'Start'}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </PageShell>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; year?: string; comparePreviousYear?: string }>;
}) {
  const { orgId, role, user } = await getActiveOrg();
  const { period: periodParam, year: yearParam, comparePreviousYear } = await searchParams;
  const setupState = await getSetupDashboardState(orgId);

  if (setupState.setupMode && !setupState.skipped) {
    return <SetupDashboard state={setupState} />;
  }

  const period: 'this_month' | 'last_month' | 'ytd' =
    periodParam === 'last_month' || periodParam === 'ytd' || periodParam === 'this_month'
      ? periodParam
      : 'this_month';
  const parsedYear = Number(yearParam);
  const selectedYear = Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2200
    ? parsedYear
    : new Date().getFullYear();
  const shouldComparePreviousYear = comparePreviousYear === '1';

  const layout = await getDashboardLayout();
  const visibleWidgets = layout.filter((w) => w.visible).map((w) => w.id);

  const [{ data }, guidanceRes] = await Promise.all([
    getDashboardOverview({
      orgId,
      userId: user.id,
      role,
      period,
      selectedYear,
      comparePreviousYear: shouldComparePreviousYear,
      visibleWidgets,
    }),
    getInsightSnapshot({
      organisationId: orgId,
      period,
    }),
  ]);

  const canEdit = role === 'admin' || role === 'treasurer';
  const rolePreset = getRoleDashboardPreset(role);

  return (
    <PageShell className="py-6">
      <DashboardClient
        data={data}
        period={period}
        selectedYear={selectedYear}
        comparePreviousYear={shouldComparePreviousYear}
        canEdit={canEdit}
        initialLayout={layout}
        guidance={guidanceRes.data}
        rolePreset={rolePreset}
      />
    </PageShell>
  );
}
