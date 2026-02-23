'use server';

import { redirect } from 'next/navigation';
import { assertWriteAllowed } from '@/lib/demo';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { assertCanPerform } from '@/lib/permissions';

const SEED_FUNDS: {
  name: string;
  type: 'unrestricted' | 'restricted' | 'designated';
  reporting_group: string;
}[] = [
  { name: 'General Fund', type: 'unrestricted', reporting_group: 'General' },
  { name: 'Friends In Need', type: 'restricted', reporting_group: 'Outreach' },
  { name: 'Tanzania Project', type: 'restricted', reporting_group: 'Outreach' },
  { name: 'Building Project', type: 'restricted', reporting_group: 'Property' },
  { name: 'Seniors', type: 'restricted', reporting_group: 'Community' },
  { name: 'URC Community Grant', type: 'restricted', reporting_group: 'Grants' },
  { name: 'Basketball', type: 'restricted', reporting_group: 'Community' },
  { name: 'Youth', type: 'restricted', reporting_group: 'Community' },
  { name: 'Maintenance Funds', type: 'restricted', reporting_group: 'Property' },
  { name: 'Baptist Union', type: 'restricted', reporting_group: 'Grants' },
  { name: 'URC Funding', type: 'restricted', reporting_group: 'Grants' },
];

export async function seedFunds() {
  await assertWriteAllowed();
  const { orgId, role } = await getActiveOrg();

  assertCanPerform(role, 'seed', 'settings');

  const supabase = await createClient();

  const rows = SEED_FUNDS.map((fund) => ({
    organisation_id: orgId,
    name: fund.name,
    type: fund.type,
    reporting_group: fund.reporting_group,
  }));

  // Upsert with ignoreDuplicates so clicking Seed multiple times is safe.
  // The unique constraint (organisation_id, name) prevents duplicates.
  const { error } = await supabase
    .from('funds')
    .upsert(rows, { onConflict: 'organisation_id,name', ignoreDuplicates: true });

  if (error) {
    redirect('/settings/seed?error=' + encodeURIComponent(error.message));
  }

  redirect('/funds');
}

/* ------------------------------------------------------------------ */
/*  Seed Accounts                                                      */
/* ------------------------------------------------------------------ */

const SEED_ACCOUNTS: {
  code: string;
  name: string;
  type: 'income' | 'expense' | 'asset' | 'liability' | 'equity';
  reporting_category: string;
}[] = [
  // Income
  { code: 'INC-001', name: 'Donations-General', type: 'income', reporting_category: 'Tithes & Offerings' },
  { code: 'INC-002', name: 'Donations-Restricted', type: 'income', reporting_category: 'Tithes & Offerings' },
  { code: 'INC-003', name: 'Gift Aid', type: 'income', reporting_category: 'Tax Recovery' },
  { code: 'INC-004', name: 'Lettings/Hall Hire', type: 'income', reporting_category: 'Other Income' },
  { code: 'INC-005', name: 'Grants', type: 'income', reporting_category: 'Other Income' },
  { code: 'INC-006', name: 'Fundraising/Events', type: 'income', reporting_category: 'Other Income' },
  // Expense
  { code: 'EXP-001', name: 'Salaries', type: 'expense', reporting_category: 'Staff Costs' },
  { code: 'EXP-002', name: 'Employer NIC', type: 'expense', reporting_category: 'Staff Costs' },
  { code: 'EXP-003', name: 'Pension', type: 'expense', reporting_category: 'Staff Costs' },
  { code: 'EXP-004', name: 'Utilities', type: 'expense', reporting_category: 'Premises Costs' },
  { code: 'EXP-005', name: 'Insurance', type: 'expense', reporting_category: 'Premises Costs' },
  { code: 'EXP-006', name: 'Maintenance & Repairs', type: 'expense', reporting_category: 'Premises Costs' },
  { code: 'EXP-007', name: 'Ministry Activities', type: 'expense', reporting_category: 'Ministry & Activities' },
  { code: 'EXP-008', name: 'Youth Activities', type: 'expense', reporting_category: 'Ministry & Activities' },
  // Asset
  { code: 'AST-001', name: 'Bank Account 1', type: 'asset', reporting_category: 'Bank Accounts' },
  { code: 'AST-002', name: 'Bank Account 2', type: 'asset', reporting_category: 'Bank Accounts' },
  { code: 'AST-003', name: 'Bank Account 3', type: 'asset', reporting_category: 'Bank Accounts' },
  // Liability
  { code: 'LIA-001', name: 'Creditors/Accounts Payable', type: 'liability', reporting_category: 'Creditors' },
  { code: 'LIA-002', name: 'PAYE/NIC Liability', type: 'liability', reporting_category: 'Payroll Liabilities' },
  { code: 'LIA-003', name: 'Pension Liability', type: 'liability', reporting_category: 'Payroll Liabilities' },
  { code: 'LIA-004', name: 'Net Pay Liability', type: 'liability', reporting_category: 'Payroll Liabilities' },
  // Equity
  { code: 'EQU-001', name: 'General Reserves', type: 'equity', reporting_category: 'General Reserves' },
  { code: 'EQU-002', name: 'Restricted Reserves', type: 'equity', reporting_category: 'Restricted Reserves' },
];

