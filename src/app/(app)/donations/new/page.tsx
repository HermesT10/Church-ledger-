import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
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
    <PageShell className="max-w-4xl">
      <PageHeader
        title="Record Donation"
        subtitle="Capture the donation source, fund allocation, and posting details in one step."
      />
      <NewDonationClient
        donors={(donors ?? []).map((d) => ({ id: d.id, name: d.full_name }))}
        funds={(funds ?? []).map((f) => ({ id: f.id, name: f.name, type: f.type }))}
      />
    </PageShell>
  );
}
