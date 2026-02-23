import { getActiveOrg } from '@/lib/org';
import { getAuditLog } from './actions';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { SoftAlert } from '@/components/soft-alert';
import { AuditLogClient } from './audit-log-client';

export default async function AuditLogPage() {
  const { orgId, role } = await getActiveOrg();

  const canView = role === 'admin' || role === 'treasurer';
  const result = canView
    ? await getAuditLog(orgId, { page: 1, limit: 50 })
    : { data: [], total: 0, error: 'Access denied.' };

  return (
    <PageShell>
      <PageHeader
        title="Audit Log"
        subtitle="View a record of significant actions taken within this organisation"
      />

      {result.error && (
        <SoftAlert variant="error">{result.error}</SoftAlert>
      )}

      <AuditLogClient
        orgId={orgId}
        initialEntries={result.data}
        initialTotal={result.total}
      />
    </PageShell>
  );
}
