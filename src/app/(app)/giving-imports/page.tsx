import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { listGivingImports } from '@/lib/giving/actions';
import { getGivingPlatforms } from '@/lib/giving-platforms/actions';
import { GivingImportsClient } from './giving-imports-client';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';

export default async function GivingImportsPage() {
  const { orgId, role } = await getActiveOrg();

  if (role !== 'admin' && role !== 'treasurer') {
    redirect('/dashboard');
  }

  const supabase = await createClient();

  const [{ data: imports }, { data: platforms }, { data: bankAccounts }] =
    await Promise.all([
      listGivingImports(orgId),
      getGivingPlatforms(orgId),
      supabase
        .from('bank_accounts')
        .select('id, name')
        .eq('organisation_id', orgId)
        .order('name'),
    ]);

  // Get active provider names
  const activeProviders = platforms
    .filter((p) => p.is_active)
    .map((p) => p.provider);

  // Serialise bank accounts for the client
  const bankAccountOptions = (bankAccounts ?? []).map((ba) => ({
    id: ba.id as string,
    name: ba.name as string,
  }));

  return (
    <PageShell>
      <PageHeader
        title="Giving Imports"
        subtitle="Import donation CSVs from GoCardless, SumUp, or iZettle. Journals are created automatically."
      />
      <GivingImportsClient
        imports={imports}
        activeProviders={activeProviders}
        bankAccounts={bankAccountOptions}
      />
    </PageShell>
  );
}
