import { getActiveOrg } from '@/lib/org';
import { getInsightSnapshot } from '@/lib/insights/actions';
import { getDashboardOverview } from '@/lib/reports/dashboard';
import { buildTrusteeReportingPack } from '@/lib/reports/trustee-packs/data';
import { MonthlyDashboardClient } from './monthly-dashboard-client';

const DEFAULT_WIDGETS = [
  'cash-position',
  'fund-balances',
  'budget-vs-actual',
  'gift-aid-summary',
  'recent-transactions',
  'supplier-spend',
  'payroll-summary',
];

export default async function MonthlyDashboardPage() {
  const { orgId } = await getActiveOrg();
  const [{ data, error }, guidanceRes, packRes] = await Promise.all([
    getDashboardOverview({
      orgId,
      period: 'this_month',
      visibleWidgets: DEFAULT_WIDGETS,
    }),
    getInsightSnapshot({
      organisationId: orgId,
      period: 'this_month',
    }),
    buildTrusteeReportingPack({ type: 'monthly_dashboard', period: 'this_month' }),
  ]);

  return (
    <MonthlyDashboardClient
      orgId={orgId}
      initialData={data}
      initialPack={packRes.data}
      guidance={guidanceRes.data}
      error={error}
    />
  );
}
