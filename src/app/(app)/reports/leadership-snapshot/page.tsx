import { getActiveOrg } from '@/lib/org';
import { getInsightSnapshot } from '@/lib/insights/actions';
import { getLeadershipSnapshotReport } from '@/lib/reports/summaryReports';
import { buildTrusteeReportingPack } from '@/lib/reports/trustee-packs/data';
import { LeadershipSnapshotClient } from './leadership-snapshot-client';

export default async function LeadershipSnapshotPage() {
  const { orgId } = await getActiveOrg();
  const [{ data, error }, guidanceRes, packRes] = await Promise.all([
    getLeadershipSnapshotReport({
      organisationId: orgId,
      period: 'this_month',
    }),
    getInsightSnapshot({
      organisationId: orgId,
      period: 'this_month',
    }),
    buildTrusteeReportingPack({ type: 'leadership_snapshot', period: 'this_month' }),
  ]);

  return (
    <LeadershipSnapshotClient
      orgId={orgId}
      initialData={data}
      initialPack={packRes.data}
      guidance={guidanceRes.data}
      error={error}
    />
  );
}
