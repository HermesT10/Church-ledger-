'use server';

import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { assertWriteAllowed } from '@/lib/demo';
import type {
  FundRow,
  FundType,
  FundWithStats,
  FundAccountBreakdown,
  FundTransaction,
  FundDetailStats,
} from './types';

/* ================================================================== */
/*  Read operations                                                    */
/* ================================================================== */

/**
 * Fetch all funds with balance stats and optional period income/expense.
 * Uses server-side RPC for performance with 50k+ journal lines.
 */
export async function getFundsWithStats(options?: {
  type?: FundType;
  activeOnly?: boolean;
  startDate?: string;
  endDate?: string;
}): Promise<{ data: FundWithStats[]; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  let query = supabase
    .from('funds')
    .select('*')
    .eq('organisation_id', orgId)
    .order('type')
    .order('name');

  if (options?.type) {
    query = query.eq('type', options.type);
  }

  if (options?.activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data: funds, error: fundsErr } = await query;

  if (fundsErr || !funds) {
    return { data: [], error: fundsErr?.message ?? 'Failed to fetch funds.' };
  }

  if (funds.length === 0) {
    return { data: [], error: null };
  }

  // Fetch overall balance stats via RPC (all-time, posted only)
  const { data: balanceRows } = await supabase.rpc('get_fund_balance_stats', {
    p_org_id: orgId,
  });

  const balanceMap = new Map<string, { debit: number; credit: number; count: number }>();
  for (const row of balanceRows ?? []) {
    balanceMap.set(row.fund_id, {
      debit: Number(row.total_debit_pence),
      credit: Number(row.total_credit_pence),
      count: Number(row.line_count),
    });
  }

  // Fetch period stats if date range provided
  const periodMap = new Map<string, { income: number; expense: number }>();

  if (options?.startDate && options?.endDate) {
    const { data: periodRows } = await supabase.rpc('get_fund_period_stats', {
      p_org_id: orgId,
      p_start_date: options.startDate,
      p_end_date: options.endDate,
    });

    for (const row of periodRows ?? []) {
      const fundId = row.fund_id;
      if (!periodMap.has(fundId)) {
        periodMap.set(fundId, { income: 0, expense: 0 });
      }
      const entry = periodMap.get(fundId)!;
      const accType = row.account_type;

      if (accType === 'income') {
        // Income: credit side is the income amount
        entry.income += Number(row.total_credit_pence) - Number(row.total_debit_pence);
      } else if (accType === 'expense') {
        // Expense: debit side is the expense amount
        entry.expense += Number(row.total_debit_pence) - Number(row.total_credit_pence);
      }
    }
  }

  const withStats: FundWithStats[] = funds.map((f) => {
    const bal = balanceMap.get(f.id);
    const period = periodMap.get(f.id);
    const balancePence = bal ? bal.debit - bal.credit : 0;
    const incomePence = period?.income ?? 0;
    const expensePence = period?.expense ?? 0;

    return {
      ...f,
      transaction_count: bal?.count ?? 0,
      balance_pence: balancePence,
      income_pence: incomePence,
      expense_pence: expensePence,
      net_movement_pence: incomePence - expensePence,
    };
  });

  return { data: withStats, error: null };
}

/**
 * Fetch all funds (lightweight, no stats) for dropdown selectors.
 */
export async function getFundsList(options?: {
  type?: FundType;
  activeOnly?: boolean;
}): Promise<FundRow[]> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  let query = supabase
    .from('funds')
    .select('*')
    .eq('organisation_id', orgId)
    .order('type')
    .order('name');

  if (options?.type) {
    query = query.eq('type', options.type);
  }

  if (options?.activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data } = await query;
  return (data ?? []) as FundRow[];
}

/**
 * Fetch a single fund by ID.
 */
export async function getFund(id: string): Promise<FundRow | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('funds')
    .select('*')
    .eq('id', id)
    .single();

  return data as FundRow | null;
}

/**
 * Check if a fund has linked transactions (journal_lines, bill_lines, donations).
 */
