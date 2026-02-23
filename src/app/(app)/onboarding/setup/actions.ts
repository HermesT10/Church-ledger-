'use server';

import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { assertWriteAllowed } from '@/lib/demo';
import type { OnboardingProgress } from './types';

/* ------------------------------------------------------------------ */
/*  Seed data (shared with settings/seed/actions.ts)                   */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Get or create onboarding progress                                  */
/* ------------------------------------------------------------------ */

export async function getOnboardingProgress(
  orgId: string,
): Promise<OnboardingProgress> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('onboarding_progress')
    .select('*')
    .eq('organisation_id', orgId)
    .single();

  if (data) {
    return {
      organisationId: data.organisation_id,
      currentStep: data.current_step,
      completedSteps: (data.completed_steps as number[]) ?? [],
      isCompleted: data.is_completed,
    };
  }

  // Create a new progress row if it doesn't exist
  // Use admin client because the row may not exist for RLS to evaluate yet
  const admin = createAdminClient();
  const { data: newRow } = await admin
    .from('onboarding_progress')
    .upsert(
      {
        organisation_id: orgId,
        current_step: 1,
        completed_steps: [],
        is_completed: false,
      },
      { onConflict: 'organisation_id', ignoreDuplicates: true },
    )
    .select()
    .single();

  return {
    organisationId: orgId,
    currentStep: newRow?.current_step ?? 1,
    completedSteps: (newRow?.completed_steps as number[]) ?? [],
    isCompleted: newRow?.is_completed ?? false,
  };
}

/* ------------------------------------------------------------------ */
/*  Save onboarding step completion                                    */
/* ------------------------------------------------------------------ */

export async function saveOnboardingStep(
  orgId: string,
  step: number,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { role } = await getActiveOrg();

  try {
    assertCanPerform(role, 'update', 'settings');
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const supabase = await createClient();

  // Fetch current progress
  const { data: current } = await supabase
    .from('onboarding_progress')
    .select('completed_steps, current_step')
    .eq('organisation_id', orgId)
    .single();

  const completedSteps: number[] = (current?.completed_steps as number[]) ?? [];

  if (!completedSteps.includes(step)) {
    completedSteps.push(step);
  }

  // Advance current_step to the next incomplete step
  const nextStep = Math.max(step + 1, (current?.current_step ?? 1));

  const { error } = await supabase
    .from('onboarding_progress')
    .update({
      completed_steps: completedSteps,
      current_step: nextStep,
      updated_at: new Date().toISOString(),
    })
    .eq('organisation_id', orgId);

  return { error: error?.message ?? null };
}

/* ------------------------------------------------------------------ */
/*  Skip a step (advance without marking complete)                     */
/* ------------------------------------------------------------------ */

export async function skipOnboardingStep(
  orgId: string,
  step: number,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { role } = await getActiveOrg();

  try {
    assertCanPerform(role, 'update', 'settings');
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const supabase = await createClient();

  const { data: current } = await supabase
    .from('onboarding_progress')
    .select('current_step')
    .eq('organisation_id', orgId)
    .single();

  const nextStep = Math.max(step + 1, (current?.current_step ?? 1));

  const { error } = await supabase
    .from('onboarding_progress')
    .update({
      current_step: nextStep,
      updated_at: new Date().toISOString(),
    })
    .eq('organisation_id', orgId);

  return { error: error?.message ?? null };
}

/* ------------------------------------------------------------------ */
/*  Complete onboarding                                                */
/* ------------------------------------------------------------------ */

export async function completeOnboarding(
  orgId: string,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { role } = await getActiveOrg();

  try {
    assertCanPerform(role, 'update', 'settings');
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('onboarding_progress')
    .update({
      is_completed: true,
      updated_at: new Date().toISOString(),
    })
    .eq('organisation_id', orgId);

  return { error: error?.message ?? null };
}

/* ------------------------------------------------------------------ */
/*  Update org profile (Step 1)                                        */
/* ------------------------------------------------------------------ */

export async function updateOrgProfile(
  orgId: string,
  name: string,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { role } = await getActiveOrg();

  try {
    assertCanPerform(role, 'update', 'settings');
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return { error: 'Organisation name is required.' };
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from('organisations')
    .update({ name: trimmed })
    .eq('id', orgId);

  return { error: error?.message ?? null };
}

/* ------------------------------------------------------------------ */
/*  Seed funds (non-redirecting variant for onboarding wizard)         */
/* ------------------------------------------------------------------ */

export async function seedFundsForOnboarding(
  orgId: string,
): Promise<{ success: boolean; error: string | null; count: number }> {
  await assertWriteAllowed();
  const { role } = await getActiveOrg();

  try {
    assertCanPerform(role, 'seed', 'settings');
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.', count: 0 };
  }

  const supabase = await createClient();

  const rows = SEED_FUNDS.map((fund) => ({
    organisation_id: orgId,
    name: fund.name,
    type: fund.type,
    reporting_group: fund.reporting_group,
  }));

  const { error } = await supabase
    .from('funds')
    .upsert(rows, { onConflict: 'organisation_id,name', ignoreDuplicates: true });

  if (error) {
    return { success: false, error: error.message, count: 0 };
  }

  return { success: true, error: null, count: SEED_FUNDS.length };
}

/* ------------------------------------------------------------------ */
/*  Create a single fund (non-redirecting variant for onboarding)      */
/* ------------------------------------------------------------------ */

export async function createFundForOnboarding(
  orgId: string,
  name: string,
  type: string,
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { role } = await getActiveOrg();

  try {
    assertCanPerform(role, 'create', 'funds');
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  if (!name.trim() || !type) {
    return { success: false, error: 'Name and type are required.' };
  }

  const supabase = await createClient();

  const { error } = await supabase.from('funds').insert({
    organisation_id: orgId,
    name: name.trim(),
    type,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, error: null };
}

/* ------------------------------------------------------------------ */
/*  Seed accounts (non-redirecting variant for onboarding wizard)      */
/* ------------------------------------------------------------------ */

export async function seedAccountsForOnboarding(
  orgId: string,
): Promise<{ success: boolean; error: string | null; count: number }> {
  await assertWriteAllowed();
  const { role } = await getActiveOrg();

  try {
    assertCanPerform(role, 'seed', 'settings');
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.', count: 0 };
  }

  const supabase = await createClient();

  const rows = SEED_ACCOUNTS.map((account) => ({
    organisation_id: orgId,
    code: account.code,
    name: account.name,
    type: account.type,
    reporting_category: account.reporting_category,
  }));

  const { error } = await supabase
    .from('accounts')
    .upsert(rows, { onConflict: 'organisation_id,code', ignoreDuplicates: true });

  if (error) {
    return { success: false, error: error.message, count: 0 };
  }

  return { success: true, error: null, count: SEED_ACCOUNTS.length };
}
