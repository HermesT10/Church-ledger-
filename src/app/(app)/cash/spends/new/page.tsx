import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { NewSpendClient } from './new-spend-client';

export default async function NewSpendPage() {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const [fundsRes, expenseAccountsRes] = await Promise.all([
    supabase.from('funds').select('id, name').eq('organisation_id', orgId).eq('is_active', true).order('name'),
    supabase.from('accounts').select('id, code, name').eq('organisation_id', orgId).eq('type', 'expense').eq('is_active', true).order('code'),
  ]);

  return (
    <NewSpendClient
      funds={(fundsRes.data ?? []) as { id: string; name: string }[]}
      expenseAccounts={(expenseAccountsRes.data ?? []) as { id: string; code: string; name: string }[]}
    />
  );
}
