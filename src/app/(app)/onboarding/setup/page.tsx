import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { getOnboardingProgress } from './actions';
import { SetupWizard } from './setup-client';

export default async function OnboardingSetupPage() {
  const { orgId, role } = await getActiveOrg();

  // Only admin/treasurer can run the onboarding wizard
  if (role !== 'admin' && role !== 'treasurer') {
    redirect('/dashboard');
  }

  const supabase = await createClient();

  // Fetch onboarding progress
  const progress = await getOnboardingProgress(orgId);

  // If already completed, go to dashboard
  if (progress.isCompleted) {
    redirect('/dashboard');
  }

  // Fetch current org profile
  const { data: org } = await supabase
    .from('organisations')
    .select('id, name')
    .eq('id', orgId)
    .single();

  // Fetch existing funds for the org
  const { data: funds } = await supabase
    .from('funds')
    .select('id, name, type')
    .eq('organisation_id', orgId)
    .eq('is_active', true)
    .order('name');

  // Fetch existing accounts count
  const { count: accountCount } = await supabase
    .from('accounts')
    .select('*', { count: 'exact', head: true })
    .eq('organisation_id', orgId)
    .eq('is_active', true);

  // Fetch existing bank accounts
  const { data: bankAccounts } = await supabase
    .from('bank_accounts')
    .select('id, name, account_number_last4, sort_code')
    .eq('organisation_id', orgId)
    .eq('is_active', true)
    .order('name');

  // Fetch existing budgets for current year
  const currentYear = new Date().getFullYear();
  const { data: budgets } = await supabase
    .from('budgets')
    .select('id, year, name')
    .eq('organisation_id', orgId)
    .eq('year', currentYear);

  return (
    <div className="flex min-h-screen items-start justify-center bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_32%),linear-gradient(180deg,rgba(248,250,252,0.98),rgba(241,245,249,0.96))] px-4 py-12">
      <SetupWizard
        orgId={orgId}
        orgName={org?.name ?? ''}
        progress={progress}
        existingFunds={funds ?? []}
        accountCount={accountCount ?? 0}
        existingBankAccounts={bankAccounts ?? []}
        existingBudgets={budgets ?? []}
        currentYear={currentYear}
      />
    </div>
  );
}
