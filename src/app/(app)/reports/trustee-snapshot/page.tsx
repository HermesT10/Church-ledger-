import { getActiveOrg } from '@/lib/org';
import { getTrusteeSnapshot } from '@/lib/reports/actions';
import { TrusteeSnapshotClient } from './trustee-snapshot-client';

export default async function TrusteeSnapshotPage() {
  const { orgId, role } = await getActiveOrg();

  const reportRes = await getTrusteeSnapshot({ organisationId: orgId });

  return (
    <TrusteeSnapshotClient
      initialData={reportRes.data}
      role={role}
      error={reportRes.error}
    />
  );
}
