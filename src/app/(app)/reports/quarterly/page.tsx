import { getActiveOrg } from '@/lib/org';
import { getQuarterlyReport } from '@/lib/reports/actions';
import { QuarterlyClient } from './quarterly-client';

export default async function QuarterlyReportPage() {
  const { orgId, role } = await getActiveOrg();
  const year = new Date().getFullYear();

  const { data, error } = await getQuarterlyReport({
    organisationId: orgId,
    year,
  });

  return (
    <QuarterlyClient
      initialData={data}
      orgId={orgId}
      role={role}
      defaultYear={year}
      error={error}
    />
  );
}
