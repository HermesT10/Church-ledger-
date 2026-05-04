import { getActiveOrg } from '@/lib/org';
import { getTrusteeSnapshot } from '@/lib/reports/actions';
import { buildTrusteeReportingPack } from '@/lib/reports/trustee-packs/data';
import { TrusteeSnapshotClient } from './trustee-snapshot-client';

export default async function TrusteeSnapshotPage() {
  const { orgId, role } = await getActiveOrg();

  const [reportRes, packRes] = await Promise.all([
    getTrusteeSnapshot({ organisationId: orgId }),
    buildTrusteeReportingPack({ type: 'trustee_snapshot' }),
  ]);

  return (
    <TrusteeSnapshotClient
      initialData={reportRes.data}
      initialPack={packRes.data}
      role={role}
      error={reportRes.error}
    />
  );
}
