import { getActiveOrg } from '@/lib/org';
import { getSOFAReport } from '@/lib/reports/glReports';
import { generateReportSnapshot } from '@/lib/reports/engine/service';
import { ProfessionalReportSnapshotPanel } from '@/components/reports/professional';
import { SOFAClient } from './sofa-client';

export default async function SOFAPage() {
  await getActiveOrg();
  const year = new Date().getFullYear();
  const [{ data, error }, snapshotRes] = await Promise.all([
    getSOFAReport({ year }),
    generateReportSnapshot('sofa', { year }),
  ]);

  return (
    <>
      <ProfessionalReportSnapshotPanel snapshot={snapshotRes.data} />
      <SOFAClient initialReport={data} error={error} />
    </>
  );
}
