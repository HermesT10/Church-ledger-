import { getActiveOrg } from '@/lib/org';
import { getBudgetVsActualReport } from '@/lib/reports/actions';
import { BvaReportClient } from './bva-report-client';

export default async function BudgetVsActualPage() {
  const { orgId, role } = await getActiveOrg();
  const currentYear = new Date().getFullYear();

  const { data, error } = await getBudgetVsActualReport({
    orgId,
    year: currentYear,
  });

  return (
    <BvaReportClient
      initialData={data}
      orgId={orgId}
      role={role}
      initialYear={currentYear}
      error={error}
    />
  );
}
