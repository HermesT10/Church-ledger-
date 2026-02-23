import { getSOFAReport } from '@/lib/reports/glReports';
import { SOFAClient } from './sofa-client';

export default async function SOFAPage() {
  const year = new Date().getFullYear();
  const { data, error } = await getSOFAReport({ year });

  return (
    <SOFAClient initialReport={data} error={error} />
  );
}
