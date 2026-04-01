import { getActiveOrg } from '@/lib/org';
import { getDashboardOverview } from '@/lib/reports/dashboard';
import { getDashboardLayout } from '@/lib/dashboard/actions';
import { PageShell } from '@/components/page-shell';
import { DashboardClient } from './dashboard-client';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { orgId, role } = await getActiveOrg();
  const { period: periodParam } = await searchParams;
  const period = ['this_month', 'last_month', 'ytd'].includes(periodParam ?? '')
    ? periodParam!
    : 'this_month';

  const layout = await getDashboardLayout();

  const visibleWidgets = layout
    .filter((w) => w.visible)
    .map((w) => w.id);

  const { data } = await getDashboardOverview({ orgId, period, visibleWidgets });

  const canEdit = role === 'admin' || role === 'treasurer';

  return (
    <PageShell>
      <DashboardClient
        data={data}
        period={period}
        canEdit={canEdit}
        initialLayout={layout}
      />
    </PageShell>
  );
}
