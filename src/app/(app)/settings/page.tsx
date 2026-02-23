import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { getSettings, listMembers, listBankAccounts } from './actions';
import { listInvites } from '@/lib/invites/actions';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { SoftAlert } from '@/components/soft-alert';
import { SettingsClient } from './settings-client';

export default async function SettingsPage() {
  const { orgId, role, user } = await getActiveOrg();

  const supabase = await createClient();

  const [settingsRes, membersRes, invitesRes, bankAccountsRes, liabilityAccountsRes, expenseAccountsRes, incomeAccountsRes, fundsRes] =
    await Promise.all([
      getSettings(orgId),
      listMembers(orgId),
      listInvites(orgId),
      listBankAccounts(orgId, true),
      supabase
        .from('accounts')
        .select('id, code, name')
        .eq('organisation_id', orgId)
        .eq('type', 'liability')
        .eq('is_active', true)
        .order('code'),
      supabase
        .from('accounts')
        .select('id, code, name')
        .eq('organisation_id', orgId)
        .eq('type', 'expense')
        .eq('is_active', true)
        .order('code'),
      supabase
        .from('accounts')
        .select('id, code, name')
        .eq('organisation_id', orgId)
        .eq('type', 'income')
        .eq('is_active', true)
        .order('code'),
      supabase
        .from('funds')
        .select('id, name')
        .eq('organisation_id', orgId)
        .eq('is_active', true)
        .order('name'),
    ]);

  const bankAccounts = (bankAccountsRes.data ?? []) as {
    id: string;
    name: string;
    account_number_last4: string | null;
    status: string;
  }[];
  const liabilityAccounts = (liabilityAccountsRes.data ?? []) as {
    id: string;
    code: string;
    name: string;
  }[];
  const expenseAccounts = (expenseAccountsRes.data ?? []) as {
    id: string;
    code: string;
    name: string;
  }[];
  const incomeAccounts = (incomeAccountsRes.data ?? []) as {
    id: string;
    code: string;
    name: string;
  }[];
  const funds = (fundsRes.data ?? []) as {
    id: string;
    name: string;
  }[];

  return (
    <PageShell>
      <PageHeader
        title="Settings"
        subtitle="Manage organisation, accounting rules, and preferences"
      />

      {settingsRes.error && (
        <SoftAlert variant="error">{settingsRes.error}</SoftAlert>
      )}

      <SettingsClient
        orgId={orgId}
        role={role}
        currentUserId={user.id}
        settings={settingsRes.data}
        members={membersRes.data}
        invites={invitesRes.data}
        bankAccounts={bankAccounts}
        liabilityAccounts={liabilityAccounts}
        expenseAccounts={expenseAccounts}
        incomeAccounts={incomeAccounts}
        funds={funds}
      />
    </PageShell>
  );
}
