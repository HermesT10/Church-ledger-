import { getActiveOrg } from '@/lib/org';
import { getQuarterlyReport } from '@/lib/reports/actions';
import { buildTrusteeReportingPack } from '@/lib/reports/trustee-packs/data';
import { QuarterlyClient } from './quarterly-client';

export default async function QuarterlyReportPage() {
  const { orgId, role } = await getActiveOrg();
  const year = new Date().getFullYear();

  const [{ data, error }, packRes] = await Promise.all([
    getQuarterlyReport({
      organisationId: orgId,
      year,
    }),
    buildTrusteeReportingPack({ type: 'quarterly', year }),
  ]);

  return (
    <QuarterlyClient
      initialData={data}
      initialPack={packRes.data}
      orgId={orgId}
      role={role}
      defaultYear={year}
      error={error}
    />
  );
}
