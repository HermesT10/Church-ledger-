'use server';

import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { assertWriteAllowed } from '@/lib/demo';
import { trackProductEvent } from '@/lib/analytics/server';
import type { OnboardingProgress } from './types';

export type SetupType = 'blank' | 'guided' | 'import_first';

export interface GuidedSetupAnswers {
  restrictedFunds: boolean;
  lettings: boolean;
  payroll: boolean;
  giftAid: boolean;
}

const BASE_GUIDED_ACCOUNTS = [
  { code: '1000', name: 'Bank Account', type: 'asset', reporting_category: 'Cash at bank and in hand', subtype: 'bank' },
  { code: '4000', name: 'Giving and Donations', type: 'income', reporting_category: 'Donations and legacies', subtype: 'giving' },
  { code: '5000', name: 'Church Running Costs', type: 'expense', reporting_category: 'Charitable activities', subtype: 'general' },
];

const GUIDED_OPTIONAL_ACCOUNTS = {
  lettings: [
    { code: '4100', name: 'Lettings Income', type: 'income', reporting_category: 'Charitable activities', subtype: 'lettings' },
  ],
  payroll: [
    { code: '5200', name: 'Salaries and Wages', type: 'expense', reporting_category: 'Staff costs', subtype: 'payroll' },
    { code: '2210', name: 'PAYE and NIC Payable', type: 'liability', reporting_category: 'Creditors', subtype: 'payroll_liability' },
    { code: '2220', name: 'Pension Payable', type: 'liability', reporting_category: 'Creditors', subtype: 'payroll_liability' },
  ],
  giftAid: [
    { code: '1100', name: 'Gift Aid Receivable', type: 'asset', reporting_category: 'Debtors', subtype: 'gift_aid' },
    { code: '4010', name: 'Gift Aid Income', type: 'income', reporting_category: 'Donations and legacies', subtype: 'gift_aid' },
  ],
};

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
  const { role, user } = await getActiveOrg();

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

  if (!error) {
    await trackProductEvent({
      organisationId: orgId,
      userId: user.id,
      eventType: 'onboarding_completed',
      moduleKey: 'onboarding',
      path: '/onboarding/setup',
    });
  }

  if (!error) {
    await supabase
      .from('organisations')
      .update({
        setup_mode: false,
        setup_completed_at: new Date().toISOString(),
      })
      .eq('id', orgId);
  }

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
/*  Setup mode and progress                                            */
/* ------------------------------------------------------------------ */

export async function setSetupModeForOnboarding(
  orgId: string,
  setupType: SetupType,
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'update', 'settings');
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  if (!['blank', 'guided', 'import_first'].includes(setupType)) {
    return { success: false, error: 'Unknown setup mode.' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('organisations')
    .update({ setup_mode: true, setup_type: setupType })
    .eq('id', orgId);

  if (error) {
    return { success: false, error: error.message };
  }

  await supabase.from('workspace_setup_progress').upsert(
    {
      workspace_id: orgId,
      updated_by: user.id,
    },
    { onConflict: 'workspace_id' },
  );

  return { success: true, error: null };
}

export async function updateSetupProgressForOnboarding(
  orgId: string,
  progress: Partial<{
    bank_added: boolean;
    statement_uploaded: boolean;
    transactions_categorised: boolean;
    funds_created: boolean;
    reports_viewed: boolean;
    skipped: boolean;
  }>,
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'update', 'settings');
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('workspace_setup_progress').upsert(
    {
      workspace_id: orgId,
      ...progress,
      updated_by: user.id,
    },
    { onConflict: 'workspace_id' },
  );

  return { success: !error, error: error?.message ?? null };
}

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
/*  Guided setup builder                                               */
/* ------------------------------------------------------------------ */

export async function createGuidedSetupStructure(
  orgId: string,
  answers: GuidedSetupAnswers,
): Promise<{ success: boolean; error: string | null; created: { funds: number; accounts: number; categories: number } }> {
  await assertWriteAllowed();
  const { role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'create', 'settings');
  } catch (e) {
    return {
      success: false,
      error: e instanceof PermissionError ? e.message : 'Permission denied.',
      created: { funds: 0, accounts: 0, categories: 0 },
    };
  }

  const supabase = await createClient();
  const fundRows = [
    {
      organisation_id: orgId,
      name: 'General Fund',
      type: 'unrestricted',
      reporting_group: 'General',
      created_by: user.id,
    },
    ...(answers.restrictedFunds
      ? [{
          organisation_id: orgId,
          name: 'Restricted Funds Holding',
          type: 'restricted',
          reporting_group: 'Restricted funds',
          created_by: user.id,
        }]
      : []),
  ];

  const accountTemplates = [
    ...BASE_GUIDED_ACCOUNTS,
    ...(answers.lettings ? GUIDED_OPTIONAL_ACCOUNTS.lettings : []),
    ...(answers.payroll ? GUIDED_OPTIONAL_ACCOUNTS.payroll : []),
    ...(answers.giftAid ? GUIDED_OPTIONAL_ACCOUNTS.giftAid : []),
  ];
  const accountRows = accountTemplates.map((account) => ({
    organisation_id: orgId,
    code: account.code,
    name: account.name,
    type: account.type,
    reporting_category: account.reporting_category,
    subtype: account.subtype,
    created_by: user.id,
  }));

  const categoryRows = [
    { register_type: 'income', name: 'Giving', group_name: 'Donations', display_order: 10 },
    { register_type: 'income', name: 'Other income', group_name: 'Other', display_order: 90 },
    { register_type: 'expense', name: 'Church running costs', group_name: 'Running costs', display_order: 10 },
    ...(answers.lettings
      ? [{ register_type: 'income', name: 'Lettings', group_name: 'Lettings', display_order: 20 }]
      : []),
    ...(answers.giftAid
      ? [{ register_type: 'income', name: 'Gift Aid', group_name: 'Donations', display_order: 30 }]
      : []),
    ...(answers.payroll
      ? [{ register_type: 'expense', name: 'Payroll', group_name: 'Staff costs', display_order: 20 }]
      : []),
  ].map((category) => ({
    organisation_id: orgId,
    ...category,
    status: 'active',
    created_by: user.id,
  }));

  const { error: fundError } = await supabase
    .from('funds')
    .upsert(fundRows, { onConflict: 'organisation_id,name', ignoreDuplicates: true });
  if (fundError) {
    return { success: false, error: fundError.message, created: { funds: 0, accounts: 0, categories: 0 } };
  }

  const { error: accountError } = await supabase
    .from('accounts')
    .upsert(accountRows, { onConflict: 'organisation_id,code', ignoreDuplicates: true });
  if (accountError) {
    return { success: false, error: accountError.message, created: { funds: fundRows.length, accounts: 0, categories: 0 } };
  }

  const { error: categoryError } = await supabase
    .from('register_categories')
    .upsert(categoryRows, { onConflict: 'organisation_id,register_type,name', ignoreDuplicates: true });
  if (categoryError) {
    return {
      success: false,
      error: categoryError.message,
      created: { funds: fundRows.length, accounts: accountRows.length, categories: 0 },
    };
  }

  await updateSetupProgressForOnboarding(orgId, {
    funds_created: true,
  });

  await trackProductEvent({
    organisationId: orgId,
    userId: user.id,
    eventType: 'guided_setup_structure_created',
    moduleKey: 'onboarding',
    path: '/onboarding/setup',
    metadata: { answers },
  });

  return {
    success: true,
    error: null,
    created: {
      funds: fundRows.length,
      accounts: accountRows.length,
      categories: categoryRows.length,
    },
  };
}
