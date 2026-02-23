import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { ReconciliationHistoryClient } from './history-client';

export default async function ReconciliationHistoryPage() {
  const { orgId, role } = await getActiveOrg();

  if (role !== 'admin' && role !== 'treasurer') {
    redirect('/dashboard');
  }

  const supabase = await createClient();

  const { data: bankAccounts } = await supabase
    .from('bank_accounts')
    .select('id, name')
    .eq('organisation_id', orgId)
    .eq('is_active', true)
    .order('name');

  const accounts = (bankAccounts ?? []).map((ba) => ({
    id: ba.id as string,
    name: ba.name as string,
  }));

  return (
    <div className="mx-auto max-w-7xl px-6 py-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reconciliation History</h1>
        <p className="text-sm text-muted-foreground mt-1">
          View past reconciliation sessions for each bank account.
        </p>
      </div>

      <ReconciliationHistoryClient bankAccounts={accounts} isAdmin={role === 'admin'} />
    </div>
  );
}
