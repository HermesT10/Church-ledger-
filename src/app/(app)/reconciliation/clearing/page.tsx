import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { getClearingReconciliation } from '@/lib/reconciliation/actions';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { ClearingClient } from './clearing-client';

export default async function ClearingReconciliationPage() {
  const { orgId, role } = await getActiveOrg();

  if (role !== 'admin' && role !== 'treasurer') {
    redirect('/dashboard');
  }

  const { data, error } = await getClearingReconciliation(orgId);

  return (
    <PageShell className="max-w-7xl">
      <PageHeader
        title="Clearing Account Reconciliation"
        subtitle="Monitor provider clearing balances and identify outstanding platform payouts."
      />
      <ClearingClient rows={data} error={error} />
    </PageShell>
  );
}
