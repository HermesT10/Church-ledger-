'use server';

import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { assertWriteAllowed } from '@/lib/demo';
import { invalidateOrgReportCache } from '@/lib/cache';
import { isDateInLockedPeriod } from '@/lib/periods/actions';
import type {
  BankAccountWithStats,
  BankAccountStats,
  BankLineWithAllocation,
  PaginatedBankLines,
  AllocationDisplay,
} from './types';

/* ------------------------------------------------------------------ */
/*  Bank Account — list with stats                                     */
/* ------------------------------------------------------------------ */

export async function listBankAccountsWithStats(): Promise<{
  data: BankAccountWithStats[];
  error: string | null;
}> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const { data: accounts, error: accErr } = await supabase
    .from('bank_accounts')
    .select('*')
    .eq('organisation_id', orgId)
    .eq('is_active', true)
    .order('name');

  if (accErr || !accounts) {
    return { data: [], error: accErr?.message ?? 'Failed to fetch bank accounts.' };
  }

  if (accounts.length === 0) return { data: [], error: null };

  const accountIds = accounts.map((a) => a.id);

  // Fetch line counts + allocation status per account
  const { data: allLines } = await supabase
    .from('bank_lines')
    .select('id, bank_account_id, allocated, amount_pence, balance_pence, txn_date')
    .in('bank_account_id', accountIds)
    .order('txn_date', { ascending: false });

  // Aggregate per account
  const statsMap = new Map<string, {
    total: number;
    unallocated: number;
    latestBalance: number | null;
  }>();

  for (const line of allLines ?? []) {
    const existing = statsMap.get(line.bank_account_id);
    if (!existing) {
      statsMap.set(line.bank_account_id, {
        total: 1,
        unallocated: line.allocated ? 0 : 1,
        latestBalance: line.balance_pence != null ? Number(line.balance_pence) : null,
      });
    } else {
      existing.total += 1;
      if (!line.allocated) existing.unallocated += 1;
    }
  }

  const withStats: BankAccountWithStats[] = accounts.map((a) => {
    const s = statsMap.get(a.id);
    return {
      ...a,
      total_lines: s?.total ?? 0,
      unallocated_count: s?.unallocated ?? 0,
      latest_balance_pence: s?.latestBalance ?? null,
    };
  });

  return { data: withStats, error: null };
}

/* ------------------------------------------------------------------ */
/*  Bank Account — single with stats                                   */
/* ------------------------------------------------------------------ */

