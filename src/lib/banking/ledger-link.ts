'use server';

import { randomUUID } from 'node:crypto';
import { logAuditEvent } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabase/admin';
import type { BankLedgerAccountSummary, BankLedgerLinkStatus, BankLedgerLinkValidation } from './ledger-link.types';

type BankAccountRow = {
  id: string;
  organisation_id: string;
  workspace_id?: string | null;
  name: string;
  linked_account_id: string | null;
};

type AccountRow = {
  id: string;
  organisation_id: string;
  code: string | null;
  name: string;
  type: string;
  subtype: string | null;
  is_active: boolean | null;
  is_archived?: boolean | null;
  archived_at?: string | null;
};

const BANK_COMPATIBLE_SUBTYPES = new Set([
  'bank',
  'cash',
  'current',
  'current_account',
  'savings',
  'savings_account',
  'clearing',
]);

function normalizeName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function isValidLedgerAccount(account: AccountRow | null | undefined, orgId: string): boolean {
  if (!account) return false;
  if (account.organisation_id !== orgId) return false;
  if (account.type !== 'asset') return false;
  if (account.is_active === false) return false;
  if (account.is_archived === true) return false;
  if (account.archived_at) return false;
  if (account.subtype && !BANK_COMPATIBLE_SUBTYPES.has(account.subtype.toLowerCase())) return false;
  return true;
}

function toSummary(account: AccountRow): BankLedgerAccountSummary {
  return {
    id: account.id,
    code: account.code,
    name: account.name,
    type: account.type,
    subtype: account.subtype,
  };
}

function linkMessage(status: BankLedgerLinkStatus) {
  if (status === 'missing') {
    return 'This bank account must be linked to a Chart of Accounts bank account before transactions can be reconciled and posted.';
  }
  if (status === 'invalid') {
    return 'The linked Chart of Accounts record is missing, archived, inactive, from another organisation, or not an asset account.';
  }
  return 'Bank account is linked to a valid Chart of Accounts asset account.';
}

export async function validateBankLedgerLink(
  bankAccountId: string,
  orgId: string,
): Promise<BankLedgerLinkValidation> {
  const admin = createAdminClient();
  const { data: bankAccount, error: bankError } = await admin
    .from('bank_accounts')
    .select('id, organisation_id, workspace_id, name, linked_account_id')
    .eq('id', bankAccountId)
    .eq('organisation_id', orgId)
    .maybeSingle();

  if (bankError || !bankAccount) {
    return {
      status: 'invalid',
      code: 'BANK_ACCOUNT_LEDGER_LINK_INVALID',
      message: bankError?.message ?? 'Bank account not found.',
      bankAccountId,
      linkedAccountId: null,
      account: null,
    };
  }

  const row = bankAccount as BankAccountRow;
  if (!row.linked_account_id) {
    return {
      status: 'missing',
      code: 'BANK_ACCOUNT_LEDGER_LINK_MISSING',
      message: linkMessage('missing'),
      bankAccountId: row.id,
      linkedAccountId: null,
      account: null,
    };
  }

  const { data: account } = await admin
    .from('accounts')
    .select('id, organisation_id, code, name, type, subtype, is_active, is_archived, archived_at')
    .eq('id', row.linked_account_id)
    .maybeSingle();

  if (!isValidLedgerAccount(account as AccountRow | null, orgId)) {
    return {
      status: 'invalid',
      code: 'BANK_ACCOUNT_LEDGER_LINK_INVALID',
      message: linkMessage('invalid'),
      bankAccountId: row.id,
      linkedAccountId: row.linked_account_id,
      account: account ? toSummary(account as AccountRow) : null,
    };
  }

  return {
    status: 'linked',
    code: 'BANK_ACCOUNT_LEDGER_LINKED',
    message: linkMessage('linked'),
    bankAccountId: row.id,
    linkedAccountId: row.linked_account_id,
    account: toSummary(account as AccountRow),
  };
}

