import { getActiveOrg } from '@/lib/org';
import { getAnnualReport } from '@/lib/reports/actions';
import { AnnualReportClient } from './annual-report-client';

export default async function AnnualReportPage() {
  const { orgId, role } = await getActiveOrg();
  const year = new Date().getFullYear();

  const { data, error } = await getAnnualReport({
    organisationId: orgId,
    year,
  });

  return (
    <AnnualReportClient
      initialData={data}
      orgId={orgId}
      role={role}
      defaultYear={year}
      error={error}
    />
  );
}
