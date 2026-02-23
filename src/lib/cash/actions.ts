'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getActiveOrg } from '@/lib/org';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { assertWriteAllowed } from '@/lib/demo';
import { invalidateOrgReportCache } from '@/lib/cache';
import { logAuditEvent } from '@/lib/audit';
import { isDateInLockedPeriod } from '@/lib/periods/actions';
import type {
  CashCollectionRow,
  CashCollectionDetail,
  CashCollectionLineRow,
  CashSpendRow,
  CashDepositRow,
  CashDashboard,
  CashMovementEntry,
} from './types';

/* ================================================================== */
/*  CASH-IN-HAND ACCOUNT MANAGEMENT                                    */
/* ================================================================== */

/**
 * Ensures a Cash-in-Hand system account exists for the org.
 * Auto-creates on first use with code AST-CIH.
 */
export async function ensureCashInHandAccount(
  orgId: string
): Promise<{ accountId: string | null; error: string | null }> {
  const admin = createAdminClient();

  // Check org settings first
  const { data: settings } = await admin
    .from('organisation_settings')
    .select('cash_in_hand_account_id')
    .eq('organisation_id', orgId)
    .single();

  if (settings?.cash_in_hand_account_id) {
    return { accountId: settings.cash_in_hand_account_id, error: null };
  }

  // Check by system_account marker
  const { data: existing } = await admin
    .from('accounts')
    .select('id')
    .eq('organisation_id', orgId)
    .eq('system_account', 'cash_in_hand')
    .single();

  if (existing) {
    // Store in settings for fast lookup
    await admin
      .from('organisation_settings')
      .update({ cash_in_hand_account_id: existing.id })
      .eq('organisation_id', orgId);
    return { accountId: existing.id, error: null };
  }

  // Auto-create
  const { data: created, error: createErr } = await admin
    .from('accounts')
    .insert({
      organisation_id: orgId,
      code: 'AST-CIH',
      name: 'Cash-in-Hand',
      type: 'asset',
      system_account: 'cash_in_hand',
      reporting_category: 'Cash',
      is_active: true,
    })
    .select('id')
    .single();

  if (createErr || !created) {
    return { accountId: null, error: createErr?.message ?? 'Failed to create Cash-in-Hand account.' };
  }

  // Store in settings
  await admin
    .from('organisation_settings')
    .update({ cash_in_hand_account_id: created.id })
    .eq('organisation_id', orgId);

  return { accountId: created.id, error: null };
}

/**
 * Get Cash-in-Hand balance from journal_lines.
 * For asset accounts: balance = sum(debit) - sum(credit).
 */
export async function getCashInHandBalance(
  orgId: string
): Promise<number> {
  const { accountId } = await ensureCashInHandAccount(orgId);
  if (!accountId) return 0;

  const supabase = await createClient();
  const { data } = await supabase
    .from('journal_lines')
    .select('debit_pence, credit_pence')
    .eq('organisation_id', orgId)
    .eq('account_id', accountId);

  let balance = 0;
  for (const line of data ?? []) {
    balance += Number(line.debit_pence) - Number(line.credit_pence);
  }
  return balance;
}

/* ================================================================== */
/*  DASHBOARD                                                          */
/* ================================================================== */

