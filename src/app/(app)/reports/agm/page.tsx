import { getActiveOrg } from '@/lib/org';
import { getAGMReport } from '@/lib/reports/actions';
import { generateReportSnapshot } from '@/lib/reports/engine/service';
import { buildTrusteeReportingPack } from '@/lib/reports/trustee-packs/data';
import { ProfessionalReportSnapshotPanel } from '@/components/reports/professional';
import { AGMClient } from './agm-client';

export default async function AGMReportPage() {
  const { orgId, role } = await getActiveOrg();
  const year = new Date().getFullYear();

  const [{ data, error }, snapshotRes, packRes] = await Promise.all([
    getAGMReport({
      organisationId: orgId,
      year,
    }),
    generateReportSnapshot('agm', { year }),
    buildTrusteeReportingPack({ type: 'agm', year }),
  ]);

  return (
    <>
      <ProfessionalReportSnapshotPanel snapshot={snapshotRes.data} />
      <AGMClient
        initialData={data}
        initialPack={packRes.data}
        orgId={orgId}
        role={role}
        defaultYear={year}
        error={error}
      />
    </>
  );
}
