import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { StatementReconciliationClient } from './statement-reconciliation-client';

export default async function StatementReconciliationPage() {
  const { orgId, role } = await getActiveOrg();

  if (role !== 'admin' && role !== 'treasurer') {
    redirect('/dashboard');
  }

  const supabase = await createClient();

  const { data: bankAccounts } = await supabase
    .from('bank_accounts')
    .select('id, name')
    .eq('organisation_id', orgId)
    .eq('status', 'active')
    .order('name');

  const accounts = (bankAccounts ?? []).map((ba) => ({
    id: ba.id as string,
    name: ba.name as string,
  }));

  return (
    <PageShell className="max-w-7xl">
      <PageHeader
        title="Statement Reconciliation"
        subtitle="Match statement balances to the ledger, clear lines, and finalize when the difference reaches zero."
      />
      <StatementReconciliationClient bankAccounts={accounts} />
    </PageShell>
  );
}
