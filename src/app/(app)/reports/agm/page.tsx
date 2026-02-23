import { getActiveOrg } from '@/lib/org';
import { getAGMReport } from '@/lib/reports/actions';
import { AGMClient } from './agm-client';

export default async function AGMReportPage() {
  const { orgId, role } = await getActiveOrg();
  const year = new Date().getFullYear();

  const { data, error } = await getAGMReport({
    organisationId: orgId,
    year,
  });

  return (
    <AGMClient
      initialData={data}
      orgId={orgId}
      role={role}
      defaultYear={year}
      error={error}
    />
  );
}
