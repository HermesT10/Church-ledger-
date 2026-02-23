import { getActiveOrg } from '@/lib/org';
import { listDeclarations } from '@/lib/giftaid/actions';
import { createClient } from '@/lib/supabase/server';
import { DeclarationsClient } from './declarations-client';

export default async function DeclarationsPage() {
  const { orgId, role } = await getActiveOrg();
  const canEdit = role === 'admin' || role === 'treasurer';

  const supabase = await createClient();

  const [{ data: declarations }, donorsRes] = await Promise.all([
    listDeclarations(orgId),
    supabase
      .from('donors')
      .select('id, full_name')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('full_name'),
  ]);

  const donors = (donorsRes.data ?? []) as { id: string; full_name: string }[];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Gift Aid Declarations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage donor Gift Aid declarations. A valid declaration is required before
          a donation can be claimed.
        </p>
      </div>
      <DeclarationsClient
        declarations={declarations}
        donors={donors}
        canEdit={canEdit}
      />
    </div>
  );
}
