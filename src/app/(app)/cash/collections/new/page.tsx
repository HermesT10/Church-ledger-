import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { NewCollectionClient } from './new-collection-client';

export default async function NewCollectionPage() {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const [fundsRes, accountsRes, donorsRes] = await Promise.all([
    supabase.from('funds').select('id, name').eq('organisation_id', orgId).eq('is_active', true).order('name'),
    supabase.from('accounts').select('id, code, name').eq('organisation_id', orgId).eq('type', 'income').eq('is_active', true).order('code'),
    supabase.from('donors').select('id, full_name').eq('organisation_id', orgId).eq('is_active', true).order('full_name'),
  ]);

  return (
    <NewCollectionClient
      orgId={orgId}
      funds={(fundsRes.data ?? []) as { id: string; name: string }[]}
      incomeAccounts={(accountsRes.data ?? []) as { id: string; code: string; name: string }[]}
      donors={(donorsRes.data ?? []) as { id: string; full_name: string }[]}
    />
  );
}
