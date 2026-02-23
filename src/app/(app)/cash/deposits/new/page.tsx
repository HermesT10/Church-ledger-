import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { getUnbankedCollections } from '@/lib/cash/actions';
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
    <NewDepositClient
      bankAccounts={(bankAccountsRes.data ?? []) as { id: string; name: string }[]}
      unbankedCollections={unbankResult.data}
    />
  );
}
