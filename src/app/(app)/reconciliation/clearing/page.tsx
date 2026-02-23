import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { getClearingReconciliation } from '@/lib/reconciliation/actions';
import { ClearingClient } from './clearing-client';

export default async function ClearingReconciliationPage() {
  const { orgId, role } = await getActiveOrg();

  if (role !== 'admin' && role !== 'treasurer') {
    redirect('/dashboard');
  }

  const { data, error } = await getClearingReconciliation(orgId);

  return (
    <div className="mx-auto max-w-7xl px-6 py-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Clearing Account Reconciliation
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Per-provider clearing account balances. Non-zero balances indicate
          outstanding platform payouts.
        </p>
      </div>

      <ClearingClient rows={data} error={error} />
    </div>
  );
}
