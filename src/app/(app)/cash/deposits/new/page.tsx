import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { getUnbankedCollections } from '@/lib/cash/actions';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { NewDepositClient } from './new-deposit-client';

export default async function NewDepositPage() {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const [bankAccountsRes, unbankResult] = await Promise.all([
    supabase
      .from('bank_accounts')
      .select('id, name')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('name'),
    getUnbankedCollections(orgId),
  ]);

  return (
    <PageShell className="max-w-5xl">
      <PageHeader
        title="New Cash Deposit"
        subtitle="Select posted collections, choose the receiving bank account, and post the deposit in one flow."
      />
      <NewDepositClient
        bankAccounts={(bankAccountsRes.data ?? []) as { id: string; name: string }[]}
        unbankedCollections={unbankResult.data}
      />
    </PageShell>
  );
}