export async function getCashDashboard(
  orgId: string
): Promise<{ data: CashDashboard | null; error: string | null }> {
  const supabase = await createClient();

  const cashInHandPence = await getCashInHandBalance(orgId);

  // Total collected (posted + banked)
  const { data: collections } = await supabase
    .from('cash_collections')
    .select('total_amount_pence, status, counter_1_confirmed, counter_2_confirmed')
    .eq('organisation_id', orgId)
    .in('status', ['posted', 'banked']);

  let totalCollectedPence = 0;
  for (const c of collections ?? []) {
    totalCollectedPence += Number(c.total_amount_pence);
  }

  // Total spent (posted)
  const { data: spends } = await supabase
    .from('cash_spends')
    .select('amount_pence')
    .eq('organisation_id', orgId)
    .eq('status', 'posted');

  let totalSpentPence = 0;
  for (const s of spends ?? []) {
    totalSpentPence += Number(s.amount_pence);
  }

  // Unbanked (posted but not banked)
  const { data: unbanked } = await supabase
    .from('cash_collections')
    .select('total_amount_pence')
    .eq('organisation_id', orgId)
    .eq('status', 'posted');

  let unbankedPence = 0;
  for (const u of unbanked ?? []) {
    unbankedPence += Number(u.total_amount_pence);
  }

  // Draft collections count
  const { data: drafts } = await supabase
    .from('cash_collections')
    .select('id')
    .eq('organisation_id', orgId)
    .eq('status', 'draft');

  // Missing signatures
  const { data: missingSignatures } = await supabase
    .from('cash_collections')
    .select('id')
    .eq('organisation_id', orgId)
    .eq('status', 'draft')
    .or('counter_1_confirmed.eq.false,counter_2_confirmed.eq.false');

  return {
    data: {
      cashInHandPence,
      totalCollectedPence,
      totalSpentPence,
      unbankedPence,
      draftCollections: drafts?.length ?? 0,
      missingSignatures: missingSignatures?.length ?? 0,
    },
    error: null,
  };
}

/* ================================================================== */
/*  CASH COLLECTIONS                                                   */
/* ================================================================== */

