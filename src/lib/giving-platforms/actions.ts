'use server';

import { createClient } from '@/lib/supabase/server';
import { getActiveOrg } from '@/lib/org';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { assertWriteAllowed } from '@/lib/demo';
import { validatePlatformMapping } from './validation';
import type { GivingPlatformRow } from './types';

/* ------------------------------------------------------------------ */
/*  getGivingPlatforms                                                 */
/*  Fetches all platforms for an org with joined account info.         */
/* ------------------------------------------------------------------ */

export async function getGivingPlatforms(
  orgId: string
): Promise<{ data: GivingPlatformRow[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('giving_platforms')
    .select(
      `id, provider, clearing_account_id, fee_account_id, donations_income_account_id, is_active,
       clearing:accounts!clearing_account_id(code, name),
       fee:accounts!fee_account_id(code, name)`
    )
    .eq('organisation_id', orgId)
    .order('provider');

  if (error) {
    return { data: [], error: error.message };
  }

  // Batch-fetch income account info if needed
  const incomeIds = (data ?? [])
    .map((d) => d.donations_income_account_id)
    .filter((id): id is string => !!id);

  let incomeMap = new Map<string, { code: string; name: string }>();
  if (incomeIds.length > 0) {
    const { data: incAccts } = await supabase
      .from('accounts')
      .select('id, code, name')
      .in('id', incomeIds);
    for (const a of incAccts ?? []) {
      incomeMap.set(a.id, { code: a.code, name: a.name });
    }
  }

  const rows: GivingPlatformRow[] = (data ?? []).map((d) => {
    const clearing = d.clearing as
      | { code: string; name: string }
      | { code: string; name: string }[]
      | null;
    const fee = d.fee as
      | { code: string; name: string }
      | { code: string; name: string }[]
      | null;

    const clrObj = Array.isArray(clearing) ? clearing[0] ?? null : clearing;
    const feeObj = Array.isArray(fee) ? fee[0] ?? null : fee;

    const incId = d.donations_income_account_id as string | null;
    const incObj = incId ? incomeMap.get(incId) ?? null : null;

    return {
      id: d.id,
      provider: d.provider,
      clearing_account_id: d.clearing_account_id,
      clearing_account_code: clrObj?.code ?? '',
      clearing_account_name: clrObj?.name ?? '',
      fee_account_id: d.fee_account_id,
      fee_account_code: feeObj?.code ?? '',
      fee_account_name: feeObj?.name ?? '',
      donations_income_account_id: incId,
      donations_income_account_code: incObj?.code ?? '',
      donations_income_account_name: incObj?.name ?? '',
      is_active: d.is_active,
    };
  });

  return { data: rows, error: null };
}

/* ------------------------------------------------------------------ */
/*  updateGivingPlatformMapping                                        */
/*  Updates clearing/fee account and active status for a platform.     */
/* ------------------------------------------------------------------ */

export async function updateGivingPlatformMapping(params: {
  platformId: string;
  clearingAccountId: string;
  feeAccountId: string;
  donationsIncomeAccountId: string | null;
  isActive: boolean;
}): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { platformId, clearingAccountId, feeAccountId, donationsIncomeAccountId, isActive } = params;

  // Role check
  const { role, orgId } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'giving_platforms'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();

  // Fetch both accounts to validate
  const { data: accounts, error: accErr } = await supabase
    .from('accounts')
    .select('id, organisation_id, type')
    .in('id', [clearingAccountId, feeAccountId]);

  if (accErr) {
    return { success: false, error: accErr.message };
  }

  const clearingAccount = accounts?.find((a) => a.id === clearingAccountId) ?? null;
  const feeAccount = accounts?.find((a) => a.id === feeAccountId) ?? null;

  const validation = validatePlatformMapping({
    organisationId: orgId,
    clearingAccount: clearingAccount
      ? { id: clearingAccount.id, organisation_id: clearingAccount.organisation_id, type: clearingAccount.type }
      : null,
    feeAccount: feeAccount
      ? { id: feeAccount.id, organisation_id: feeAccount.organisation_id, type: feeAccount.type }
      : null,
  });

  if (!validation.valid) {
    return { success: false, error: validation.error ?? 'Validation failed.' };
  }

  // Validate income account if provided
  if (donationsIncomeAccountId) {
    const { data: incAcc } = await supabase
      .from('accounts')
      .select('id, organisation_id, type')
      .eq('id', donationsIncomeAccountId)
      .single();

    if (!incAcc) {
      return { success: false, error: 'Donations income account not found.' };
    }
    if (incAcc.organisation_id !== orgId) {
      return { success: false, error: 'Donations income account does not belong to this organisation.' };
    }
    if (incAcc.type !== 'income') {
      return { success: false, error: 'Donations income account must be an income account.' };
    }
  }

  // Update the platform row
  const { error: updateErr } = await supabase
    .from('giving_platforms')
    .update({
      clearing_account_id: clearingAccountId,
      fee_account_id: feeAccountId,
      donations_income_account_id: donationsIncomeAccountId,
      is_active: isActive,
    })
    .eq('id', platformId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  return { success: true, error: null };
}
