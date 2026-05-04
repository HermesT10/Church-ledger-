import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import {
  getWorkspaceDataResetHistory,
  getWorkspaceDataResetPreview,
} from './actions';
import { DataManagementClient } from './data-management-client';

export default async function DataManagementPage() {
  const { role } = await getActiveOrg();

  if (role !== 'admin') {
    redirect('/settings');
  }

  const [demoPreview, resetPreview, history] = await Promise.all([
    getWorkspaceDataResetPreview('demo'),
    getWorkspaceDataResetPreview('financial'),
    getWorkspaceDataResetHistory(),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Data Management"
        subtitle="Delete demo data or reset financial workspace data without changing access, roles, or organisation settings."
      />

      <DataManagementClient
        initialDemoPreview={demoPreview}
        initialResetPreview={resetPreview}
        initialHistory={history}
      />
    </PageShell>
  );
}
