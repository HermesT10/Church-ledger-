import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
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
    <PageShell className="max-w-7xl">
      <PageHeader
        title="Reconciliation History"
        subtitle="Review previous reconciliation sessions and reopen them when administrative corrections are needed."
      />
      <ReconciliationHistoryClient bankAccounts={accounts} isAdmin={role === 'admin'} />
    </PageShell>
  );
}
