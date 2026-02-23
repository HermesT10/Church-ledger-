import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { StatementReconciliationClient } from './statement-reconciliation-client';

export default async function StatementReconciliationPage() {
  const { orgId, role } = await getActiveOrg();

  if (role !== 'admin' && role !== 'treasurer') {
    redirect('/dashboard');
  }

  const supabase = await createClient();

  const { data: bankAccounts } = await supabase
    .from('bank_accounts')
    .select('id, name')
    .eq('organisation_id', orgId)
    .eq('status', 'active')
    .order('name');

  const accounts = (bankAccounts ?? []).map((ba) => ({
    id: ba.id as string,
    name: ba.name as string,
  }));

  return (
    <div className="mx-auto max-w-7xl px-6 py-6 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Statement Reconciliation</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Match your bank statement closing balance against the ledger.
          Tick off cleared transactions and finalize when the difference is zero.
        </p>
      </div>

      <StatementReconciliationClient bankAccounts={accounts} />
    </div>
  );
}
