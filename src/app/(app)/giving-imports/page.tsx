import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { listGivingImports } from '@/lib/giving/actions';
import { getGivingPlatforms } from '@/lib/giving-platforms/actions';
import { GivingImportsClient } from './giving-imports-client';

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
    <div className="mx-auto max-w-7xl px-6 py-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Giving Imports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Import donation CSVs from GoCardless, SumUp, or iZettle. Journals are created automatically.
        </p>
      </div>

      <GivingImportsClient
        orgId={orgId}
        imports={imports}
        activeProviders={activeProviders}
        bankAccounts={bankAccountOptions}
      />
    </div>
  );
}
