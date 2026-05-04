'use server';

import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertWriteAllowed } from '@/lib/demo';
import { logAuditEvent } from '@/lib/audit';
import type { AccountRow, AccountType, AccountWithStats } from './types';
import { getPostedAccountNetMap } from './balances';
import { createAccountSchema, mergeAccountsSchema, updateAccountSchema } from './validation';
import { getAccountsForTemplate, type AccountTemplateId } from './templates/starter';

/* ------------------------------------------------------------------ */
/*  Read operations                                                    */
/* ------------------------------------------------------------------ */

export async function getAccountsWithStats(options?: {
  type?: AccountType;
  activeOnly?: boolean;
}): Promise<{ data: AccountWithStats[]; error: string | null }> {
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

  const { data: accounts, error: accErr } = await query;

  if (accErr || !accounts) {
    return { data: [], error: accErr?.message ?? 'Failed to fetch accounts.' };
  }

  if (accounts.length === 0) {
    return { data: [], error: null };
  }

  const accountIds = accounts.map((a) => a.id);
  const nets = await getPostedAccountNetMap(orgId, accountIds);

  const withStats: AccountWithStats[] = accounts.map((a) => {
    const agg = nets.get(a.id) ?? { lineCount: 0, netPence: 0 };
    return {
      ...(a as AccountRow),
      transaction_count: agg.lineCount,
      balance_pence: agg.netPence,
    };
  });

  return { data: withStats, error: null };
}

export async function getAccountsList(options?: {
  type?: AccountType | AccountType[];
  activeOnly?: boolean;
  availableInReconciliation?: boolean;
  availableInDonations?: boolean;
  availableInInvoices?: boolean;
  availableInPayroll?: boolean;
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
    const t = options.type;
    if (Array.isArray(t)) query = query.in('type', t);
    else query = query.eq('type', t);
  }

  if (options?.activeOnly) {
    query = query.eq('is_active', true);
  }

  if (options?.availableInReconciliation === true) {
    query = query.eq('available_in_reconciliation', true);
  }
  if (options?.availableInDonations === true) {
    query = query.eq('available_in_donations', true);
  }
  if (options?.availableInInvoices === true) {
    query = query.eq('available_in_invoices', true);
  }
  if (options?.availableInPayroll === true) {
    query = query.eq('available_in_payroll', true);
  }

  const { data } = await query;
  return (data ?? []) as AccountRow[];
}

export async function getAccount(id: string): Promise<AccountRow | null> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const { data } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', id)
    .eq('organisation_id', orgId)
    .single();

  return data as AccountRow | null;
}

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

  return !!(billCount && billCount > 0);
}

/* ------------------------------------------------------------------ */
/*  Writes                                                             */
/* ------------------------------------------------------------------ */

export async function createAccount(formData: FormData) {
  await assertWriteAllowed();
  const { orgId, user } = await getActiveOrg();
  const supabase = await createClient();

  const parsed = createAccountSchema.safeParse({
    code: formData.get('code'),
    name: formData.get('name'),
    type: formData.get('type'),
    reporting_category: formData.get('reporting_category') || null,
    parent_id: formData.get('parent_id') || null,
    description: formData.get('description') || null,
    subtype: formData.get('subtype') || null,
    normal_balance: formData.get('normal_balance') || null,
  });

  if (!parsed.success) {
    redirect('/accounts/new?error=' + encodeURIComponent(parsed.error.flatten().formErrors.join(' ')));
  }

  const v = parsed.data;
  const { error } = await supabase.from('accounts').insert({
    organisation_id: orgId,
    code: v.code,
    name: v.name,
    type: v.type,
    reporting_category: v.reporting_category,
    parent_id: v.parent_id,
    description: v.description ?? null,
    subtype: v.subtype ?? null,
    normal_balance: v.normal_balance ?? null,
    created_by: user.id,
    available_in_reconciliation:
      formData.get('available_in_reconciliation') === 'on' ||
      formData.get('available_in_reconciliation') === 'true' ||
      formData.get('available_in_reconciliation') == null,
    available_in_donations: formData.get('available_in_donations') === 'on',
    available_in_invoices: formData.get('available_in_invoices') === 'on',
    available_in_payroll: formData.get('available_in_payroll') === 'on',
  });

  if (error) redirect('/accounts/new?error=' + encodeURIComponent(error.message));

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'account_create',
    entityType: 'account',
    metadata: { code: v.code },
  });

  redirect('/accounts');
}

