import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { getDemoBatchInfo } from './actions';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { DemoDataClient } from './demo-data-client';

export default async function DemoDataPage() {
  const { orgId, role } = await getActiveOrg();

  if (role !== 'admin') {
    redirect('/settings');
  }

  const batchInfo = await getDemoBatchInfo(orgId);

  return (
    <PageShell>
      <PageHeader
        title="Demo Data"
        subtitle="Generate realistic demo data for testing, or clear existing demo records"
      />

      <DemoDataClient orgId={orgId} initialBatchInfo={batchInfo} />
    </PageShell>
  );
}
