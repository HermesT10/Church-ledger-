import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { NewDonationClient } from './new-donation-client';

export default async function NewDonationPage() {
  const { orgId, role } = await getActiveOrg();

  if (role !== 'admin' && role !== 'treasurer') {
    redirect('/donations');
  }

  const supabase = await createClient();

  const [{ data: donors }, { data: funds }] = await Promise.all([
    supabase
      .from('donors')
      .select('id, full_name')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('full_name'),
    supabase
      .from('funds')
      .select('id, name, type, is_active')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('name'),
  ]);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Record Donation</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create a new donation and post it to the General Ledger.
        </p>
      </div>
      <NewDonationClient
        donors={(donors ?? []).map((d) => ({ id: d.id, name: d.full_name }))}
        funds={(funds ?? []).map((f) => ({ id: f.id, name: f.name, type: f.type }))}
      />
    </div>
  );
}
