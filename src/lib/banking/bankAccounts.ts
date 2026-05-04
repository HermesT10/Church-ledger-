'use server';

import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { assertWriteAllowed } from '@/lib/demo';
import {
  DEFAULT_BANK_CARD_THEME,
  isBankCardTheme,
  isSafeHexColour,
} from './cardAppearance';
import { createBankLedgerAccountForName } from './ledger-link';

/* ------------------------------------------------------------------ */
/*  List bank accounts                                                 */
/* ------------------------------------------------------------------ */

export async function listBankAccounts(orgId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('bank_accounts')
    .select('*')
    .eq('organisation_id', orgId)
    .eq('is_active', true)
    .order('name');

  return { data: data ?? [], error: error?.message ?? null };
}

/* ------------------------------------------------------------------ */
/*  Create bank account                                                */
/* ------------------------------------------------------------------ */

interface CreateBankAccountPayload {
  name: string;
  account_type?:
    | 'current'
    | 'savings'
    | 'credit_card'
    | 'loan'
    | 'cash'
    | 'clearing';
  bank_name?: string;
  masked_account_number?: string;
  account_number_last4?: string;
  sort_code?: string;
  currency?: string;
  opening_balance?: string | number;
  opening_balance_date?: string;
  card_theme?: string;
  card_colour?: string;
}

function parseOpeningBalance(value: string | number | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? '0')
    .replace(/[£,]/g, '')
    .trim();
  const parsed = Number.parseFloat(raw || '0');
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function createBankAccount(
  orgId: string,
  payload: CreateBankAccountPayload
) {
  await assertWriteAllowed();
  // Server-side role check: only treasurer or admin can create
  const { role, orgId: activeOrgId, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'create', 'banking');
  } catch (e) {
    return {
      success: false,
      error: e instanceof PermissionError ? e.message : 'Permission denied.',
    };
  }

  if (orgId !== activeOrgId) {
    return {
      success: false,
      error: 'Requested organisation does not match the active organisation.',
    };
  }

  const name = payload.name?.trim();
  if (!name) {
    return { success: false, error: 'Bank account name is required.' };
  }

  const supabase = await createClient();
  const accountType = payload.account_type ?? 'current';
  const cardTheme = isBankCardTheme(payload.card_theme)
    ? payload.card_theme
    : DEFAULT_BANK_CARD_THEME;
  const cardColour = payload.card_colour?.trim();
  const masked =
    payload.masked_account_number?.trim() ||
    (payload.account_number_last4?.trim()
      ? `****${payload.account_number_last4.trim()}`
      : null);

  if (cardColour && !isSafeHexColour(cardColour)) {
    return {
      success: false,
      error: 'Card colour must be a safe hex value such as #7c3aed.',
    };
  }

  const { data: existing } = await supabase
    .from('bank_accounts')
    .select('id')
    .eq('organisation_id', activeOrgId)
    .eq('name', name)
    .maybeSingle();

  if (existing) {
    return {
      success: false,
      error: 'A bank account with this name already exists.',
    };
  }

  const ledger = await createBankLedgerAccountForName({
    orgId: activeOrgId,
    bankAccountName: name,
    userId: user.id,
  });

  if (ledger.error || !ledger.account) {
    return {
      success: false,
      error: ledger.error ?? 'Could not create linked ledger account.',
    };
  }

  const { error } = await supabase.from('bank_accounts').insert({
    organisation_id: activeOrgId,
    workspace_id: activeOrgId,
    name,
    linked_account_id: ledger.account.id,
    account_type: accountType,
    bank_name: payload.bank_name?.trim() || null,
    masked_account_number: masked,
    account_number_last4: payload.account_number_last4?.trim() || null,
    sort_code: payload.sort_code?.trim() || null,
    currency: payload.currency?.trim() || 'GBP',
    opening_balance: parseOpeningBalance(payload.opening_balance),
    opening_balance_date: payload.opening_balance_date?.trim() || null,
    card_theme: cardTheme,
    card_colour: cardColour || null,
    card_gradient: null,
    status: 'active',
    is_active: true,
    created_by: user.id,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, error: null };
}

/* ------------------------------------------------------------------ */
/*  Seed starter bank accounts (admin only)                            */
/* ------------------------------------------------------------------ */

const SEED_BANK_ACCOUNTS = [
  { name: 'Bank Account 1', currency: 'GBP' },
  { name: 'Bank Account 2', currency: 'GBP' },
  { name: 'Bank Account 3', currency: 'GBP' },
];

export async function seedBankAccounts(orgId: string) {
  if (process.env.NODE_ENV === 'production') {
    return {
      success: false,
      error: 'Starter bank seed is only available in development.',
    };
  }
  await assertWriteAllowed();
  const { role, orgId: activeOrgId } = await getActiveOrg();

  try {
    assertCanPerform(role, 'seed', 'settings');
  } catch (e) {
    return {
      success: false,
      error: e instanceof PermissionError ? e.message : 'Permission denied.',
    };
  }

  if (orgId !== activeOrgId) {
    return {
      success: false,
      error: 'Requested organisation does not match the active organisation.',
    };
  }

  const supabase = await createClient();

  const rows = SEED_BANK_ACCOUNTS.map((a) => ({
    organisation_id: activeOrgId,
    workspace_id: activeOrgId,
    name: a.name,
    account_type: 'current',
    currency: a.currency,
    status: 'active',
    is_active: true,
  }));

  const { error } = await supabase
    .from('bank_accounts')
    .upsert(rows, {
      onConflict: 'organisation_id,name',
      ignoreDuplicates: true,
    });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, error: null };
}