export async function hasLinkedTransactions(fundId: string): Promise<boolean> {
  const supabase = await createClient();

  const { count: journalCount } = await supabase
    .from('journal_lines')
    .select('id', { count: 'exact', head: true })
    .eq('fund_id', fundId);

  if (journalCount && journalCount > 0) return true;

  const { count: billCount } = await supabase
    .from('bill_lines')
    .select('id', { count: 'exact', head: true })
    .eq('fund_id', fundId);

  if (billCount && billCount > 0) return true;

  const { count: donationCount } = await supabase
    .from('donations')
    .select('id', { count: 'exact', head: true })
    .eq('fund_id', fundId);

  if (donationCount && donationCount > 0) return true;

  return false;
}

/* ================================================================== */
/*  Fund Detail (drill-down)                                           */
/* ================================================================== */

/**
 * Compute opening/closing balance and income/expense stats for a fund
 * over a given period.
 */
export async function getFundDetailStats(
  fundId: string,
  startDate: string,
  endDate: string,
): Promise<{ data: FundDetailStats | null; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  // Opening balance: sum of all movements BEFORE startDate
  const dayBeforeStart = new Date(startDate);
  dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);
  const openingEnd = dayBeforeStart.toISOString().slice(0, 10);

  const { data: openingRows } = await supabase.rpc('get_fund_period_stats', {
    p_org_id: orgId,
    p_start_date: '1900-01-01',
    p_end_date: openingEnd,
  });

  let openingBalance = 0;
  for (const row of openingRows ?? []) {
    if (row.fund_id !== fundId) continue;
    openingBalance += Number(row.total_debit_pence) - Number(row.total_credit_pence);
  }

  // Period stats
  const { data: periodRows } = await supabase.rpc('get_fund_period_stats', {
    p_org_id: orgId,
    p_start_date: startDate,
    p_end_date: endDate,
  });

  let incomePence = 0;
  let expensePence = 0;

  for (const row of periodRows ?? []) {
    if (row.fund_id !== fundId) continue;
    if (row.account_type === 'income') {
      incomePence += Number(row.total_credit_pence) - Number(row.total_debit_pence);
    } else if (row.account_type === 'expense') {
      expensePence += Number(row.total_debit_pence) - Number(row.total_credit_pence);
    }
  }

  const netMovement = incomePence - expensePence;

  // Compute all-movements net for closing (not just income/expense)
  let periodAllNet = 0;
  for (const row of periodRows ?? []) {
    if (row.fund_id !== fundId) continue;
    periodAllNet += Number(row.total_debit_pence) - Number(row.total_credit_pence);
  }

  return {
    data: {
      opening_balance_pence: openingBalance,
      income_pence: incomePence,
      expense_pence: expensePence,
      net_movement_pence: netMovement,
      closing_balance_pence: openingBalance + periodAllNet,
    },
    error: null,
  };
}

/**
 * Get income/expense breakdown by account for a fund.
 */