export async function updateAccount(formData: FormData) {
  await assertWriteAllowed();
  const { orgId, user } = await getActiveOrg();

  const parsed = updateAccountSchema.safeParse({
    id: formData.get('id'),
    code: formData.get('code'),
    name: formData.get('name'),
    type: formData.get('type'),
    reporting_category: formData.get('reporting_category') || null,
    parent_id: formData.get('parent_id') || null,
    description: formData.get('description') || null,
    subtype: formData.get('subtype') || null,
    normal_balance: formData.get('normal_balance') || null,
  });

  if (!parsed.success) {
    const id = (formData.get('id') as string) ?? '';
    redirect(`/accounts/${id}?error=` + encodeURIComponent(parsed.error.flatten().formErrors.join(' ')));
  }

  const v = parsed.data;

  const supabase = await createClient();
  const existing = await getAccount(v.id);
  if (!existing || existing.organisation_id !== orgId) {
    redirect('/accounts?error=' + encodeURIComponent('Account not found.'));
  }

  const blocked = await hasLinkedTransactions(v.id);
  const typeChanging = existing.type !== v.type;
  if (existing.is_system_account && typeChanging) {
    redirect(`/accounts/${v.id}?error=` + encodeURIComponent('System account type cannot be changed.'));
  }
  if (blocked && typeChanging) {
    redirect(`/accounts/${v.id}?error=` + encodeURIComponent(
      'Cannot change account type once the account has posted or bill activity.',
    ));
  }

  const { error } = await supabase
    .from('accounts')
    .update({
      code: v.code,
      name: v.name,
      type: v.type,
      reporting_category: v.reporting_category,
      parent_id: v.parent_id,
      description: v.description ?? null,
      subtype: v.subtype ?? null,
      normal_balance: v.normal_balance ?? null,
      available_in_reconciliation: formData.get('available_in_reconciliation') === 'on' || formData.get('available_in_reconciliation') === 'true',
      available_in_donations: formData.get('available_in_donations') === 'on',
      available_in_invoices: formData.get('available_in_invoices') === 'on',
      available_in_payroll: formData.get('available_in_payroll') === 'on',
      default_fund_id: formData.get('default_fund_id') || null,
    })
    .eq('id', v.id)
    .eq('organisation_id', orgId);

  if (error) redirect(`/accounts/${v.id}?error=` + encodeURIComponent(error.message));

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'account_update',
    entityType: 'account',
    entityId: v.id,
    metadata: {
      prev: {
        code: existing.code,
        name: existing.name,
        reporting_category: existing.reporting_category,
      },
    },
  });

  redirect('/accounts');
}

export async function archiveAccount(formData: FormData) {
  await assertWriteAllowed();
  const { orgId, user } = await getActiveOrg();
  const id = formData.get('id') as string;
  if (!id) redirect('/accounts');

  const supabase = await createClient();
  const { error } = await supabase
    .from('accounts')
    .update({
      is_active: false,
      is_archived: true,
      archived_at: new Date().toISOString(),
      archived_by: user.id,
    })
    .eq('id', id)
    .eq('organisation_id', orgId);

  if (error) redirect(`/accounts/${id}?error=` + encodeURIComponent(error.message));

  await logAuditEvent({ orgId, userId: user.id, action: 'account_archive', entityType: 'account', entityId: id });
  redirect('/accounts');
}

export async function unarchiveAccount(formData: FormData) {
  await assertWriteAllowed();
  const { orgId, user } = await getActiveOrg();
  const id = formData.get('id') as string;
  if (!id) redirect('/accounts');

  const supabase = await createClient();
  const { error } = await supabase
    .from('accounts')
    .update({
      is_active: true,
      is_archived: false,
      archived_at: null,
      archived_by: null,
    })
    .eq('id', id)
    .eq('organisation_id', orgId);

  if (error) redirect(`/accounts/${id}?error=` + encodeURIComponent(error.message));

  await logAuditEvent({ orgId, userId: user.id, action: 'account_unarchive', entityType: 'account', entityId: id });
  redirect('/accounts');
}

