import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { getAccountsList } from '@/lib/accounts/actions';
import type { AccountRow } from '@/lib/accounts/types';
import { getFundsList } from '@/lib/funds/actions';
import { listIncomeStreams } from '@/lib/income-streams/actions';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { getReconciliationWorkspaceData } from '@/lib/banking/reconciliation-workspace-actions';
import { ReconciliationWorkspaceClient } from './reconciliation-workspace-client';

function defaultLettingsIncomeAccountIdFrom(accounts: AccountRow[]): string | null {
  const income = accounts.filter((a) => a.type === 'income');
  if (income.length === 0) return null;
  const preferred =
    income.find((a) => a.code === 'INC-004') ??
    income.find((a) => (a.subtype ?? '').toLowerCase() === 'lettings') ??
    income.find((a) => (a.name ?? '').toLowerCase().includes('letting'));
  return (preferred ?? income[0]).id;
}

export default async function ReconciliationPage() {
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

  const [workspaceResult, funds, accountsList, incomeStreamsResult, donorsResult, activeDeclarationsResult, suppliersResult] =
    await Promise.all([
      getReconciliationWorkspaceData(),
      getFundsList({ activeOnly: true }),
      getAccountsList({ activeOnly: true, availableInReconciliation: true }),
      listIncomeStreams({ activeOnly: true }),
      supabase
        .from('donors')
        .select('id, full_name, display_name, email, is_active')
        .eq('organisation_id', orgId)
        .eq('is_active', true)
        .order('full_name'),
      supabase
        .from('gift_aid_declarations')
        .select('donor_id')
        .eq('organisation_id', orgId)
        .eq('status', 'active')
        .lte('start_date', new Date().toISOString().slice(0, 10))
        .or(`end_date.is.null,end_date.gte.${new Date().toISOString().slice(0, 10)}`),
      supabase
        .from('suppliers')
        .select('id, name')
        .eq('organisation_id', orgId)
        .eq('is_active', true)
        .order('name'),
    ]);

  const donorIdsWithActiveDeclarations = new Set(
    (activeDeclarationsResult.data ?? []).map((declaration) => declaration.donor_id as string),
  );

  const lettingsIncomeAccounts = accountsList
    .filter((a) => a.type === 'income')
    .map((account) => ({
      id: account.id,
      name: `${account.code} ${account.name}`,
    }));
  const defaultLettingsIncomeAccountId = defaultLettingsIncomeAccountIdFrom(accountsList);

  return (
    <PageShell>
      <PageHeader
        title="Bank Reconciliation"
        subtitle="Match imported bank transactions, create records from bank lines, split income or costs, and exclude non-ledger lines."
      />

      <ReconciliationWorkspaceClient
        initialData={
          workspaceResult.data ?? {
            bankAccounts: accounts,
            selectedBankAccountId: accounts[0]?.id ?? null,
            selectedBankAccountLedgerLink: null,
            filter: 'needs_reconciliation',
            counts: { needs_reconciliation: 0, reconciled: 0, excluded: 0, all: 0 },
            transactions: [],
          }
        }
        donors={(donorsResult.data ?? []).map((donor) => ({
          id: donor.id,
          name: donor.display_name ?? donor.full_name,
          email: donor.email ?? null,
          hasActiveGiftAidDeclaration: donorIdsWithActiveDeclarations.has(donor.id),
        }))}
        funds={funds.map((fund) => ({ id: fund.id, name: fund.name }))}
        accounts={accountsList.map((account) => ({
          id: account.id,
          name: `${account.code} ${account.name}`,
        }))}
        lettingsIncomeAccounts={lettingsIncomeAccounts}
        defaultLettingsIncomeAccountId={defaultLettingsIncomeAccountId}
        incomeStreams={(incomeStreamsResult.data ?? []).map((stream) => ({
          id: stream.id,
          name: `${stream.code} ${stream.name}`,
        }))}
        suppliers={(suppliersResult.data ?? []).map((supplier) => ({
          id: supplier.id,
          name: supplier.name,
        }))}
      />
    </PageShell>
  );
}
