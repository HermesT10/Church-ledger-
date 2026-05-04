import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { listBankRules } from '@/lib/banking/bank-rules-actions';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { BankRulesClient } from './bank-rules-client';

export default async function BankRulesPage() {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const [rulesResult, bankAccounts, ledgerAccounts, funds, incomeStreams, donors, suppliers] = await Promise.all([
    listBankRules(),
    supabase
      .from('bank_accounts')
      .select('id, name')
      .eq('organisation_id', orgId)
      .eq('status', 'active')
      .order('name'),
    supabase
      .from('accounts')
      .select('id, code, name')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .eq('available_in_reconciliation', true)
      .order('code'),
    supabase
      .from('funds')
      .select('id, name')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('income_streams')
      .select('id, code, name')
      .eq('organisation_id', orgId)
      .eq('status', 'active')
      .order('name'),
    supabase
      .from('donors')
      .select('id, full_name, display_name')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('full_name'),
    supabase
      .from('suppliers')
      .select('id, name')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('name'),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Bank Rules"
        subtitle="Create rules that suggest categorisation and matching for recurring bank transactions."
        actions={
          <Button asChild variant="outline">
            <Link href="/banking">Back to Banking</Link>
          </Button>
        }
      />

      <BankRulesClient
        rules={rulesResult.data}
        bankAccounts={(bankAccounts.data ?? []).map((account) => ({ id: account.id, name: account.name }))}
        ledgerAccounts={(ledgerAccounts.data ?? []).map((account) => ({ id: account.id, name: `${account.code} ${account.name}` }))}
        funds={(funds.data ?? []).map((fund) => ({ id: fund.id, name: fund.name }))}
        incomeStreams={(incomeStreams.data ?? []).map((stream) => ({ id: stream.id, name: `${stream.code} ${stream.name}` }))}
        donors={(donors.data ?? []).map((donor) => ({ id: donor.id, name: donor.display_name ?? donor.full_name }))}
        suppliers={(suppliers.data ?? []).map((supplier) => ({ id: supplier.id, name: supplier.name }))}
      />
    </PageShell>
  );
}
