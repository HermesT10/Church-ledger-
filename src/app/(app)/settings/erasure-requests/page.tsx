import { getActiveOrg } from '@/lib/org';
import { listErasureRequests } from './actions';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { SoftAlert } from '@/components/soft-alert';
import { ErasureRequestsClient } from './erasure-requests-client';

export default async function ErasureRequestsPage() {
  const { orgId, role } = await getActiveOrg();

  const canManage = role === 'admin' || role === 'treasurer';
  if (!canManage) {
    return (
      <PageShell>
        <PageHeader title="Data Erasure Requests" subtitle="Review and resolve requests" />
        <SoftAlert variant="error">You do not have permission to view this page.</SoftAlert>
      </PageShell>
    );
  }

  const { data: requests, error } = await listErasureRequests(orgId);

  return (
    <PageShell>
      <PageHeader
        title="Data Erasure Requests"
        subtitle="Review and resolve data erasure requests from members"
      />
      {error && <SoftAlert variant="error">{error}</SoftAlert>}
      <ErasureRequestsClient requests={requests ?? []} />
    </PageShell>
  );
}
