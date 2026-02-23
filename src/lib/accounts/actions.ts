'use server';

import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { assertWriteAllowed } from '@/lib/demo';
import type { AccountRow, AccountType, AccountWithStats } from './types';

/* ------------------------------------------------------------------ */
/*  Read operations                                                    */
/* ------------------------------------------------------------------ */

/**
 * Fetch all accounts for the active org, optionally filtered by type
 * and active status. Includes transaction count and balance.
 */
export async function getAccountsWithStats(options?: {
  type?: AccountType;
  activeOnly?: boolean;
}): Promise<{ data: AccountWithStats[]; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  // Fetch accounts
  let query = supabase
    .from('accounts')
    .select('*')
    .eq('organisation_id', orgId)
    .order('type')
    .order('code');

  if (options?.type) {
    query = query.eq('type', options.type);
  }

  if (options?.activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data: accounts, error: accErr } = await query;

  if (accErr || !accounts) {
    return { data: [], error: accErr?.message ?? 'Failed to fetch accounts.' };
  }

  if (accounts.length === 0) {
    return { data: [], error: null };
  }

  // Fetch journal_lines for these accounts to compute count + balance
  const accountIds = accounts.map((a) => a.id);

  const { data: journalLines } = await supabase
    .from('journal_lines')
    .select('account_id, debit_pence, credit_pence')
    .eq('organisation_id', orgId)
    .in('account_id', accountIds);

  // Aggregate: transaction count + net balance per account
  const txnCountMap = new Map<string, number>();
  const balanceMap = new Map<string, number>();

  for (const line of journalLines ?? []) {
    txnCountMap.set(line.account_id, (txnCountMap.get(line.account_id) ?? 0) + 1);
    const net = (line.debit_pence ?? 0) - (line.credit_pence ?? 0);
    balanceMap.set(line.account_id, (balanceMap.get(line.account_id) ?? 0) + net);
  }

  const withStats: AccountWithStats[] = accounts.map((a) => ({
    ...a,
    transaction_count: txnCountMap.get(a.id) ?? 0,
    balance_pence: balanceMap.get(a.id) ?? 0,
  }));

  return { data: withStats, error: null };
}

/**
 * Fetch all accounts (lightweight, no stats) for dropdown selectors.
 */
export async function getAccountsList(options?: {
  type?: AccountType;
  activeOnly?: boolean;
}): Promise<AccountRow[]> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  let query = supabase
    .from('accounts')
    .select('*')
    .eq('organisation_id', orgId)
    .order('type')
    .order('code');

  if (options?.type) {
    query = query.eq('type', options.type);
  }

  if (options?.activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data } = await query;
  return (data ?? []) as AccountRow[];
}

/**
 * Fetch a single account by ID.
 */
export async function getAccount(id: string): Promise<AccountRow | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', id)
    .single();

  return data as AccountRow | null;
}

/**
 * Check if an account has linked transactions (journal_lines or bill_lines).
 */
export async function hasLinkedTransactions(accountId: string): Promise<boolean> {
  const supabase = await createClient();

  const { count: journalCount } = await supabase
    .from('journal_lines')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId);

  if (journalCount && journalCount > 0) return true;

  const { count: billCount } = await supabase
    .from('bill_lines')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId);

  if (billCount && billCount > 0) return true;

  return false;
}

/* ------------------------------------------------------------------ */
/*  Write operations                                                   */
/* ------------------------------------------------------------------ */

export async function createAccount(formData: FormData) {
  await assertWriteAllowed();
  const { orgId } = await getActiveOrg();

  const code = (formData.get('code') as string)?.trim();
  const name = (formData.get('name') as string)?.trim();
  const type = formData.get('type') as string;
  const reportingCategory = (formData.get('reporting_category') as string)?.trim() || null;
  const parentId = (formData.get('parent_id') as string)?.trim() || null;

  if (!code || !name || !type) {
    redirect('/accounts/new?error=' + encodeURIComponent('Code, name, and type are required.'));
  }

  const supabase = await createClient();

  const { error } = await supabase.from('accounts').insert({
    organisation_id: orgId,
    code,
    name,
    type,
    reporting_category: reportingCategory,
    parent_id: parentId,
  });

  if (error) {
    redirect('/accounts/new?error=' + encodeURIComponent(error.message));
  }

  redirect('/accounts');
}

export async function updateAccount(formData: FormData) {
  await assertWriteAllowed();
  await getActiveOrg();

  const id = formData.get('id') as string;
  const code = (formData.get('code') as string)?.trim();
  const name = (formData.get('name') as string)?.trim();
  const type = formData.get('type') as string;
  const reportingCategory = (formData.get('reporting_category') as string)?.trim() || null;
  const parentId = (formData.get('parent_id') as string)?.trim() || null;

  if (!id || !code || !name || !type) {
    redirect(
      `/accounts/${id}?error=` + encodeURIComponent('Code, name, and type are required.'),
    );
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('accounts')
    .update({
      code,
      name,
      type,
      reporting_category: reportingCategory,
      parent_id: parentId,
    })
    .eq('id', id);

  if (error) {
    redirect(`/accounts/${id}?error=` + encodeURIComponent(error.message));
  }

  redirect('/accounts');
}

export async function archiveAccount(formData: FormData) {
  await assertWriteAllowed();
  await getActiveOrg();
  const id = formData.get('id') as string;

  if (!id) redirect('/accounts');

  const supabase = await createClient();

  const { error } = await supabase
    .from('accounts')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    redirect(`/accounts/${id}?error=` + encodeURIComponent(error.message));
  }

  redirect('/accounts');
}

export async function unarchiveAccount(formData: FormData) {
  await assertWriteAllowed();
  await getActiveOrg();
  const id = formData.get('id') as string;

  if (!id) redirect('/accounts');

  const supabase = await createClient();

  const { error } = await supabase
    .from('accounts')
    .update({ is_active: true })
    .eq('id', id);

  if (error) {
    redirect(`/accounts/${id}?error=` + encodeURIComponent(error.message));
  }

  redirect('/accounts');
}

/**
 * Attempt to delete an account. Fails if transactions reference it.
 */
export async function deleteAccount(formData: FormData) {
  await assertWriteAllowed();
  await getActiveOrg();
  const id = formData.get('id') as string;

  if (!id) redirect('/accounts');

  const hasLinks = await hasLinkedTransactions(id);
  if (hasLinks) {
    redirect(
      `/accounts/${id}?error=` +
        encodeURIComponent(
          'Cannot delete this account because it has linked transactions. Deactivate it instead.',
        ),
    );
  }

  const supabase = await createClient();

  const { error } = await supabase.from('accounts').delete().eq('id', id);

  if (error) {
    redirect(`/accounts/${id}?error=` + encodeURIComponent(error.message));
  }

  redirect('/accounts');
}
