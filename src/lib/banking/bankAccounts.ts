'use server';

import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { assertWriteAllowed } from '@/lib/demo';

/* ------------------------------------------------------------------ */
/*  List bank accounts                                                 */
/* ------------------------------------------------------------------ */

export async function listBankAccounts(orgId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('bank_accounts')
    .select('*')
    .eq('organisation_id', orgId)
    .eq('status', 'active')
    .order('name');

  return { data: data ?? [], error: error?.message ?? null };
}

/* ------------------------------------------------------------------ */
/*  Create bank account                                                */
/* ------------------------------------------------------------------ */

interface CreateBankAccountPayload {
  name: string;
  account_number_last4?: string;
  sort_code?: string;
  currency?: string;
}

export async function createBankAccount(
  orgId: string,
  payload: CreateBankAccountPayload
) {
  await assertWriteAllowed();
  // Server-side role check: only treasurer or admin can create
  const { role } = await getActiveOrg();

  try { assertCanPerform(role, 'create', 'banking'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const name = payload.name?.trim();
  if (!name) {
    return { success: false, error: 'Bank account name is required.' };
  }

  const supabase = await createClient();

  const { error } = await supabase.from('bank_accounts').insert({
    organisation_id: orgId,
    name,
    account_number_last4: payload.account_number_last4?.trim() || null,
    sort_code: payload.sort_code?.trim() || null,
    currency: payload.currency?.trim() || 'GBP',
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, error: null };
}

/* ------------------------------------------------------------------ */
/*  Seed demo bank accounts (admin only)                               */
/* ------------------------------------------------------------------ */

const SEED_BANK_ACCOUNTS = [
  { name: 'Bank Account 1', currency: 'GBP' },
  { name: 'Bank Account 2', currency: 'GBP' },
  { name: 'Bank Account 3', currency: 'GBP' },
];

export async function seedBankAccounts(orgId: string) {
  await assertWriteAllowed();
  const { role } = await getActiveOrg();

  try { assertCanPerform(role, 'seed', 'settings'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();

  const rows = SEED_BANK_ACCOUNTS.map((a) => ({
    organisation_id: orgId,
    name: a.name,
    currency: a.currency,
  }));

  const { error } = await supabase
    .from('bank_accounts')
    .upsert(rows, { onConflict: 'organisation_id,name', ignoreDuplicates: true });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, error: null };
}
