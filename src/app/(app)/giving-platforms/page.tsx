import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { getGivingPlatforms } from '@/lib/giving-platforms/actions';
import { GivingPlatformsClient } from './giving-platforms-client';

export default async function GivingPlatformsPage() {
  const { orgId, role } = await getActiveOrg();

  // Only Admin / Treasurer can manage platform mappings
  if (role !== 'admin' && role !== 'treasurer') {
    redirect('/dashboard');
  }

  // Fetch platforms
  const { data: platforms } = await getGivingPlatforms(orgId);

  // Fetch all active accounts (for selects)
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, code, name, type')
    .eq('organisation_id', orgId)
    .eq('is_archived', false)
    .order('code');

  const serializedAccounts = (accounts ?? []).map((a) => ({
    id: a.id as string,
    code: a.code as string,
    name: a.name as string,
    type: a.type as string,
  }));

  return (
    <div className="mx-auto max-w-7xl px-6 py-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Giving Platforms</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Map payment providers to clearing and fee accounts for automated donation imports.
        </p>
      </div>

      <GivingPlatformsClient
        platforms={platforms}
        accounts={serializedAccounts}
      />
    </div>
  );
}
