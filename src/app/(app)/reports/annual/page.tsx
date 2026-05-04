import { getActiveOrg } from '@/lib/org';
import { getAnnualReport } from '@/lib/reports/actions';
import { generateReportSnapshot } from '@/lib/reports/engine/service';
import { ProfessionalReportSnapshotPanel } from '@/components/reports/professional';
import { AnnualReportClient } from './annual-report-client';

export default async function AnnualReportPage() {
  const { orgId, role } = await getActiveOrg();
  const year = new Date().getFullYear();

  const [{ data, error }, snapshotRes] = await Promise.all([
    getAnnualReport({
      organisationId: orgId,
      year,
    }),
    generateReportSnapshot('annual', { year }),
  ]);

  return (
    <>
      <ProfessionalReportSnapshotPanel snapshot={snapshotRes.data} />
      <AnnualReportClient
        initialData={data}
        orgId={orgId}
        role={role}
        defaultYear={year}
        error={error}
      />
    </>
  );
}