export async function deleteAccount(formData: FormData) {
  await assertWriteAllowed();
  const id = formData.get('id') as string;
  if (!id) redirect('/accounts');

  const hasLinks = await hasLinkedTransactions(id);
  if (hasLinks) {
    redirect(
      `/accounts/${id}?error=` +
        encodeURIComponent(
          'Cannot delete this account because it has linked transactions. Deactivate or archive instead.',
        ),
    );
  }

  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const { error } = await supabase.from('accounts').delete().eq('id', id).eq('organisation_id', orgId);

  if (error) redirect(`/accounts/${id}?error=` + encodeURIComponent(error.message));

  redirect('/accounts');
}

export async function mergeAccounts(formData: FormData): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { orgId, user } = await getActiveOrg();

  const parsed = mergeAccountsSchema.safeParse({
    fromAccountId: formData.get('from_account_id'),
    toAccountId: formData.get('to_account_id'),
  });
  if (!parsed.success) return { error: parsed.error.flatten().formErrors.join(' ') };

  const fromId = parsed.data.fromAccountId;
  const toId = parsed.data.toAccountId;
  if (fromId === toId) return { error: 'Cannot merge an account into itself.' };

  const a = await getAccount(fromId);
  const b = await getAccount(toId);
  if (!a || !b || a.organisation_id !== orgId || b.organisation_id !== orgId)
    return { error: 'Account not found.' };
  if (a.type !== b.type) return { error: 'Merge only allowed between accounts of the same type.' };
  if (a.is_system_account || b.is_system_account) return { error: 'System accounts cannot be merged.' };

  const admin = createAdminClient();

  await admin.from('journal_lines').update({ account_id: toId }).eq('organisation_id', orgId).eq('account_id', fromId);
  await admin.from('bill_lines').update({ account_id: toId }).eq('account_id', fromId);
  await admin.from('budget_lines').update({ account_id: toId }).eq('organisation_id', orgId).eq('account_id', fromId);

  await admin.from('accounts').delete().eq('id', fromId).eq('organisation_id', orgId);

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'account_merge',
    entityType: 'account',
    entityId: toId,
    metadata: { fromAccountId: fromId, toAccountId: toId },
  });

  return { error: null };
}

/** Idempotent-ish import: skip rows whose code already exists */
export async function importAccountTemplateAction(formData: FormData) {
  const raw = formData.get('template_id') as string;
  const templateId = (raw === 'larger' || raw === 'charity' || raw === 'starter' ? raw : 'starter') as AccountTemplateId;
  const r = await importAccountTemplate(templateId);
  if (r.error) {
    redirect('/accounts?error=' + encodeURIComponent(r.error));
  }
  redirect(`/accounts?imported=${r.created}&skipped=${r.skipped}`);
}

export async function importAccountTemplate(
  templateId: AccountTemplateId,
): Promise<{ created: number; skipped: number; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, user } = await getActiveOrg();
  const supabase = await createClient();

  const rows = getAccountsForTemplate(templateId);
  let created = 0;
  let skipped = 0;

  const { data: existing } = await supabase.from('accounts').select('code').eq('organisation_id', orgId);
  const codes = new Set((existing ?? []).map((e) => (e.code as string).trim().toLowerCase()));

  for (const r of rows) {
    const key = r.code.trim().toLowerCase();
    if (codes.has(key)) {
      skipped++;
      continue;
    }
    const { error } = await supabase.from('accounts').insert({
      organisation_id: orgId,
      code: r.code,
      name: r.name,
      type: r.type as AccountType,
      reporting_category: r.reporting_category,
      subtype: r.subtype ?? null,
      normal_balance:
        r.type === 'asset' || r.type === 'expense' ? 'debit' :
        'credit',
      created_by: user.id,
      available_in_reconciliation: true,
      available_in_donations: r.type === 'income',
      available_in_invoices: r.type === 'expense',
      available_in_payroll: r.type === 'expense' || r.type === 'liability',
    });
    if (error) return { created, skipped, error: error.message };
    codes.add(key);
    created++;
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'account_import_template',
    metadata: { templateId, created, skipped },
  });

  return { created, skipped, error: null };
}
