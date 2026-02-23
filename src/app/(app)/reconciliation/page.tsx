import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { ReconciliationClient } from './reconciliation-client';

export default async function ReconciliationPage() {
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
    <PageShell>
      <PageHeader
        title="Bank Reconciliation"
        subtitle="Match bank lines to journals. Suggested matches are scored automatically with payout journals prioritised."
      />

      <ReconciliationClient bankAccounts={accounts} />
    </PageShell>
  );
}
