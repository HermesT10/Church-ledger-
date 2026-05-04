import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { getSettings, listMembers, listBankAccounts } from './actions';
import { listInvites } from '@/lib/invites/actions';
import { getOrganisationSubscription } from '@/lib/billing/actions';
import { isPlatformAdminEmail } from '@/lib/platform-admin';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { SoftAlert } from '@/components/soft-alert';
import { Button } from '@/components/ui/button';
import { SettingsClient } from './settings-client';

export default async function SettingsPage() {
  const { orgId, role, user } = await getActiveOrg();
  const isPlatformAdmin = isPlatformAdminEmail(user.email);

  const supabase = await createClient();

  const [
    settingsRes,
    membersRes,
    invitesRes,
    subscriptionRes,
    bankAccountsRes,
    creditorsLiabilityAccountsRes,
    payrollExpenseAccountsRes,
    payrollLiabilityAccountsRes,
    donationIncomeAccountsRes,
    donationFeeExpenseAccountsRes,
    giftAidBankGlAccountsRes,
    fundsRes,
  ] = await Promise.all([
    getSettings(orgId),
    listMembers(orgId),
    listInvites(orgId),
    getOrganisationSubscription(orgId),
    listBankAccounts(orgId, true),
    supabase
      .from('accounts')
      .select('id, code, name')
      .eq('organisation_id', orgId)
      .eq('type', 'liability')
      .eq('is_active', true)
      .eq('available_in_invoices', true)
      .order('code'),
    supabase
      .from('accounts')
      .select('id, code, name')
      .eq('organisation_id', orgId)
      .eq('type', 'expense')
      .eq('is_active', true)
      .eq('available_in_payroll', true)
      .order('code'),
    supabase
      .from('accounts')
      .select('id, code, name')
      .eq('organisation_id', orgId)
      .eq('type', 'liability')
      .eq('is_active', true)
      .eq('available_in_payroll', true)
      .order('code'),
    supabase
      .from('accounts')
      .select('id, code, name')
      .eq('organisation_id', orgId)
      .eq('type', 'income')
      .eq('is_active', true)
      .eq('available_in_donations', true)
      .order('code'),
    supabase
      .from('accounts')
      .select('id, code, name')
      .eq('organisation_id', orgId)
      .eq('type', 'expense')
      .eq('is_active', true)
      .eq('available_in_donations', true)
      .order('code'),
    supabase
      .from('accounts')
      .select('id, code, name')
      .eq('organisation_id', orgId)
      .eq('type', 'asset')
      .eq('is_active', true)
      .eq('available_in_reconciliation', true)
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
  const accountRow = (rows: typeof creditorsLiabilityAccountsRes.data) =>
    (rows ?? []) as { id: string; code: string; name: string }[];
  const creditorsLiabilityAccounts = accountRow(creditorsLiabilityAccountsRes.data);
  const payrollExpenseAccounts = accountRow(payrollExpenseAccountsRes.data);
  const payrollLiabilityAccounts = accountRow(payrollLiabilityAccountsRes.data);
  const donationIncomeAccounts = accountRow(donationIncomeAccountsRes.data);
  const donationFeeExpenseAccounts = accountRow(donationFeeExpenseAccountsRes.data);
  const giftAidBankGlAccounts = accountRow(giftAidBankGlAccountsRes.data);
  const funds = (fundsRes.data ?? []) as {
    id: string;
    name: string;
  }[];

  return (
    <PageShell>
      <PageHeader
        title="Settings"
        subtitle="Manage organisation, accounting rules, and preferences"
        actions={
          (role === 'admin' || role === 'treasurer') ? (
            <div className="flex items-center gap-2">
              {isPlatformAdmin && (
                <Button asChild variant="outline">
                  <Link href="/internal">Internal Admin</Link>
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href="/settings/diagnostics">Diagnostics</Link>
              </Button>
            </div>
          ) : null
        }
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
        subscription={subscriptionRes.data}
        bankAccounts={bankAccounts}
        creditorsLiabilityAccounts={creditorsLiabilityAccounts}
        payrollExpenseAccounts={payrollExpenseAccounts}
        payrollLiabilityAccounts={payrollLiabilityAccounts}
        donationIncomeAccounts={donationIncomeAccounts}
        donationFeeExpenseAccounts={donationFeeExpenseAccounts}
        giftAidBankGlAccounts={giftAidBankGlAccounts}
        funds={funds}
      />
    </PageShell>
  );
}