export async function seedAccounts() {
  await assertWriteAllowed();
  const { orgId, role } = await getActiveOrg();

  assertCanPerform(role, 'seed', 'settings');

  const supabase = await createClient();

  const rows = SEED_ACCOUNTS.map((account) => ({
    organisation_id: orgId,
    code: account.code,
    name: account.name,
    type: account.type,
    reporting_category: account.reporting_category,
  }));

  // Upsert with ignoreDuplicates so clicking Seed multiple times is safe.
  // The unique constraint (organisation_id, code) prevents duplicates.
  const { error } = await supabase
    .from('accounts')
    .upsert(rows, { onConflict: 'organisation_id,code', ignoreDuplicates: true });

  if (error) {
    redirect('/settings/seed?error=' + encodeURIComponent(error.message));
  }

  redirect('/accounts');
}

/* ------------------------------------------------------------------ */
/*  Seed Giving Platforms                                              */
/* ------------------------------------------------------------------ */

const SEED_GIVING_ACCOUNTS: { code: string; name: string; type: 'income' | 'asset' | 'expense' }[] = [
  { code: 'CLR-GC', name: 'GoCardless Clearing', type: 'asset' },
  { code: 'CLR-SU', name: 'SumUp Clearing', type: 'asset' },
  { code: 'CLR-IZ', name: 'iZettle Clearing', type: 'asset' },
  { code: 'EXP-FEE', name: 'Platform Fees', type: 'expense' },
  { code: 'INC-DON', name: 'Donations Income', type: 'income' },
];

const SEED_PROVIDERS: { provider: string; clearingCode: string }[] = [
  { provider: 'gocardless', clearingCode: 'CLR-GC' },
  { provider: 'sumup', clearingCode: 'CLR-SU' },
  { provider: 'izettle', clearingCode: 'CLR-IZ' },
];

export async function seedGivingPlatforms() {
  await assertWriteAllowed();
  const { orgId, role } = await getActiveOrg();

  assertCanPerform(role, 'seed', 'settings');

  const supabase = await createClient();

  // 1. Upsert clearing + fee accounts
  const accountRows = SEED_GIVING_ACCOUNTS.map((a) => ({
    organisation_id: orgId,
    code: a.code,
    name: a.name,
    type: a.type,
  }));

  const { error: accErr } = await supabase
    .from('accounts')
    .upsert(accountRows, { onConflict: 'organisation_id,code', ignoreDuplicates: true });

  if (accErr) {
    redirect('/settings/seed?error=' + encodeURIComponent(accErr.message));
  }

  // 2. Fetch account IDs by code
  const codes = SEED_GIVING_ACCOUNTS.map((a) => a.code);
  const { data: accounts, error: fetchErr } = await supabase
    .from('accounts')
    .select('id, code')
    .eq('organisation_id', orgId)
    .in('code', codes);

  if (fetchErr || !accounts) {
    redirect('/settings/seed?error=' + encodeURIComponent(fetchErr?.message ?? 'Failed to fetch accounts.'));
  }

  const accountMap = new Map(accounts.map((a) => [a.code, a.id]));
  const feeAccountId = accountMap.get('EXP-FEE');
  const incomeAccountId = accountMap.get('INC-DON');

  if (!feeAccountId) {
    redirect('/settings/seed?error=' + encodeURIComponent('Fee account was not created.'));
  }

  // 3. Upsert giving_platforms rows (including donations_income_account_id)
  const platformRows = SEED_PROVIDERS.map((p) => ({
    organisation_id: orgId,
    provider: p.provider,
    clearing_account_id: accountMap.get(p.clearingCode)!,
    fee_account_id: feeAccountId,
    ...(incomeAccountId ? { donations_income_account_id: incomeAccountId } : {}),
  }));

  const { error: gpErr } = await supabase
    .from('giving_platforms')
    .upsert(platformRows, { onConflict: 'organisation_id,provider', ignoreDuplicates: true });

  if (gpErr) {
    redirect('/settings/seed?error=' + encodeURIComponent(gpErr.message));
  }

  redirect('/giving-platforms');
}
