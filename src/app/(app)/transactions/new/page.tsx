import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { TransactionForm } from '../transaction-form';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { SoftAlert } from '@/components/soft-alert';
import { Button } from '@/components/ui/button';

export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; duplicate?: string }>;
}) {
  const { orgId, role } = await getActiveOrg();
  const params = await searchParams;
  if (role !== 'admin' && role !== 'treasurer' && role !== 'finance_user') redirect('/transactions');

  const supabase = await createClient();
  const [{ data: accounts }, { data: funds }, { data: bankAccounts }, { data: incomeStreams }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, code, name, type')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('code'),
    supabase
      .from('funds')
      .select('id, name, type')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('bank_accounts')
      .select('id, name')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('income_streams')
      .select('id, code, name')
      .eq('organisation_id', orgId)
      .eq('status', 'active')
      .order('code'),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Add Transaction"
        subtitle="Record what happened, then match it to bank proof before it becomes final."
        actions={<Button asChild variant="outline"><Link href="/transactions">Back to Transactions</Link></Button>}
      />

      {params.error ? <SoftAlert variant="error">{params.error}</SoftAlert> : null}
      {params.duplicate ? (
        <SoftAlert variant="warning">Possible duplicate: {params.duplicate}. Add an override reason to continue.</SoftAlert>
      ) : null}

      <TransactionForm
        accounts={(accounts ?? []) as { id: string; code: string; name: string; type: string }[]}
        funds={(funds ?? []) as { id: string; name: string; type?: string }[]}
        bankAccounts={(bankAccounts ?? []) as { id: string; name: string }[]}
        incomeStreams={(incomeStreams ?? []) as { id: string; code: string; name: string }[]}
      />
    </PageShell>
  );
}