export async function createBankLedgerAccountForName(params: {
  orgId: string;
  bankAccountName: string;
  userId: string;
  sourceBankAccountId?: string | null;
}): Promise<{ account: BankLedgerAccountSummary | null; error: string | null }> {
  const admin = createAdminClient();
  const code = `BANK-${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;
  const { data, error } = await admin
    .from('accounts')
    .insert({
      organisation_id: params.orgId,
      code,
      name: params.bankAccountName,
      type: 'asset',
      subtype: 'bank',
      is_active: true,
      normal_balance: 'debit',
      allow_direct_posting: true,
      available_in_reconciliation: true,
      created_by: params.userId,
    })
    .select('id, organisation_id, code, name, type, subtype, is_active, is_archived, archived_at')
    .single();

  if (error || !data) {
    return { account: null, error: error?.message ?? 'Could not create linked ledger account.' };
  }

  await logAuditEvent({
    orgId: params.orgId,
    userId: params.userId,
    action: 'bank_ledger_link_auto_created',
    entityType: 'account',
    entityId: data.id,
    metadata: {
      bankAccountId: params.sourceBankAccountId ?? null,
      bankAccountName: params.bankAccountName,
      code,
    },
  });

  return { account: toSummary(data as AccountRow), error: null };
}

async function findReusableLedgerAccount(orgId: string, bankAccountName: string): Promise<BankLedgerAccountSummary | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('accounts')
    .select('id, organisation_id, code, name, type, subtype, is_active, is_archived, archived_at')
    .eq('organisation_id', orgId)
    .eq('type', 'asset')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(200);

  const target = normalizeName(bankAccountName);
  const match = (data ?? []).find((account) => {
    const row = account as AccountRow;
    return isValidLedgerAccount(row, orgId) && normalizeName(row.name) === target;
  });

  return match ? toSummary(match as AccountRow) : null;
}

export async function ensureBankLedgerAccount(params: {
  bankAccountId: string;
  orgId: string;
  userId: string;
}): Promise<{ validation: BankLedgerLinkValidation | null; error: string | null }> {
  const current = await validateBankLedgerLink(params.bankAccountId, params.orgId);
  if (current.status === 'linked') return { validation: current, error: null };

  const admin = createAdminClient();
  const { data: bankAccount, error: bankError } = await admin
    .from('bank_accounts')
    .select('id, organisation_id, name, linked_account_id')
    .eq('id', params.bankAccountId)
    .eq('organisation_id', params.orgId)
    .maybeSingle();

  if (bankError || !bankAccount) {
    return { validation: null, error: bankError?.message ?? 'Bank account not found.' };
  }

  const bank = bankAccount as BankAccountRow;
  const reusable = await findReusableLedgerAccount(params.orgId, bank.name);
  const account = reusable ?? (await createBankLedgerAccountForName({
    orgId: params.orgId,
    bankAccountName: bank.name,
    userId: params.userId,
    sourceBankAccountId: bank.id,
  })).account;

  if (!account) return { validation: null, error: 'Could not create or find a valid ledger account.' };

  const { error: updateError } = await admin
    .from('bank_accounts')
    .update({ linked_account_id: account.id })
    .eq('id', bank.id)
    .eq('organisation_id', params.orgId);

  if (updateError) return { validation: null, error: updateError.message };

  await logAuditEvent({
    orgId: params.orgId,
    userId: params.userId,
    action: current.status === 'missing' ? 'bank_ledger_link_repaired' : 'bank_ledger_link_changed',
    entityType: 'bank_account',
    entityId: bank.id,
    metadata: {
      previousLinkedAccountId: bank.linked_account_id,
      linkedAccountId: account.id,
      reusedExisting: Boolean(reusable),
      previousStatus: current.status,
    },
  });

  return { validation: await validateBankLedgerLink(bank.id, params.orgId), error: null };
}

export async function linkExistingBankLedgerAccount(params: {
  bankAccountId: string;
  accountId: string;
  orgId: string;
  userId: string;
}): Promise<{ validation: BankLedgerLinkValidation | null; error: string | null }> {
  const admin = createAdminClient();
  const [{ data: bankAccount }, { data: account }] = await Promise.all([
    admin
      .from('bank_accounts')
      .select('id, organisation_id, name, linked_account_id')
      .eq('id', params.bankAccountId)
      .eq('organisation_id', params.orgId)
      .maybeSingle(),
    admin
      .from('accounts')
      .select('id, organisation_id, code, name, type, subtype, is_active, is_archived, archived_at')
      .eq('id', params.accountId)
      .maybeSingle(),
  ]);

  if (!bankAccount) return { validation: null, error: 'Bank account not found.' };
  if (!isValidLedgerAccount(account as AccountRow | null, params.orgId)) {
    return { validation: null, error: 'Select an active same-organisation asset bank/cash account.' };
  }

  const bank = bankAccount as BankAccountRow;
  const { error } = await admin
    .from('bank_accounts')
    .update({ linked_account_id: params.accountId })
    .eq('id', params.bankAccountId)
    .eq('organisation_id', params.orgId);

  if (error) return { validation: null, error: error.message };

  await logAuditEvent({
    orgId: params.orgId,
    userId: params.userId,
    action: bank.linked_account_id ? 'bank_ledger_link_changed' : 'bank_ledger_link_repaired',
    entityType: 'bank_account',
    entityId: params.bankAccountId,
    metadata: {
      previousLinkedAccountId: bank.linked_account_id,
      linkedAccountId: params.accountId,
    },
  });

  return { validation: await validateBankLedgerLink(params.bankAccountId, params.orgId), error: null };
}