export async function getFundAccountBreakdown(
  fundId: string,
  startDate: string,
  endDate: string,
): Promise<{ data: FundAccountBreakdown[]; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('get_fund_account_breakdown', {
    p_org_id: orgId,
    p_fund_id: fundId,
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (error) return { data: [], error: error.message };

  const rows: FundAccountBreakdown[] = (data ?? []).map((r: Record<string, unknown>) => {
    const accType = r.account_type as string;
    const debit = Number(r.total_debit_pence);
    const credit = Number(r.total_credit_pence);
    const netPence = accType === 'income'
      ? credit - debit
      : debit - credit;

    return {
      account_id: r.account_id as string,
      account_code: r.account_code as string,
      account_name: r.account_name as string,
      account_type: accType,
      total_debit_pence: debit,
      total_credit_pence: credit,
      net_pence: netPence,
      line_count: Number(r.line_count),
    };
  });

  return { data: rows, error: null };
}

/**
 * Get paginated transactions for a fund.
 */
export async function getFundTransactions(
  fundId: string,
  startDate: string,
  endDate: string,
  page: number = 1,
  pageSize: number = 50,
): Promise<{ data: FundTransaction[]; total: number; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  // Count total
  const { data: countData } = await supabase
    .from('journal_lines')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', orgId)
    .eq('fund_id', fundId);

  const offset = (page - 1) * pageSize;

  const { data, error } = await supabase.rpc('get_fund_transactions', {
    p_org_id: orgId,
    p_fund_id: fundId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_limit: pageSize,
    p_offset: offset,
  });

  if (error) return { data: [], total: 0, error: error.message };

  const rows: FundTransaction[] = (data ?? []).map((r: Record<string, unknown>) => ({
    journal_line_id: r.journal_line_id as string,
    journal_id: r.journal_id as string,
    journal_date: r.journal_date as string,
    journal_memo: (r.journal_memo as string) ?? null,
    account_code: r.account_code as string,
    account_name: r.account_name as string,
    account_type: r.account_type as string,
    description: (r.description as string) ?? null,
    debit_pence: Number(r.debit_pence),
    credit_pence: Number(r.credit_pence),
  }));

  // Get actual count for period (use countData or estimate)
  const total = countData as unknown as number ?? rows.length;

  return { data: rows, total: typeof total === 'number' ? total : rows.length, error: null };
}

/* ================================================================== */
/*  Write operations                                                   */
/* ================================================================== */

export async function createFund(formData: FormData) {
  await assertWriteAllowed();
  const { orgId } = await getActiveOrg();

  const name = (formData.get('name') as string)?.trim();
  const type = formData.get('type') as string;
  const purposeText = (formData.get('purpose_text') as string)?.trim() || null;
  const reportingGroup = (formData.get('reporting_group') as string)?.trim() || null;

  if (!name || !type) {
    redirect('/funds/new?error=' + encodeURIComponent('Name and type are required.'));
  }

  const supabase = await createClient();

  const { error } = await supabase.from('funds').insert({
    organisation_id: orgId,
    name,
    type,
    purpose_text: purposeText,
    reporting_group: reportingGroup,
  });

  if (error) {
    redirect('/funds/new?error=' + encodeURIComponent(error.message));
  }

  redirect('/funds');
}

export async function updateFund(formData: FormData) {
  await assertWriteAllowed();
  await getActiveOrg();

  const id = formData.get('id') as string;
  const name = (formData.get('name') as string)?.trim();
  const type = formData.get('type') as string;
  const purposeText = (formData.get('purpose_text') as string)?.trim() || null;
  const reportingGroup = (formData.get('reporting_group') as string)?.trim() || null;

  if (!id || !name || !type) {
    redirect(`/funds/${id}?error=` + encodeURIComponent('Name and type are required.'));
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('funds')
    .update({
      name,
      type,
      purpose_text: purposeText,
      reporting_group: reportingGroup,
    })
    .eq('id', id);

  if (error) {
    redirect(`/funds/${id}?error=` + encodeURIComponent(error.message));
  }

  redirect('/funds');
}

export async function archiveFund(formData: FormData) {
  await assertWriteAllowed();
  await getActiveOrg();
  const id = formData.get('id') as string;

  if (!id) redirect('/funds');

  const supabase = await createClient();

  const { error } = await supabase
    .from('funds')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    redirect(`/funds/${id}?error=` + encodeURIComponent(error.message));
  }

  redirect('/funds');
}

export async function unarchiveFund(formData: FormData) {
  await assertWriteAllowed();
  await getActiveOrg();
  const id = formData.get('id') as string;

  if (!id) redirect('/funds');

  const supabase = await createClient();

  const { error } = await supabase
    .from('funds')
    .update({ is_active: true })
    .eq('id', id);

  if (error) {
    redirect(`/funds/${id}?error=` + encodeURIComponent(error.message));
  }

  redirect('/funds');
}

/**
 * Attempt to delete a fund. Fails if transactions reference it.
 */
export async function deleteFund(formData: FormData) {
  await assertWriteAllowed();
  await getActiveOrg();
  const id = formData.get('id') as string;

  if (!id) redirect('/funds');

  const hasLinks = await hasLinkedTransactions(id);
  if (hasLinks) {
    redirect(
      `/funds/${id}/edit?error=` +
        encodeURIComponent(
          'Cannot delete this fund because it has linked transactions. Deactivate it instead.',
        ),
    );
  }

  const supabase = await createClient();

  const { error } = await supabase.from('funds').delete().eq('id', id);

  if (error) {
    redirect(`/funds/${id}/edit?error=` + encodeURIComponent(error.message));
  }

  redirect('/funds');
}