export async function listCashCollections(
  orgId: string
): Promise<{ data: CashCollectionRow[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('cash_collections')
    .select('id, collected_date, service_name, total_amount_pence, counted_by_name_1, counted_by_name_2, counter_1_confirmed, counter_2_confirmed, status, posted_transaction_id, banked_at, notes, created_at')
    .eq('organisation_id', orgId)
    .order('collected_date', { ascending: false });

  if (error) return { data: [], error: error.message };

  return {
    data: (data ?? []).map((c) => ({
      id: c.id,
      collected_date: c.collected_date,
      service_name: c.service_name,
      total_amount_pence: Number(c.total_amount_pence),
      counted_by_name_1: c.counted_by_name_1,
      counted_by_name_2: c.counted_by_name_2,
      counter_1_confirmed: c.counter_1_confirmed,
      counter_2_confirmed: c.counter_2_confirmed,
      status: c.status as 'draft' | 'posted' | 'banked',
      posted_transaction_id: c.posted_transaction_id,
      banked_at: c.banked_at,
      notes: c.notes,
      created_at: c.created_at,
    })),
    error: null,
  };
}

export async function getCashCollection(
  collectionId: string
): Promise<{ data: CashCollectionDetail | null; error: string | null }> {
  const supabase = await createClient();

  const { data: c, error: cErr } = await supabase
    .from('cash_collections')
    .select('*')
    .eq('id', collectionId)
    .single();

  if (cErr || !c) return { data: null, error: cErr?.message ?? 'Not found.' };

  const { data: lines } = await supabase
    .from('cash_collection_lines')
    .select('id, fund_id, income_account_id, amount_pence, donor_id, gift_aid_eligible, funds(name), accounts:income_account_id(name), donors(full_name)')
    .eq('cash_collection_id', collectionId);

  const lineRows: CashCollectionLineRow[] = (lines ?? []).map((l) => {
    const fund = l.funds as unknown as { name: string } | null;
    const account = l.accounts as unknown as { name: string } | null;
    const donor = l.donors as unknown as { full_name: string } | null;
    return {
      id: l.id,
      fund_id: l.fund_id,
      fund_name: fund?.name ?? 'Unknown',
      income_account_id: l.income_account_id,
      income_account_name: account?.name ?? 'Unknown',
      amount_pence: Number(l.amount_pence),
      donor_id: l.donor_id,
      donor_name: donor?.full_name ?? null,
      gift_aid_eligible: l.gift_aid_eligible,
    };
  });

  return {
    data: {
      id: c.id,
      collected_date: c.collected_date,
      service_name: c.service_name,
      total_amount_pence: Number(c.total_amount_pence),
      counted_by_name_1: c.counted_by_name_1,
      counted_by_name_2: c.counted_by_name_2,
      counter_1_confirmed: c.counter_1_confirmed,
      counter_2_confirmed: c.counter_2_confirmed,
      status: c.status as 'draft' | 'posted' | 'banked',
      posted_transaction_id: c.posted_transaction_id,
      banked_at: c.banked_at,
      notes: c.notes,
      created_at: c.created_at,
      lines: lineRows,
    },
    error: null,
  };
}

interface CollectionLineInput {
  fund_id: string;
  income_account_id: string;
  amount_pence: number;
  donor_id?: string | null;
  gift_aid_eligible?: boolean;
}

export async function createCashCollection(params: {
  collectedDate: string;
  serviceName: string;
  totalAmountPence: number;
  countedByName1: string;
  countedByName2: string;
  counter1Confirmed: boolean;
  counter2Confirmed: boolean;
  notes?: string;
  lines: CollectionLineInput[];
}): Promise<{ data: { id: string } | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'create', 'cash'); }
  catch (e) { return { data: null, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  // Validate lines sum
  const lineSum = params.lines.reduce((s, l) => s + l.amount_pence, 0);
  if (lineSum !== params.totalAmountPence) {
    return { data: null, error: `Lines total (${lineSum}) does not match collection total (${params.totalAmountPence}).` };
  }

  if (params.lines.length === 0) {
    return { data: null, error: 'At least one line is required.' };
  }

  const supabase = await createClient();

  const { data: collection, error: insertErr } = await supabase
    .from('cash_collections')
    .insert({
      organisation_id: orgId,
      collected_date: params.collectedDate,
      service_name: params.serviceName,
      total_amount_pence: params.totalAmountPence,
      counted_by_name_1: params.countedByName1,
      counted_by_name_2: params.countedByName2,
      counter_1_confirmed: params.counter1Confirmed,
      counter_2_confirmed: params.counter2Confirmed,
      notes: params.notes || null,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (insertErr || !collection) {
    return { data: null, error: insertErr?.message ?? 'Failed to create collection.' };
  }

  // Insert lines
  const lineRows = params.lines.map((l) => ({
    cash_collection_id: collection.id,
    fund_id: l.fund_id,
    income_account_id: l.income_account_id,
    amount_pence: l.amount_pence,
    donor_id: l.donor_id || null,
    gift_aid_eligible: l.gift_aid_eligible ?? false,
  }));

  const { error: linesErr } = await supabase
    .from('cash_collection_lines')
    .insert(lineRows);

  if (linesErr) {
    await supabase.from('cash_collections').delete().eq('id', collection.id);
    return { data: null, error: linesErr.message };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'create_cash_collection',
    entityType: 'cash_collection',
    entityId: collection.id,
  });

  return { data: { id: collection.id }, error: null };
}

export async function postCashCollection(
  collectionId: string
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'cash'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();

  // Fetch collection
  const { data: c } = await supabase
    .from('cash_collections')
    .select('id, collected_date, service_name, total_amount_pence, status, counter_1_confirmed, counter_2_confirmed, organisation_id')
    .eq('id', collectionId)
    .single();

  if (!c) return { success: false, error: 'Collection not found.' };
  if (c.status !== 'draft') return { success: false, error: 'Only draft collections can be posted.' };
  if (!c.counter_1_confirmed || !c.counter_2_confirmed) {
    return { success: false, error: 'Both counters must confirm before posting.' };
  }

  // Period lock
  const locked = await isDateInLockedPeriod(c.collected_date);
  if (locked) return { success: false, error: 'Collection date falls in a locked financial period.' };

  // Get Cash-in-Hand account
  const { accountId: cashAccountId, error: cashErr } = await ensureCashInHandAccount(orgId);
  if (!cashAccountId) return { success: false, error: cashErr ?? 'Cash-in-Hand account not found.' };

  // Fetch lines
  const { data: lines } = await supabase
    .from('cash_collection_lines')
    .select('fund_id, income_account_id, amount_pence')
    .eq('cash_collection_id', collectionId);

  if (!lines || lines.length === 0) {
    return { success: false, error: 'Collection has no lines.' };
  }

  const admin = createAdminClient();
  const memo = `Cash collection: ${c.service_name}`;

  // Create journal
  const { data: journal, error: journalErr } = await admin
    .from('journals')
    .insert({
      organisation_id: orgId,
      journal_date: c.collected_date,
      memo,
      status: 'draft',
      source_type: 'cash_collection',
      source_id: collectionId,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (journalErr || !journal) {
    return { success: false, error: journalErr?.message ?? 'Failed to create journal.' };
  }

  // Build journal lines: per collection line, Debit Cash-in-Hand + Credit Income
  const jRows = lines.flatMap((l) => [
    {
      journal_id: journal.id,
      organisation_id: orgId,
      account_id: cashAccountId,
      fund_id: l.fund_id,
      description: memo,
      debit_pence: Number(l.amount_pence),
      credit_pence: 0,
    },
    {
      journal_id: journal.id,
      organisation_id: orgId,
      account_id: l.income_account_id,
      fund_id: l.fund_id,
      description: memo,
      debit_pence: 0,
      credit_pence: Number(l.amount_pence),
    },
  ]);

  const { error: jlErr } = await admin.from('journal_lines').insert(jRows);
  if (jlErr) {
    await admin.from('journals').delete().eq('id', journal.id);
    return { success: false, error: jlErr.message };
  }

  // Post journal
  await admin
    .from('journals')
    .update({ status: 'posted', posted_at: new Date().toISOString() })
    .eq('id', journal.id);

  // Update collection
  await admin
    .from('cash_collections')
    .update({ status: 'posted', posted_transaction_id: journal.id })
    .eq('id', collectionId);

  invalidateOrgReportCache(orgId);

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'post_cash_collection',
    entityType: 'cash_collection',
    entityId: collectionId,
  });

  return { success: true, error: null };
}

/* ================================================================== */
/*  CASH SPENDS                                                        */
/* ================================================================== */

export async function listCashSpends(
  orgId: string
): Promise<{ data: CashSpendRow[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('cash_spends')
    .select('id, spend_date, paid_to, spent_by, description, receipt_url, fund_id, expense_account_id, amount_pence, status, posted_transaction_id, created_at, funds(name), accounts:expense_account_id(name)')
    .eq('organisation_id', orgId)
    .order('spend_date', { ascending: false });

  if (error) return { data: [], error: error.message };

  return {
    data: (data ?? []).map((s) => {
      const fund = s.funds as unknown as { name: string } | null;
      const account = s.accounts as unknown as { name: string } | null;
      return {
        id: s.id,
        spend_date: s.spend_date,
        paid_to: s.paid_to,
        spent_by: s.spent_by,
        description: s.description,
        receipt_url: s.receipt_url,
        fund_id: s.fund_id,
        fund_name: fund?.name ?? 'Unknown',
        expense_account_id: s.expense_account_id,
        expense_account_name: account?.name ?? 'Unknown',
        amount_pence: Number(s.amount_pence),
        status: s.status as 'draft' | 'posted',
        posted_transaction_id: s.posted_transaction_id,
        created_at: s.created_at,
      };
    }),
    error: null,
  };
}

export async function createCashSpend(params: {
  spendDate: string;
  paidTo: string;
  spentBy: string;
  description: string;
  fundId: string;
  expenseAccountId: string;
  amountPence: number;
  receiptUrl?: string;
}): Promise<{ data: { id: string } | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'create', 'cash'); }
  catch (e) { return { data: null, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  if (params.amountPence <= 0) {
    return { data: null, error: 'Amount must be positive.' };
  }

  const supabase = await createClient();

  const { data: spend, error: insertErr } = await supabase
    .from('cash_spends')
    .insert({
      organisation_id: orgId,
      spend_date: params.spendDate,
      paid_to: params.paidTo,
      spent_by: params.spentBy,
      description: params.description,
      fund_id: params.fundId,
      expense_account_id: params.expenseAccountId,
      amount_pence: params.amountPence,
      receipt_url: params.receiptUrl || null,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (insertErr || !spend) {
    return { data: null, error: insertErr?.message ?? 'Failed to create spend.' };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'create_cash_spend',
    entityType: 'cash_spend',
    entityId: spend.id,
  });

  return { data: { id: spend.id }, error: null };
}

export async function postCashSpend(
  spendId: string,
  adminOverride: boolean = false,
): Promise<{ success: boolean; error: string | null; balanceWarning?: boolean }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'cash'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();

  const { data: spend } = await supabase
    .from('cash_spends')
    .select('id, spend_date, paid_to, description, fund_id, expense_account_id, amount_pence, status, organisation_id')
    .eq('id', spendId)
    .single();

  if (!spend) return { success: false, error: 'Spend not found.' };
  if (spend.status !== 'draft') return { success: false, error: 'Only draft spends can be posted.' };

  // Period lock
  const locked = await isDateInLockedPeriod(spend.spend_date);
  if (locked) return { success: false, error: 'Spend date falls in a locked financial period.' };

  // Cash-in-Hand balance check
  const { accountId: cashAccountId, error: cashErr } = await ensureCashInHandAccount(orgId);
  if (!cashAccountId) return { success: false, error: cashErr ?? 'Cash-in-Hand account not found.' };

  const currentBalance = await getCashInHandBalance(orgId);
  const spendAmount = Number(spend.amount_pence);
  const afterBalance = currentBalance - spendAmount;

  if (afterBalance < 0) {
    const isAdmin = role === 'admin';
    if (!isAdmin) {
      return {
        success: false,
        error: `Insufficient Cash-in-Hand. Current balance: £${(currentBalance / 100).toFixed(2)}. This spend would make it negative.`,
        balanceWarning: true,
      };
    }
    if (!adminOverride) {
      return {
        success: false,
        error: `Warning: Cash-in-Hand will go negative (£${(afterBalance / 100).toFixed(2)}). Use admin override to continue.`,
        balanceWarning: true,
      };
    }
  }

  const admin = createAdminClient();
  const memo = `Cash spend: ${spend.paid_to} - ${spend.description}`;

  const { data: journal, error: journalErr } = await admin
    .from('journals')
    .insert({
      organisation_id: orgId,
      journal_date: spend.spend_date,
      memo,
      status: 'draft',
      source_type: 'cash_spend',
      source_id: spendId,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (journalErr || !journal) {
    return { success: false, error: journalErr?.message ?? 'Failed to create journal.' };
  }

  const jRows = [
    {
      journal_id: journal.id,
      organisation_id: orgId,
      account_id: spend.expense_account_id,
      fund_id: spend.fund_id,
      description: memo,
      debit_pence: spendAmount,
      credit_pence: 0,
    },
    {
      journal_id: journal.id,
      organisation_id: orgId,
      account_id: cashAccountId,
      fund_id: spend.fund_id,
      description: memo,
      debit_pence: 0,
      credit_pence: spendAmount,
    },
  ];

  const { error: jlErr } = await admin.from('journal_lines').insert(jRows);
  if (jlErr) {
    await admin.from('journals').delete().eq('id', journal.id);
    return { success: false, error: jlErr.message };
  }

  await admin
    .from('journals')
    .update({ status: 'posted', posted_at: new Date().toISOString() })
    .eq('id', journal.id);

  await admin
    .from('cash_spends')
    .update({ status: 'posted', posted_transaction_id: journal.id })
    .eq('id', spendId);

  invalidateOrgReportCache(orgId);

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'post_cash_spend',
    entityType: 'cash_spend',
    entityId: spendId,
  });

  return { success: true, error: null };
}

/** Upload a receipt to Supabase Storage. */
export async function uploadCashReceipt(
  formData: FormData,
  spendId: string
): Promise<{ url: string | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId } = await getActiveOrg();

  const file = formData.get('file') as File | null;
  if (!file) return { url: null, error: 'No file provided.' };

  const supabase = await createClient();
  const ext = file.name.split('.').pop() ?? 'pdf';
  const path = `${orgId}/${spendId}/${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from('cash-receipts')
    .upload(path, file, { upsert: false });

  if (uploadErr) return { url: null, error: uploadErr.message };

  const { data: urlData } = supabase.storage.from('cash-receipts').getPublicUrl(path);
  const url = urlData?.publicUrl ?? null;

  // Update spend record
  if (url) {
    await supabase
      .from('cash_spends')
      .update({ receipt_url: url })
      .eq('id', spendId);
  }

  return { url, error: null };
}

/* ================================================================== */
/*  CASH DEPOSITS                                                      */
/* ================================================================== */

export async function getUnbankedCollections(
  orgId: string
): Promise<{ data: CashCollectionRow[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('cash_collections')
    .select('id, collected_date, service_name, total_amount_pence, counted_by_name_1, counted_by_name_2, counter_1_confirmed, counter_2_confirmed, status, posted_transaction_id, banked_at, notes, created_at')
    .eq('organisation_id', orgId)
    .eq('status', 'posted')
    .order('collected_date', { ascending: true });

  if (error) return { data: [], error: error.message };

  return {
    data: (data ?? []).map((c) => ({
      id: c.id,
      collected_date: c.collected_date,
      service_name: c.service_name,
      total_amount_pence: Number(c.total_amount_pence),
      counted_by_name_1: c.counted_by_name_1,
      counted_by_name_2: c.counted_by_name_2,
      counter_1_confirmed: c.counter_1_confirmed,
      counter_2_confirmed: c.counter_2_confirmed,
      status: 'posted' as const,
      posted_transaction_id: c.posted_transaction_id,
      banked_at: c.banked_at,
      notes: c.notes,
      created_at: c.created_at,
    })),
    error: null,
  };
}

export async function listCashDeposits(
  orgId: string
): Promise<{ data: CashDepositRow[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('cash_deposits')
    .select('id, bank_account_id, deposit_date, total_amount_pence, status, posted_transaction_id, created_at, bank_accounts(name)')
    .eq('organisation_id', orgId)
    .order('deposit_date', { ascending: false });

  if (error) return { data: [], error: error.message };

  // Count collections per deposit
  const depositIds = (data ?? []).map((d) => d.id);
  let collectionCounts: Record<string, number> = {};
  if (depositIds.length > 0) {
    const { data: junctions } = await supabase
      .from('cash_deposit_collections')
      .select('deposit_id')
      .in('deposit_id', depositIds);
    for (const j of junctions ?? []) {
      collectionCounts[j.deposit_id] = (collectionCounts[j.deposit_id] ?? 0) + 1;
    }
  }

  return {
    data: (data ?? []).map((d) => {
      const bank = d.bank_accounts as unknown as { name: string } | null;
      return {
        id: d.id,
        bank_account_id: d.bank_account_id,
        bank_account_name: bank?.name ?? 'Unknown',
        deposit_date: d.deposit_date,
        total_amount_pence: Number(d.total_amount_pence),
        status: d.status as 'draft' | 'posted' | 'matched',
        posted_transaction_id: d.posted_transaction_id,
        created_at: d.created_at,
        collection_count: collectionCounts[d.id] ?? 0,
      };
    }),
    error: null,
  };
}

export async function createCashDeposit(params: {
  bankAccountId: string;
  depositDate: string;
  collectionIds: string[];
}): Promise<{ data: { id: string } | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'create', 'cash'); }
  catch (e) { return { data: null, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  if (params.collectionIds.length === 0) {
    return { data: null, error: 'Select at least one collection to deposit.' };
  }

  const supabase = await createClient();

  // Verify all collections are posted (not banked)
  const { data: collections } = await supabase
    .from('cash_collections')
    .select('id, total_amount_pence, status')
    .in('id', params.collectionIds)
    .eq('organisation_id', orgId);

  if (!collections || collections.length !== params.collectionIds.length) {
    return { data: null, error: 'Some collections not found or do not belong to this organisation.' };
  }

  for (const c of collections) {
    if (c.status !== 'posted') {
      return { data: null, error: `Collection ${c.id.slice(0, 8)} is not in posted status.` };
    }
  }

  const totalPence = collections.reduce((s, c) => s + Number(c.total_amount_pence), 0);

  const { data: deposit, error: insertErr } = await supabase
    .from('cash_deposits')
    .insert({
      organisation_id: orgId,
      bank_account_id: params.bankAccountId,
      deposit_date: params.depositDate,
      total_amount_pence: totalPence,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (insertErr || !deposit) {
    return { data: null, error: insertErr?.message ?? 'Failed to create deposit.' };
  }

  // Insert junction rows
  const junctionRows = params.collectionIds.map((cid) => ({
    deposit_id: deposit.id,
    cash_collection_id: cid,
  }));

  const { error: jErr } = await supabase
    .from('cash_deposit_collections')
    .insert(junctionRows);

  if (jErr) {
    await supabase.from('cash_deposits').delete().eq('id', deposit.id);
    return { data: null, error: jErr.message };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'create_cash_deposit',
    entityType: 'cash_deposit',
    entityId: deposit.id,
  });

  return { data: { id: deposit.id }, error: null };
}

export async function postCashDeposit(
  depositId: string
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'cash'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();

  const { data: deposit } = await supabase
    .from('cash_deposits')
    .select('id, bank_account_id, deposit_date, total_amount_pence, status, organisation_id')
    .eq('id', depositId)
    .single();

  if (!deposit) return { success: false, error: 'Deposit not found.' };
  if (deposit.status !== 'draft') return { success: false, error: 'Only draft deposits can be posted.' };

  const locked = await isDateInLockedPeriod(deposit.deposit_date);
  if (locked) return { success: false, error: 'Deposit date falls in a locked financial period.' };

  // Get Cash-in-Hand account
  const { accountId: cashAccountId, error: cashErr } = await ensureCashInHandAccount(orgId);
  if (!cashAccountId) return { success: false, error: cashErr ?? 'Cash-in-Hand account not found.' };

  // Get bank account's linked GL account
  const { data: bankAccount } = await supabase
    .from('bank_accounts')
    .select('linked_account_id, name')
    .eq('id', deposit.bank_account_id)
    .single();

  if (!bankAccount?.linked_account_id) {
    return { success: false, error: 'Bank account has no linked GL account. Configure it in Banking settings.' };
  }

  const admin = createAdminClient();
  const depositAmount = Number(deposit.total_amount_pence);
  const memo = `Cash deposit to ${bankAccount.name}`;

  const { data: journal, error: journalErr } = await admin
    .from('journals')
    .insert({
      organisation_id: orgId,
      journal_date: deposit.deposit_date,
      memo,
      status: 'draft',
      source_type: 'cash_deposit',
      source_id: depositId,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (journalErr || !journal) {
    return { success: false, error: journalErr?.message ?? 'Failed to create journal.' };
  }

  const jRows = [
    {
      journal_id: journal.id,
      organisation_id: orgId,
      account_id: bankAccount.linked_account_id,
      fund_id: null,
      description: memo,
      debit_pence: depositAmount,
      credit_pence: 0,
    },
    {
      journal_id: journal.id,
      organisation_id: orgId,
      account_id: cashAccountId,
      fund_id: null,
      description: memo,
      debit_pence: 0,
      credit_pence: depositAmount,
    },
  ];

  const { error: jlErr } = await admin.from('journal_lines').insert(jRows);
  if (jlErr) {
    await admin.from('journals').delete().eq('id', journal.id);
    return { success: false, error: jlErr.message };
  }

  await admin
    .from('journals')
    .update({ status: 'posted', posted_at: new Date().toISOString() })
    .eq('id', journal.id);

  await admin
    .from('cash_deposits')
    .update({ status: 'posted', posted_transaction_id: journal.id })
    .eq('id', depositId);

  // Mark linked collections as banked
  const { data: junctions } = await supabase
    .from('cash_deposit_collections')
    .select('cash_collection_id')
    .eq('deposit_id', depositId);

  const collectionIds = (junctions ?? []).map((j) => j.cash_collection_id);
  if (collectionIds.length > 0) {
    await admin
      .from('cash_collections')
      .update({ status: 'banked', banked_at: new Date().toISOString() })
      .in('id', collectionIds);
  }

  invalidateOrgReportCache(orgId);

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'post_cash_deposit',
    entityType: 'cash_deposit',
    entityId: depositId,
  });

  return { success: true, error: null };
}

/* ================================================================== */
/*  CASH MOVEMENT LEDGER                                               */
/* ================================================================== */

export async function getCashMovementLedger(
  orgId: string
): Promise<{ data: CashMovementEntry[]; error: string | null }> {
  const supabase = await createClient();

  // Fetch all posted/banked collections
  const { data: collections } = await supabase
    .from('cash_collections')
    .select('id, collected_date, service_name, total_amount_pence, status, posted_transaction_id')
    .eq('organisation_id', orgId)
    .in('status', ['posted', 'banked'])
    .order('collected_date', { ascending: true });

  // Fetch all posted spends
  const { data: spends } = await supabase
    .from('cash_spends')
    .select('id, spend_date, paid_to, description, amount_pence, status, posted_transaction_id')
    .eq('organisation_id', orgId)
    .eq('status', 'posted')
    .order('spend_date', { ascending: true });

  // Fetch all posted deposits
  const { data: deposits } = await supabase
    .from('cash_deposits')
    .select('id, deposit_date, total_amount_pence, status, posted_transaction_id, bank_accounts(name)')
    .eq('organisation_id', orgId)
    .in('status', ['posted', 'matched'])
    .order('deposit_date', { ascending: true });

  // Combine into entries
  const entries: CashMovementEntry[] = [];

  for (const c of collections ?? []) {
    entries.push({
      id: c.id,
      date: c.collected_date,
      type: 'collection',
      description: `Collection: ${c.service_name}`,
      amountPence: Number(c.total_amount_pence),
      runningBalancePence: 0,
      status: c.status,
      journalId: c.posted_transaction_id,
    });
  }

  for (const s of spends ?? []) {
    entries.push({
      id: s.id,
      date: s.spend_date,
      type: 'spend',
      description: `Spend: ${s.paid_to} - ${s.description}`,
      amountPence: -Number(s.amount_pence),
      runningBalancePence: 0,
      status: s.status,
      journalId: s.posted_transaction_id,
    });
  }

  for (const d of deposits ?? []) {
    const bank = d.bank_accounts as unknown as { name: string } | null;
    entries.push({
      id: d.id,
      date: d.deposit_date,
      type: 'deposit',
      description: `Deposit to ${bank?.name ?? 'bank'}`,
      amountPence: -Number(d.total_amount_pence),
      runningBalancePence: 0,
      status: d.status,
      journalId: d.posted_transaction_id,
    });
  }

  // Sort by date, then by type (collections first for same date)
  entries.sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    if (cmp !== 0) return cmp;
    const order = { collection: 0, spend: 1, deposit: 2 };
    return order[a.type] - order[b.type];
  });

  // Compute running balance
  let balance = 0;
  for (const e of entries) {
    balance += e.amountPence;
    e.runningBalancePence = balance;
  }

  return { data: entries, error: null };
}