export async function getBankAccountStats(
  bankAccountId: string,
): Promise<{ data: BankAccountStats | null; error: string | null }> {
  const supabase = await createClient();

  const { data: lines, error } = await supabase
    .from('bank_lines')
    .select('id, amount_pence, balance_pence, allocated, txn_date')
    .eq('bank_account_id', bankAccountId)
    .order('txn_date', { ascending: false });

  if (error) return { data: null, error: error.message };

  const allLines = lines ?? [];
  const totalLines = allLines.length;
  const allocatedCount = allLines.filter((l) => l.allocated).length;
  const unallocatedCount = totalLines - allocatedCount;
  const unallocatedAmountPence = allLines
    .filter((l) => !l.allocated)
    .reduce((sum, l) => sum + Math.abs(Number(l.amount_pence)), 0);

  // Latest balance: first line (ordered desc by date)
  const latestBalance = allLines.length > 0 && allLines[0].balance_pence != null
    ? Number(allLines[0].balance_pence)
    : null;

  return {
    data: {
      currentBalancePence: latestBalance,
      totalLines,
      allocatedCount,
      unallocatedCount,
      unallocatedAmountPence,
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  Bank Lines — paginated with filters                                */
/* ------------------------------------------------------------------ */

export async function getBankLines(params: {
  bankAccountId: string;
  page?: number;
  pageSize?: number;
  filter?: 'all' | 'allocated' | 'unallocated';
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}): Promise<{ data: PaginatedBankLines; error: string | null }> {
  const {
    bankAccountId,
    page = 1,
    pageSize = 50,
    filter = 'all',
    dateFrom,
    dateTo,
    search,
  } = params;

  const supabase = await createClient();
  const offset = (page - 1) * pageSize;

  // Build base query for counting
  let countQuery = supabase
    .from('bank_lines')
    .select('id', { count: 'exact', head: true })
    .eq('bank_account_id', bankAccountId);

  // Build data query
  let dataQuery = supabase
    .from('bank_lines')
    .select('*')
    .eq('bank_account_id', bankAccountId)
    .order('txn_date', { ascending: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  // Apply filters to both queries
  if (filter === 'allocated') {
    countQuery = countQuery.eq('allocated', true);
    dataQuery = dataQuery.eq('allocated', true);
  } else if (filter === 'unallocated') {
    countQuery = countQuery.eq('allocated', false);
    dataQuery = dataQuery.eq('allocated', false);
  }

  if (dateFrom) {
    countQuery = countQuery.gte('txn_date', dateFrom);
    dataQuery = dataQuery.gte('txn_date', dateFrom);
  }
  if (dateTo) {
    countQuery = countQuery.lte('txn_date', dateTo);
    dataQuery = dataQuery.lte('txn_date', dateTo);
  }

  if (search) {
    const pattern = `%${search}%`;
    countQuery = countQuery.or(`description.ilike.${pattern},reference.ilike.${pattern}`);
    dataQuery = dataQuery.or(`description.ilike.${pattern},reference.ilike.${pattern}`);
  }

  const [{ count }, { data: lines, error: linesErr }] = await Promise.all([
    countQuery,
    dataQuery,
  ]);

  if (linesErr) {
    return {
      data: { lines: [], total: 0, page, pageSize, totalPages: 0 },
      error: linesErr.message,
    };
  }

  const total = count ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  // Fetch allocations for these lines
  const lineIds = (lines ?? []).map((l) => l.id);
  let allocationMap = new Map<string, {
    id: string;
    organisation_id: string;
    bank_line_id: string;
    account_id: string;
    fund_id: string;
    supplier_id: string | null;
    amount_pence: number;
    created_by: string | null;
    created_at: string;
  }>();

  if (lineIds.length > 0) {
    const { data: allocations } = await supabase
      .from('allocations')
      .select('*')
      .in('bank_line_id', lineIds);

    for (const a of allocations ?? []) {
      allocationMap.set(a.bank_line_id, {
        id: a.id,
        organisation_id: a.organisation_id,
        bank_line_id: a.bank_line_id,
        account_id: a.account_id,
        fund_id: a.fund_id,
        supplier_id: a.supplier_id ?? null,
        amount_pence: Number(a.amount_pence),
        created_by: a.created_by,
        created_at: a.created_at,
      });
    }
  }

  const linesWithAlloc: BankLineWithAllocation[] = (lines ?? []).map((l) => ({
    id: l.id,
    organisation_id: l.organisation_id,
    bank_account_id: l.bank_account_id,
    txn_date: l.txn_date,
    description: l.description,
    reference: l.reference,
    amount_pence: Number(l.amount_pence),
    balance_pence: l.balance_pence != null ? Number(l.balance_pence) : null,
    fingerprint: l.fingerprint,
    raw: l.raw,
    allocated: l.allocated ?? false,
    reconciled: l.reconciled ?? false,
    reconciled_at: l.reconciled_at,
    created_by: l.created_by,
    created_at: l.created_at,
    allocation: allocationMap.get(l.id) ?? null,
  }));

  return {
    data: { lines: linesWithAlloc, total, page, pageSize, totalPages },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  Allocate a bank line                                               */
/* ------------------------------------------------------------------ */

export async function allocateBankLine(params: {
  bankLineId: string;
  accountId: string;
  fundId: string;
  supplierId?: string | null;
}): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { bankLineId, accountId, fundId, supplierId } = params;
  const { user, role, orgId } = await getActiveOrg();

  try {
    assertCanPerform(role, 'create', 'banking');
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const supabase = await createClient();

  // Validate bank line belongs to org and is not already allocated
  const { data: bl, error: blErr } = await supabase
    .from('bank_lines')
    .select('id, organisation_id, bank_account_id, allocated, amount_pence, txn_date, description')
    .eq('id', bankLineId)
    .single();

  if (blErr || !bl) {
    return { success: false, error: 'Bank line not found.' };
  }

  if (bl.organisation_id !== orgId) {
    return { success: false, error: 'Bank line does not belong to this organisation.' };
  }

  if (bl.allocated) {
    return { success: false, error: 'This bank line is already allocated.' };
  }

  // Validate account is active
  const { data: account } = await supabase
    .from('accounts')
    .select('id, is_active')
    .eq('id', accountId)
    .eq('organisation_id', orgId)
    .single();

  if (!account) {
    return { success: false, error: 'Account not found.' };
  }
  if (!account.is_active) {
    return { success: false, error: 'Cannot allocate to an inactive account.' };
  }

  // Validate fund is active
  const { data: fund } = await supabase
    .from('funds')
    .select('id, is_active')
    .eq('id', fundId)
    .eq('organisation_id', orgId)
    .single();

  if (!fund) {
    return { success: false, error: 'Fund not found.' };
  }
  if (!fund.is_active) {
    return { success: false, error: 'Cannot allocate to an inactive fund.' };
  }

  // Validate supplier if provided
  if (supplierId) {
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('id, is_active')
      .eq('id', supplierId)
      .eq('organisation_id', orgId)
      .single();

    if (!supplier) {
      return { success: false, error: 'Supplier not found.' };
    }
    if (!supplier.is_active) {
      return { success: false, error: 'Cannot tag to an inactive supplier.' };
    }
  }

  // Fetch bank account to get linked GL account
  const { data: bankAccount } = await supabase
    .from('bank_accounts')
    .select('id, linked_account_id, name')
    .eq('id', bl.bank_account_id)
    .single();

  const linkedAccountId = bankAccount?.linked_account_id;
  const bankAccountName = bankAccount?.name ?? 'Bank';

  const amountPence = Math.abs(Number(bl.amount_pence));
  const isIncome = Number(bl.amount_pence) > 0;

  // Insert allocation
  const { error: allocErr } = await supabase
    .from('allocations')
    .insert({
      organisation_id: orgId,
      bank_line_id: bankLineId,
      account_id: accountId,
      fund_id: fundId,
      supplier_id: supplierId || null,
      amount_pence: Number(bl.amount_pence),
      created_by: user.id,
    });

  if (allocErr) {
    if (allocErr.message.includes('unique') || allocErr.message.includes('duplicate')) {
      return { success: false, error: 'This bank line is already allocated.' };
    }
    return { success: false, error: allocErr.message };
  }

  // Create GL journal entry if bank account has a linked GL account
  if (linkedAccountId) {
    const txnDate = bl.txn_date ?? new Date().toISOString().slice(0, 10);
    const desc = bl.description ?? '';

    // Period lock check
    const periodLocked = await isDateInLockedPeriod(txnDate);
    if (periodLocked) {
      return { success: false, error: 'Cannot allocate: the transaction date falls in a locked financial period.' };
    }

    // Create auto-posted journal
    const { data: journal, error: journalErr } = await supabase
      .from('journals')
      .insert({
        organisation_id: orgId,
        journal_date: txnDate,
        memo: `Bank allocation: ${desc}`.slice(0, 255),
        reference: `BANK-${bankLineId.slice(0, 8).toUpperCase()}`,
        status: 'posted',
        source_type: 'bank',
        source_id: bankLineId,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (!journalErr && journal) {
      // Build balanced journal lines
      // Income (positive): Dr Bank, Cr Account
      // Expense (negative): Dr Account, Cr Bank
      const lines = isIncome
        ? [
            {
              journal_id: journal.id,
              organisation_id: orgId,
              account_id: linkedAccountId,
              fund_id: fundId,
              supplier_id: null as string | null,
              description: `${bankAccountName} deposit`,
              debit_pence: amountPence,
              credit_pence: 0,
            },
            {
              journal_id: journal.id,
              organisation_id: orgId,
              account_id: accountId,
              fund_id: fundId,
              supplier_id: supplierId || null,
              description: desc || 'Bank income allocation',
              debit_pence: 0,
              credit_pence: amountPence,
            },
          ]
        : [
            {
              journal_id: journal.id,
              organisation_id: orgId,
              account_id: accountId,
              fund_id: fundId,
              supplier_id: supplierId || null,
              description: desc || 'Bank expense allocation',
              debit_pence: amountPence,
              credit_pence: 0,
            },
            {
              journal_id: journal.id,
              organisation_id: orgId,
              account_id: linkedAccountId,
              fund_id: fundId,
              supplier_id: null as string | null,
              description: `${bankAccountName} payment`,
              debit_pence: 0,
              credit_pence: amountPence,
            },
          ];

      await supabase.from('journal_lines').insert(lines);
      invalidateOrgReportCache(orgId);
    }
  }

  // Mark bank line as allocated
  const { error: updateErr } = await supabase
    .from('bank_lines')
    .update({ allocated: true })
    .eq('id', bankLineId);

  if (updateErr) {
    return { success: false, error: `Allocation created but failed to update status: ${updateErr.message}` };
  }

  return { success: true, error: null };
}

/* ------------------------------------------------------------------ */
/*  Deallocate a bank line                                             */
/* ------------------------------------------------------------------ */

export async function deallocateBankLine(
  bankLineId: string,
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { role, orgId } = await getActiveOrg();

  try {
    assertCanPerform(role, 'delete', 'banking');
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const supabase = await createClient();

  // Find and delete the associated GL journal (source_type='bank', source_id=bankLineId)
  const { data: linkedJournal } = await supabase
    .from('journals')
    .select('id')
    .eq('source_type', 'bank')
    .eq('source_id', bankLineId)
    .eq('organisation_id', orgId)
    .maybeSingle();

  if (linkedJournal) {
    // Delete journal lines first, then journal
    await supabase.from('journal_lines').delete().eq('journal_id', linkedJournal.id);
    await supabase.from('journals').delete().eq('id', linkedJournal.id);
    invalidateOrgReportCache(orgId);
  }

  // Delete allocation
  const { error: delErr } = await supabase
    .from('allocations')
    .delete()
    .eq('bank_line_id', bankLineId)
    .eq('organisation_id', orgId);

  if (delErr) {
    return { success: false, error: delErr.message };
  }

  // Mark bank line as unallocated
  const { error: updateErr } = await supabase
    .from('bank_lines')
    .update({ allocated: false })
    .eq('id', bankLineId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  return { success: true, error: null };
}

/* ------------------------------------------------------------------ */
/*  Update bank account                                                */
/* ------------------------------------------------------------------ */

export async function updateBankAccount(
  bankAccountId: string,
  payload: {
    name?: string;
    account_number_last4?: string | null;
    sort_code?: string | null;
    is_active?: boolean;
    linked_account_id?: string | null;
  },
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { role, orgId } = await getActiveOrg();

  try {
    assertCanPerform(role, 'update', 'banking');
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const supabase = await createClient();

  const updates: Record<string, unknown> = {};
  if (payload.name !== undefined) updates.name = payload.name.trim();
  if (payload.account_number_last4 !== undefined) updates.account_number_last4 = payload.account_number_last4;
  if (payload.sort_code !== undefined) updates.sort_code = payload.sort_code;
  if (payload.is_active !== undefined) updates.is_active = payload.is_active;
  if (payload.linked_account_id !== undefined) updates.linked_account_id = payload.linked_account_id;

  if (Object.keys(updates).length === 0) {
    return { success: true, error: null };
  }

  const { error } = await supabase
    .from('bank_accounts')
    .update(updates)
    .eq('id', bankAccountId)
    .eq('organisation_id', orgId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, error: null };
}

/* ------------------------------------------------------------------ */
/*  Get allocation display (with account + fund names)                 */
/* ------------------------------------------------------------------ */

export async function getAllocationForLine(
  bankLineId: string,
): Promise<{ data: AllocationDisplay | null; error: string | null }> {
  const supabase = await createClient();

  const { data: alloc, error } = await supabase
    .from('allocations')
    .select('*')
    .eq('bank_line_id', bankLineId)
    .single();

  if (error || !alloc) return { data: null, error: null };

  // Fetch names
  const [{ data: account }, { data: fund }] = await Promise.all([
    supabase.from('accounts').select('name').eq('id', alloc.account_id).single(),
    supabase.from('funds').select('name').eq('id', alloc.fund_id).single(),
  ]);

  let supplierName: string | null = null;
  if (alloc.supplier_id) {
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('name')
      .eq('id', alloc.supplier_id)
      .single();
    supplierName = supplier?.name ?? null;
  }

  return {
    data: {
      id: alloc.id,
      organisation_id: alloc.organisation_id,
      bank_line_id: alloc.bank_line_id,
      account_id: alloc.account_id,
      fund_id: alloc.fund_id,
      supplier_id: alloc.supplier_id ?? null,
      amount_pence: Number(alloc.amount_pence),
      created_by: alloc.created_by,
      created_at: alloc.created_at,
      account_name: account?.name ?? 'Unknown',
      fund_name: fund?.name ?? 'Unknown',
      supplier_name: supplierName,
    },
    error: null,
  };
}
