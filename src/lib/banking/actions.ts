'use server';

import { revalidatePath } from 'next/cache';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { assertWriteAllowed } from '@/lib/demo';
import { invalidateOrgReportCache } from '@/lib/cache';
import { getAppEnv } from '@/lib/env';
import { logServerFailure } from '@/lib/monitoring';
import { logAuditEvent } from '@/lib/audit';
import {
  ensureBankLedgerAccount,
  linkExistingBankLedgerAccount,
  validateBankLedgerLink,
} from './ledger-link';
import {
  DEFAULT_BANK_CARD_THEME,
  isBankCardTheme,
  isSafeHexColour,
} from './cardAppearance';
import type {
  BankAccountWithStats,
  BankAccountStats,
  BankLineWithAllocation,
  PaginatedBankLines,
  AllocationDisplay,
  BankRuleRow,
  BankingAccountDetailData,
  BankingAccountSummary,
  BankingAuditEvent,
  BankingDirectionFilter,
  BankingHubData,
  BankingStatementWarning,
  BankingTransactionStatusFilter,
  MonthlyBankingStat,
} from './types';

function monthStartIso(now = new Date()): string {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  ).toISOString();
}

function daysAgoIso(days: number, now = new Date()): string {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function penceFromPounds(value: number | null | undefined): number | null {
  return value == null ? null : Math.round(Number(value) * 100);
}

function optionalNumber(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
}

function asStatementWarnings(value: unknown): BankingStatementWarning[] {
  return Array.isArray(value) ? (value as BankingStatementWarning[]) : [];
}

function computeDifference(
  statementBalancePence: number | null,
  bookBalancePence: number | null
): number | null {
  if (statementBalancePence == null || bookBalancePence == null) return null;
  return statementBalancePence - bookBalancePence;
}

function maxIsoDate(values: (string | null | undefined)[]): string | null {
  const sorted = values
    .filter((value): value is string => Boolean(value))
    .sort();
  return sorted[sorted.length - 1] ?? null;
}

function sumNullable(values: (number | null | undefined)[]): number | null {
  const present = values.filter((value): value is number => value != null);
  if (present.length === 0) return null;
  return present.reduce((sum, value) => sum + value, 0);
}

function matchedRecordLabel(line: {
  matched_source_type?: string | null;
  matched_source_id?: string | null;
  posted_journal_id?: string | null;
  allocated?: boolean | null;
  reconciled?: boolean | null;
}): string | null {
  if (line.matched_source_type)
    return line.matched_source_type.replaceAll('_', ' ');
  if (line.posted_journal_id) return 'Posted journal';
  if (line.reconciled) return 'Reconciled';
  if (line.allocated) return 'Allocated';
  return null;
}

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
    return {
      data: [],
      error: accErr?.message ?? 'Failed to fetch bank accounts.',
    };
  }

  if (accounts.length === 0) return { data: [], error: null };

  const accountIds = accounts.map((a) => a.id);

  // Fetch line counts + allocation status per account
  const { data: allLines } = await supabase
    .from('bank_lines')
    .select(
      'id, bank_account_id, allocated, amount_pence, balance_pence, txn_date'
    )
    .in('bank_account_id', accountIds)
    .order('txn_date', { ascending: false });

  // Aggregate per account
  const statsMap = new Map<
    string,
    {
      total: number;
      unallocated: number;
      latestBalance: number | null;
    }
  >();

  for (const line of allLines ?? []) {
    const existing = statsMap.get(line.bank_account_id);
    if (!existing) {
      statsMap.set(line.bank_account_id, {
        total: 1,
        unallocated: line.allocated ? 0 : 1,
        latestBalance:
          line.balance_pence != null ? Number(line.balance_pence) : null,
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

async function getBookBalancePence(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  linkedAccountId: string | null
): Promise<number | null> {
  if (!linkedAccountId) return null;
  const { data, error } = await supabase
    .from('journal_lines')
    .select('debit_pence, credit_pence')
    .eq('organisation_id', orgId)
    .eq('account_id', linkedAccountId);

  if (error) return null;
  return (data ?? []).reduce(
    (sum, row) =>
      sum + Number(row.debit_pence ?? 0) - Number(row.credit_pence ?? 0),
    0
  );
}

async function buildAccountSummary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  account: BankAccountWithStats
): Promise<BankingAccountSummary> {
  const [
    latestLineResult,
    unreconciledResult,
    duplicateResult,
    latestImportResult,
    lastReconciledLineResult,
    lastReconciliationResult,
    bookBalancePence,
  ] = await Promise.all([
    supabase
      .from('bank_lines')
      .select('balance_pence, running_balance, txn_date')
      .eq('organisation_id', orgId)
      .eq('bank_account_id', account.id)
      .order('txn_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('bank_lines')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', orgId)
      .eq('bank_account_id', account.id)
      .eq('reconciled', false)
      .not('status', 'in', '("excluded","duplicate")'),
    supabase
      .from('bank_lines')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', orgId)
      .eq('bank_account_id', account.id)
      .eq('status', 'duplicate'),
    supabase
      .from('bank_statement_imports')
      .select(
        'file_name, uploaded_at, imported_at, closing_balance, duplicates_skipped'
      )
      .eq('workspace_id', orgId)
      .eq('bank_account_id', account.id)
      .order('uploaded_at', { ascending: false })
      .limit(1),
    supabase
      .from('bank_lines')
      .select('reconciled_at')
      .eq('organisation_id', orgId)
      .eq('bank_account_id', account.id)
      .not('reconciled_at', 'is', null)
      .order('reconciled_at', { ascending: false })
      .limit(1),
    supabase
      .from('reconciliations')
      .select('reconciled_at, statement_date')
      .eq('organisation_id', orgId)
      .eq('bank_account_id', account.id)
      .order('reconciled_at', { ascending: false, nullsFirst: false })
      .limit(1),
    getBookBalancePence(supabase, orgId, account.linked_account_id),
  ]);

  const latestLine = latestLineResult.data?.[0] ?? null;
  const latestImport = latestImportResult.data?.[0] ?? null;
  const statementBalancePence =
    latestLine?.balance_pence != null
      ? Number(latestLine.balance_pence)
      : penceFromPounds(
          latestLine?.running_balance ?? latestImport?.closing_balance ?? null
        );
  const lastReconciledDate = maxIsoDate([
    lastReconciledLineResult.data?.[0]?.reconciled_at ?? null,
    lastReconciliationResult.data?.[0]?.reconciled_at ?? null,
    lastReconciliationResult.data?.[0]?.statement_date ?? null,
  ]);

  return {
    ...account,
    statement_balance_pence: statementBalancePence,
    book_balance_pence: bookBalancePence,
    difference_pence: computeDifference(
      statementBalancePence,
      bookBalancePence
    ),
    unreconciled_count: unreconciledResult.count ?? account.unallocated_count,
    last_import_at:
      latestImport?.uploaded_at ?? latestImport?.imported_at ?? null,
    last_import_file_name: latestImport?.file_name ?? null,
    last_reconciled_date: lastReconciledDate,
    possible_duplicates:
      (duplicateResult.count ?? 0) +
      Number(latestImport?.duplicates_skipped ?? 0),
  };
}

export async function getBankingHubData(): Promise<{
  data: BankingHubData | null;
  error: string | null;
}> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();
  const { data: accountStats, error } = await listBankAccountsWithStats();
  if (error) return { data: null, error };

  const accounts = await Promise.all(
    accountStats.map((account) => buildAccountSummary(supabase, orgId, account))
  );

  const [
    { count: statementsThisMonth },
    { data: duplicateImports },
    { count: staleImports },
    { count: warningImports },
  ] = await Promise.all([
    supabase
      .from('bank_statement_imports')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', orgId)
      .gte('uploaded_at', monthStartIso()),
    supabase
      .from('bank_statement_imports')
      .select('duplicates_skipped')
      .eq('workspace_id', orgId)
      .gt('duplicates_skipped', 0),
    supabase
      .from('bank_statement_imports')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', orgId)
      .in('status', ['uploaded', 'parsing', 'needs_mapping', 'failed'])
      .lt('uploaded_at', daysAgoIso(7)),
    supabase
      .from('bank_statement_imports')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', orgId)
      .eq('warning_status', 'warning'),
  ]);

  const statementBalance = sumNullable(
    accounts.map((account) => account.statement_balance_pence)
  );
  const bookBalance = sumNullable(
    accounts.map((account) => account.book_balance_pence)
  );
  const duplicateImportCount = (duplicateImports ?? []).reduce(
    (sum, row) => sum + Number(row.duplicates_skipped ?? 0),
    0
  );

  return {
    data: {
      summary: {
        statement_balance_pence: statementBalance,
        book_balance_pence: bookBalance,
        difference_pence: computeDifference(statementBalance, bookBalance),
        unreconciled_transactions: accounts.reduce(
          (sum, account) => sum + account.unreconciled_count,
          0
        ),
        statements_imported_this_month: statementsThisMonth ?? 0,
        stale_bank_imports: staleImports ?? 0,
        possible_duplicates:
          duplicateImportCount +
          accounts.reduce(
            (sum, account) => sum + account.possible_duplicates,
            0
          ),
        last_reconciled_date: maxIsoDate(
          accounts.map((account) => account.last_reconciled_date)
        ),
        month_end_ready:
          accounts.reduce(
            (sum, account) => sum + account.unreconciled_count,
            0
          ) === 0 &&
          (computeDifference(statementBalance, bookBalance) ?? 0) === 0 &&
          (staleImports ?? 0) === 0 &&
          (warningImports ?? 0) === 0,
      },
      accounts,
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  Monthly stats for Banking Dashboard chart                          */
/* ------------------------------------------------------------------ */

export async function getBankingMonthlyStats(
  months = 12
): Promise<{ data: MonthlyBankingStat[]; error: string | null }> {
  const supabase = await createClient();
  const { orgId } = await getActiveOrg();

  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months + 1);
  startDate.setDate(1);
  const startIso = startDate.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('bank_lines')
    .select('transaction_date, money_in, money_out')
    .eq('workspace_id', orgId)
    .gte('transaction_date', startIso)
    .not('status', 'in', '("excluded","duplicate")')
    .order('transaction_date', { ascending: true });

  if (error) return { data: [], error: error.message };

  // Aggregate by month client-side (avoids needing rpc/raw sql in supabase-js)
  const byMonth: Record<string, { money_in: number; money_out: number }> = {};
  for (const row of data ?? []) {
    if (!row.transaction_date) continue;
    const month = row.transaction_date.slice(0, 7); // "YYYY-MM"
    if (!byMonth[month]) byMonth[month] = { money_in: 0, money_out: 0 };
    byMonth[month].money_in += Math.round(Number(row.money_in ?? 0) * 100);
    byMonth[month].money_out += Math.round(Number(row.money_out ?? 0) * 100);
  }

  const stats: MonthlyBankingStat[] = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      money_in_pence: v.money_in,
      money_out_pence: v.money_out,
    }));

  return { data: stats, error: null };
}

/* ------------------------------------------------------------------ */
/*  Recent bank deposits for Banking Dashboard panel                   */
/* ------------------------------------------------------------------ */

export async function getRecentBankDeposits(
  limit = 8
): Promise<{ data: BankLineWithAllocation[]; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const { data: lines, error } = await supabase
    .from('bank_lines')
    .select('*')
    .eq('workspace_id', orgId)
    .gte('amount_pence', 0)
    .not('status', 'in', '("excluded","duplicate")')
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return { data: [], error: error.message };

  const mapped: BankLineWithAllocation[] = (lines ?? []).map((l) => ({
    id: l.id,
    organisation_id: l.organisation_id,
    workspace_id: l.workspace_id,
    bank_account_id: l.bank_account_id,
    statement_import_id: l.statement_import_id,
    txn_date: l.txn_date,
    transaction_date: l.transaction_date,
    transaction_time: l.transaction_time,
    row_number: l.row_number == null ? null : Number(l.row_number),
    description: l.description,
    additional_description: l.additional_description ?? null,
    display_description: l.display_description ?? l.description,
    reference: l.reference,
    amount: l.amount,
    direction: (l.direction as 'in' | 'out' | null) ?? null,
    money_in: l.money_in,
    money_out: l.money_out,
    amount_pence: Number(l.amount_pence ?? 0),
    balance_pence: l.balance_pence != null ? Number(l.balance_pence) : null,
    running_balance: l.running_balance,
    fingerprint: l.fingerprint ?? '',
    raw: l.raw,
    raw_row: l.raw,
    status: l.status,
    matched_source_type: l.matched_source_type ?? null,
    matched_source_id: l.matched_source_id ?? null,
    posted_journal_id: l.posted_journal_id ?? null,
    allocated: l.allocated ?? false,
    reconciled: l.reconciled ?? false,
    reconciled_at: l.reconciled_at,
    reconciled_by: l.reconciled_by,
    created_by: l.created_by,
    created_at: l.created_at,
    updated_at: l.updated_at,
    matched_record_label: null,
    suggested_match_label: null,
    suggested_match_confidence: null,
    suggested_match_reason: null,
    allocation: null,
  }));

  return { data: mapped, error: null };
}

/* ------------------------------------------------------------------ */
/*  Bank Account — single with stats                                   */
/* ------------------------------------------------------------------ */

export async function getBankAccountStats(
  bankAccountId: string
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
  const latestBalance =
    allLines.length > 0 && allLines[0].balance_pence != null
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
  status?: BankingTransactionStatusFilter;
  direction?: BankingDirectionFilter;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  amountMinPence?: number;
  amountMaxPence?: number;
}): Promise<{ data: PaginatedBankLines; error: string | null }> {
  const {
    bankAccountId,
    page = 1,
    pageSize = 50,
    filter = 'all',
    status = 'all',
    direction = 'all',
    dateFrom,
    dateTo,
    search,
    amountMinPence,
    amountMaxPence,
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

  if (status !== 'all') {
    if (status === 'needs_matching') {
      countQuery = countQuery
        .eq('reconciled', false)
        .eq('allocated', false)
        .not('status', 'in', '("excluded","duplicate")');
      dataQuery = dataQuery
        .eq('reconciled', false)
        .eq('allocated', false)
        .not('status', 'in', '("excluded","duplicate")');
    } else if (status === 'reconciled') {
      countQuery = countQuery.eq('reconciled', true);
      dataQuery = dataQuery.eq('reconciled', true);
    } else {
      countQuery = countQuery.eq('status', status);
      dataQuery = dataQuery.eq('status', status);
    }
  }

  if (direction === 'in') {
    countQuery = countQuery.gte('amount_pence', 0);
    dataQuery = dataQuery.gte('amount_pence', 0);
  } else if (direction === 'out') {
    countQuery = countQuery.lt('amount_pence', 0);
    dataQuery = dataQuery.lt('amount_pence', 0);
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
    countQuery = countQuery.or(
      `description.ilike.${pattern},display_description.ilike.${pattern},reference.ilike.${pattern}`
    );
    dataQuery = dataQuery.or(
      `description.ilike.${pattern},display_description.ilike.${pattern},reference.ilike.${pattern}`
    );
  }

  if (amountMinPence != null) {
    countQuery = countQuery.gte('amount_pence', amountMinPence);
    dataQuery = dataQuery.gte('amount_pence', amountMinPence);
  }
  if (amountMaxPence != null) {
    countQuery = countQuery.lte('amount_pence', amountMaxPence);
    dataQuery = dataQuery.lte('amount_pence', amountMaxPence);
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
  const allocationMap = new Map<
    string,
    {
      id: string;
      organisation_id: string;
      bank_line_id: string;
      account_id: string;
      fund_id: string;
      supplier_id: string | null;
      amount_pence: number;
      created_by: string | null;
      created_at: string;
    }
  >();

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
    workspace_id: l.workspace_id,
    bank_account_id: l.bank_account_id,
    statement_import_id: l.statement_import_id,
    txn_date: l.txn_date,
    transaction_date: l.transaction_date,
    transaction_time: l.transaction_time,
    row_number: l.row_number == null ? null : Number(l.row_number),
    description: l.description,
    additional_description: l.additional_description ?? null,
    display_description: l.display_description ?? l.description,
    reference: l.reference,
    amount: l.amount,
    direction: l.direction,
    money_in: l.money_in,
    money_out: l.money_out,
    amount_pence: Number(l.amount_pence),
    balance_pence: l.balance_pence != null ? Number(l.balance_pence) : null,
    running_balance: l.running_balance,
    fingerprint: l.fingerprint,
    raw: l.raw,
    raw_row: l.raw,
    status: l.status,
    matched_source_type: l.matched_source_type,
    matched_source_id: l.matched_source_id,
    posted_journal_id: l.posted_journal_id,
    allocated: l.allocated ?? false,
    reconciled: l.reconciled ?? false,
    reconciled_at: l.reconciled_at,
    reconciled_by: l.reconciled_by,
    created_by: l.created_by,
    created_at: l.created_at,
    updated_at: l.updated_at,
    matched_record_label: matchedRecordLabel(l),
    suggested_match_label: l.matched_source_type ? matchedRecordLabel(l) : null,
    suggested_match_confidence:
      l.status === 'suggested_match' ? 'medium' : null,
    suggested_match_reason: null,
    allocation: allocationMap.get(l.id) ?? null,
  }));

  return {
    data: { lines: linesWithAlloc, total, page, pageSize, totalPages },
    error: null,
  };
}

export async function listBankRules(
  bankAccountId?: string
): Promise<{ data: BankRuleRow[]; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();
  let query = supabase
    .from('bank_rules')
    .select('*')
    .eq('workspace_id', orgId)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false });

  if (bankAccountId) {
    query = query.or(
      `bank_account_id.eq.${bankAccountId},bank_account_id.is.null`
    );
  }

  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as BankRuleRow[], error: null };
}

export async function createBankRule(
  formData: FormData
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanPerform(role, 'create', 'banking');
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof PermissionError ? error.message : 'Permission denied.',
    };
  }

  const name = String(formData.get('name') ?? '').trim();
  const bankAccountId =
    String(formData.get('bank_account_id') ?? '').trim() || null;
  const conditionType = String(formData.get('condition_type') ?? 'contains');
  const conditionValue =
    String(formData.get('condition_value') ?? '').trim() || null;
  const direction = String(formData.get('direction') ?? '').trim() || null;
  const transactionType = String(formData.get('transaction_type') ?? 'other');
  const priorityRaw = Number(formData.get('priority') ?? 100);

  if (!name) return { success: false, error: 'Rule name is required.' };
  if (!conditionValue && !conditionType.startsWith('amount')) {
    return { success: false, error: 'Condition value is required.' };
  }

  const supabase = await createClient();
  const { error, data } = await supabase
    .from('bank_rules')
    .insert({
      workspace_id: orgId,
      bank_account_id: bankAccountId,
      name,
      priority: Number.isFinite(priorityRaw) ? priorityRaw : 100,
      condition_type: conditionType,
      condition_value: conditionValue,
      direction: direction === 'in' || direction === 'out' ? direction : null,
      amount_min: optionalNumber(formData.get('amount_min')),
      amount_max: optionalNumber(formData.get('amount_max')),
      transaction_type: transactionType,
      account_id: String(formData.get('account_id') ?? '').trim() || null,
      fund_id: String(formData.get('fund_id') ?? '').trim() || null,
      auto_apply: false,
      status: 'active',
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };
  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'bank_rule_created',
    entityType: 'bank_rule',
    entityId: data?.id,
    metadata: { bankAccountId, name, conditionType, transactionType },
  });
  revalidatePath('/banking');
  if (bankAccountId) revalidatePath(`/banking/${bankAccountId}`);
  return { success: true, error: null };
}

export async function archiveBankAccount(
  bankAccountId: string
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanPerform(role, 'update', 'banking');
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof PermissionError ? error.message : 'Permission denied.',
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('bank_accounts')
    .update({
      status: 'archived',
      is_active: false,
      is_archived: true,
      archived_at: new Date().toISOString(),
      archived_by: user.id,
    })
    .eq('id', bankAccountId)
    .eq('organisation_id', orgId);

  if (error) return { success: false, error: error.message };
  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'bank_account_archived',
    entityType: 'bank_account',
    entityId: bankAccountId,
  });
  revalidatePath('/banking');
  revalidatePath('/settings');
  return { success: true, error: null };
}

export async function archiveBankAccountFromForm(
  formData: FormData
): Promise<void> {
  const bankAccountId = String(formData.get('bankAccountId') ?? '').trim();
  if (bankAccountId) {
    await archiveBankAccount(bankAccountId);
  }
}

export async function getBankAccountDetailData(
  bankAccountId: string
): Promise<{ data: BankingAccountDetailData | null; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();
  const { data: account, error } = await supabase
    .from('bank_accounts')
    .select('*')
    .eq('id', bankAccountId)
    .eq('organisation_id', orgId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  if (!account) return { data: null, error: 'Bank account not found.' };

  const baseAccount: BankAccountWithStats = {
    ...(account as BankAccountWithStats),
    total_lines: 0,
    unallocated_count: 0,
    latest_balance_pence: null,
  };

  const [
    summary,
    statementsResult,
    certificatesResult,
    rulesResult,
    auditResult,
    reconciledCountResult,
    unreconciledResult,
    linkedValidation,
  ] = await Promise.all([
    buildAccountSummary(supabase, orgId, baseAccount),
    supabase
      .from('bank_statement_imports')
      .select(
        'id, file_name, file_type, status, statement_start_date, statement_end_date, rows_detected, rows_imported, duplicates_skipped, errors_count, uploaded_by, uploaded_at, imported_at, statement_warnings, warning_status'
      )
      .eq('workspace_id', orgId)
      .eq('bank_account_id', bankAccountId)
      .order('uploaded_at', { ascending: false })
      .limit(50),
    supabase
      .from('bank_reconciliation_certificates')
      .select(
        'id, bank_account_id, statement_import_id, statement_period_start, statement_period_end, closing_bank_balance_pence, book_balance_pence, difference_pence, reconciled_transaction_count, unreconciled_exception_count, certificate_number, generated_by, generated_at'
      )
      .eq('workspace_id', orgId)
      .eq('bank_account_id', bankAccountId)
      .order('statement_period_end', { ascending: false })
      .limit(20),
    listBankRules(bankAccountId),
    supabase
      .from('audit_log')
      .select(
        'id, action, entity_type, entity_id, user_id, metadata, created_at'
      )
      .eq('organisation_id', orgId)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('bank_lines')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', orgId)
      .eq('bank_account_id', bankAccountId)
      .eq('reconciled', true),
    getBankLines({
      bankAccountId,
      page: 1,
      pageSize: 10,
      status: 'needs_matching',
    }),
    validateBankLedgerLink(bankAccountId, orgId),
  ]);

  const unreconciledCount = unreconciledResult.data.total;
  const reconciledCount = reconciledCountResult.count ?? 0;
  const totalForProgress = unreconciledCount + reconciledCount;
  const statementIds = (statementsResult.data ?? []).map(
    (statement) => statement.id as string
  );
  const { data: statementLineRows } =
    statementIds.length > 0
      ? await supabase
          .from('bank_lines')
          .select('statement_import_id, status, reconciled, posted_journal_id')
          .eq('organisation_id', orgId)
          .in('statement_import_id', statementIds)
      : { data: [] };
  const statementLineCounts = new Map<
    string,
    {
      unreconciled: number;
      reconciled: number;
      posted: number;
      excluded: number;
    }
  >();
  for (const row of statementLineRows ?? []) {
    const importId = row.statement_import_id as string | null;
    if (!importId) continue;
    const current = statementLineCounts.get(importId) ?? {
      unreconciled: 0,
      reconciled: 0,
      posted: 0,
      excluded: 0,
    };
    if (row.posted_journal_id) current.posted += 1;
    if (row.reconciled || row.status === 'reconciled') current.reconciled += 1;
    else if (row.status === 'excluded') current.excluded += 1;
    else current.unreconciled += 1;
    statementLineCounts.set(importId, current);
  }

  return {
    data: {
      account: summary,
      linked_ledger_account_name: linkedValidation.account?.name ?? null,
      linked_ledger_account: linkedValidation.account
        ? {
            ...linkedValidation.account,
            status: linkedValidation.status,
            message: linkedValidation.message,
          }
        : {
            id: account.linked_account_id ?? '',
            code: null,
            name: '',
            type: '',
            subtype: null,
            status: linkedValidation.status,
            message: linkedValidation.message,
          },
      statements: (statementsResult.data ?? []).map((statement) => ({
        id: statement.id,
        file_name: statement.file_name,
        file_type: statement.file_type,
        status: statement.status,
        statement_start_date: statement.statement_start_date,
        statement_end_date: statement.statement_end_date,
        rows_detected: Number(statement.rows_detected ?? 0),
        rows_imported: Number(statement.rows_imported ?? 0),
        duplicates_skipped: Number(statement.duplicates_skipped ?? 0),
        errors_count: Number(statement.errors_count ?? 0),
        uploaded_by: statement.uploaded_by,
        uploaded_at: statement.uploaded_at,
        imported_at: statement.imported_at,
        statement_warnings: asStatementWarnings(statement.statement_warnings),
        warning_status:
          statement.warning_status === 'warning' ? 'warning' : 'clear',
        unreconciled_rows:
          statementLineCounts.get(statement.id)?.unreconciled ?? 0,
        reconciled_rows: statementLineCounts.get(statement.id)?.reconciled ?? 0,
        posted_rows: statementLineCounts.get(statement.id)?.posted ?? 0,
        excluded_rows: statementLineCounts.get(statement.id)?.excluded ?? 0,
      })),
      certificates: (certificatesResult.data ?? []).map((certificate) => ({
        id: certificate.id,
        bank_account_id: certificate.bank_account_id,
        statement_import_id: certificate.statement_import_id,
        statement_period_start: certificate.statement_period_start,
        statement_period_end: certificate.statement_period_end,
        closing_bank_balance_pence: Number(
          certificate.closing_bank_balance_pence
        ),
        book_balance_pence: Number(certificate.book_balance_pence),
        difference_pence: Number(certificate.difference_pence),
        reconciled_transaction_count: Number(
          certificate.reconciled_transaction_count ?? 0
        ),
        unreconciled_exception_count: Number(
          certificate.unreconciled_exception_count ?? 0
        ),
        certificate_number: certificate.certificate_number,
        generated_by: certificate.generated_by,
        generated_at: certificate.generated_at,
      })),
      rules: rulesResult.data,
      audit_events: (auditResult.data ?? [])
        .filter((event) => {
          const metadata = (event.metadata ?? {}) as Record<string, unknown>;
          return (
            event.entity_id === bankAccountId ||
            metadata.bankAccountId === bankAccountId ||
            metadata.bank_account_id === bankAccountId
          );
        })
        .slice(0, 50)
        .map((event) => ({
          id: event.id,
          action: event.action,
          entity_type: event.entity_type,
          entity_id: event.entity_id,
          user_id: event.user_id,
          metadata: (event.metadata ?? {}) as Record<string, unknown>,
          created_at: event.created_at,
        })) as BankingAuditEvent[],
      reconciliation: {
        unreconciled_count: unreconciledCount,
        reconciled_count: reconciledCount,
        progress_percent:
          totalForProgress > 0
            ? Math.round((reconciledCount / totalForProgress) * 100)
            : 100,
        last_reconciled_date: summary.last_reconciled_date,
        recent_unreconciled_lines: unreconciledResult.data.lines,
      },
    },
    error: null,
  };
}

export async function generateReconciliationCertificate(params: {
  bankAccountId: string;
  statementImportId?: string | null;
}): Promise<{
  success: boolean;
  error: string | null;
  certificateId?: string;
}> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanPerform(role, 'create', 'reconciliation');
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof PermissionError ? error.message : 'Permission denied.',
    };
  }

  const supabase = await createClient();
  const { data: bankAccount, error: bankAccountError } = await supabase
    .from('bank_accounts')
    .select('id, name, linked_account_id')
    .eq('id', params.bankAccountId)
    .eq('organisation_id', orgId)
    .maybeSingle();

  if (bankAccountError || !bankAccount) {
    return {
      success: false,
      error: bankAccountError?.message ?? 'Bank account not found.',
    };
  }

  const statementQuery = supabase
    .from('bank_statement_imports')
    .select('id, statement_start_date, statement_end_date, closing_balance')
    .eq('workspace_id', orgId)
    .eq('bank_account_id', params.bankAccountId);

  const { data: statement, error: statementError } = params.statementImportId
    ? await statementQuery.eq('id', params.statementImportId).maybeSingle()
    : await statementQuery
        .order('statement_end_date', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

  if (statementError || !statement) {
    return {
      success: false,
      error: statementError?.message ?? 'Statement import not found.',
    };
  }

  const closingBankBalancePence =
    penceFromPounds(
      statement.closing_balance == null
        ? null
        : Number(statement.closing_balance)
    ) ?? 0;
  const bookBalancePence =
    (await getBookBalancePence(
      supabase,
      orgId,
      bankAccount.linked_account_id
    )) ?? 0;
  const differencePence = closingBankBalancePence - bookBalancePence;
  const [{ count: reconciledCount }, { data: exceptions }] = await Promise.all([
    supabase
      .from('bank_lines')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', orgId)
      .eq('bank_account_id', params.bankAccountId)
      .eq('statement_import_id', statement.id)
      .eq('reconciled', true),
    supabase
      .from('bank_lines')
      .select('id, txn_date, description, reference, amount_pence, status')
      .eq('organisation_id', orgId)
      .eq('bank_account_id', params.bankAccountId)
      .eq('statement_import_id', statement.id)
      .eq('reconciled', false)
      .not('status', 'in', '("excluded","duplicate")')
      .limit(25),
  ]);

  const exceptionRows = (exceptions ?? []).map((line) => ({
    id: line.id,
    txn_date: line.txn_date,
    description: line.description,
    reference: line.reference,
    amount_pence: Number(line.amount_pence ?? 0),
    status: line.status,
  }));
  const certificateNumber = `BRC-${statement.statement_end_date ?? new Date().toISOString().slice(0, 10)}-${Date.now()}`;
  const { data: certificate, error: insertError } = await supabase
    .from('bank_reconciliation_certificates')
    .insert({
      workspace_id: orgId,
      organisation_id: orgId,
      bank_account_id: params.bankAccountId,
      statement_import_id: statement.id,
      statement_period_start: statement.statement_start_date,
      statement_period_end:
        statement.statement_end_date ?? new Date().toISOString().slice(0, 10),
      closing_bank_balance_pence: closingBankBalancePence,
      book_balance_pence: bookBalancePence,
      difference_pence: differencePence,
      reconciled_transaction_count: reconciledCount ?? 0,
      unreconciled_exception_count: exceptionRows.length,
      unreconciled_exceptions: exceptionRows,
      certificate_number: certificateNumber,
      generated_by: user.id,
    })
    .select('id')
    .single();

  if (insertError || !certificate) {
    return {
      success: false,
      error:
        insertError?.message ??
        'Could not generate reconciliation certificate.',
    };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'bank_reconciliation_certificate_generated',
    entityType: 'bank_reconciliation_certificate',
    entityId: certificate.id,
    metadata: {
      bankAccountId: params.bankAccountId,
      statementImportId: statement.id,
      closingBankBalancePence,
      bookBalancePence,
      differencePence,
      reconciledTransactionCount: reconciledCount ?? 0,
      unreconciledExceptionCount: exceptionRows.length,
    },
  });

  revalidatePath(`/banking/${params.bankAccountId}`);
  return { success: true, error: null, certificateId: certificate.id };
}

export async function generateReconciliationCertificateFromForm(
  formData: FormData
): Promise<void> {
  const bankAccountId = String(formData.get('bankAccountId') ?? '').trim();
  const statementImportId =
    String(formData.get('statementImportId') ?? '').trim() || null;
  if (bankAccountId) {
    await generateReconciliationCertificate({
      bankAccountId,
      statementImportId,
    });
  }
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
    return {
      success: false,
      error: e instanceof PermissionError ? e.message : 'Permission denied.',
    };
  }

  const supabase = await createClient();

  const [{ data: bankLine }, { data: confirmedTransactionMatch }] =
    await Promise.all([
      supabase
        .from('bank_lines')
        .select('allocated, reconciled, posted_journal_id, statement_import_id')
        .eq('id', bankLineId)
        .eq('organisation_id', orgId)
        .maybeSingle(),
      supabase
        .from('transaction_matches')
        .select('id')
        .eq('bank_line_id', bankLineId)
        .eq('organisation_id', orgId)
        .eq('match_status', 'confirmed')
        .maybeSingle(),
    ]);

  if (!bankLine) {
    return { success: false, error: 'Bank line not found.' };
  }
  if (
    bankLine.posted_journal_id ||
    bankLine.allocated ||
    bankLine.reconciled ||
    confirmedTransactionMatch
  ) {
    return {
      success: false,
      error:
        'This bank line is already posted, matched, reconciled, or allocated.',
    };
  }
  if (bankLine.statement_import_id) {
    return {
      success: false,
      error:
        'Imported bank transactions must be reconciled through the reconciliation workspace before ledger posting.',
    };
  }

  const { error } = await supabase.rpc('post_bank_allocation_atomic', {
    p_org_id: orgId,
    p_bank_line_id: bankLineId,
    p_account_id: accountId,
    p_fund_id: fundId,
    p_supplier_id: supplierId || null,
    p_user_id: user.id,
    p_environment: getAppEnv(),
  });

  if (error) {
    await logServerFailure({
      area: 'banking',
      event: 'allocate_bank_line_failed',
      error,
      metadata: {
        bankLineId,
        accountId,
        fundId,
        supplierId,
        orgId,
        userId: user.id,
      },
    });
    return { success: false, error: error.message };
  }

  invalidateOrgReportCache(orgId);
  return { success: true, error: null };
}

/* ------------------------------------------------------------------ */
/*  Deallocate a bank line                                             */
/* ------------------------------------------------------------------ */

export async function deallocateBankLine(
  bankLineId: string
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { role, orgId } = await getActiveOrg();

  try {
    assertCanPerform(role, 'delete', 'banking');
  } catch (e) {
    return {
      success: false,
      error: e instanceof PermissionError ? e.message : 'Permission denied.',
    };
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
    await supabase
      .from('journal_lines')
      .delete()
      .eq('journal_id', linkedJournal.id);
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
    card_colour?: string | null;
    card_gradient?: string | null;
    card_theme?: string | null;
    is_active?: boolean;
    linked_account_id?: string | null;
  }
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { role, orgId, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'update', 'banking');
  } catch (e) {
    return {
      success: false,
      error: e instanceof PermissionError ? e.message : 'Permission denied.',
    };
  }

  const supabase = await createClient();

  const updates: Record<string, unknown> = {};
  if (payload.name !== undefined) updates.name = payload.name.trim();
  if (payload.account_number_last4 !== undefined)
    updates.account_number_last4 = payload.account_number_last4;
  if (payload.sort_code !== undefined) updates.sort_code = payload.sort_code;
  if (payload.card_theme !== undefined) {
    if (!isBankCardTheme(payload.card_theme)) {
      return { success: false, error: 'Choose a valid card theme.' };
    }
    updates.card_theme = payload.card_theme;
  }
  if (payload.card_colour !== undefined) {
    const cardColour = payload.card_colour?.trim() || null;
    if (cardColour && !isSafeHexColour(cardColour)) {
      return {
        success: false,
        error: 'Card colour must be a safe hex value such as #7c3aed.',
      };
    }
    updates.card_colour = cardColour;
  }
  if (payload.card_gradient !== undefined) updates.card_gradient = null;
  if (payload.is_active !== undefined) updates.is_active = payload.is_active;
  if (payload.linked_account_id === null && payload.is_active !== false) {
    return {
      success: false,
      error: 'Active bank accounts must be linked to a valid ledger account.',
    };
  }

  if (Object.keys(updates).length === 0) {
    if (payload.linked_account_id) {
      const linked = await linkExistingBankLedgerAccount({
        bankAccountId,
        accountId: payload.linked_account_id,
        orgId,
        userId: user.id,
      });
      return { success: !linked.error, error: linked.error };
    }
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

  if (payload.linked_account_id) {
    const linked = await linkExistingBankLedgerAccount({
      bankAccountId,
      accountId: payload.linked_account_id,
      orgId,
      userId: user.id,
    });
    if (linked.error) return { success: false, error: linked.error };
  }

  return { success: true, error: null };
}

export async function updateBankCardAppearanceFromForm(
  formData: FormData
): Promise<{ success: boolean; error: string | null }> {
  const bankAccountId = String(formData.get('bankAccountId') ?? '').trim();
  const rawTheme = String(
    formData.get('card_theme') ?? DEFAULT_BANK_CARD_THEME
  ).trim();
  const rawColour = String(formData.get('card_colour') ?? '').trim();

  if (!bankAccountId) {
    return { success: false, error: 'Bank account is required.' };
  }

  const result = await updateBankAccount(bankAccountId, {
    card_theme: isBankCardTheme(rawTheme) ? rawTheme : DEFAULT_BANK_CARD_THEME,
    card_colour: rawColour || null,
    card_gradient: null,
  });

  if (result.success) {
    revalidatePath('/banking');
    revalidatePath(`/banking/${bankAccountId}`);
    revalidatePath('/settings');
  }

  return result;
}

export async function repairBankAccountLedgerLink(
  bankAccountId: string
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { role, orgId, user } = await getActiveOrg();
  try {
    assertCanPerform(role, 'update', 'banking');
    assertCanPerform(role, 'create', 'accounts');
  } catch (e) {
    return {
      success: false,
      error: e instanceof PermissionError ? e.message : 'Permission denied.',
    };
  }

  const result = await ensureBankLedgerAccount({
    bankAccountId,
    orgId,
    userId: user.id,
  });
  revalidatePath('/banking');
  revalidatePath(`/banking/${bankAccountId}`);
  revalidatePath('/reconciliation');
  return { success: !result.error, error: result.error };
}

export async function repairBankAccountLedgerLinkFromForm(
  formData: FormData
): Promise<void> {
  const bankAccountId = String(formData.get('bankAccountId') ?? '').trim();
  if (bankAccountId) await repairBankAccountLedgerLink(bankAccountId);
}

export async function linkBankAccountLedgerAccountFromForm(
  formData: FormData
): Promise<void> {
  await assertWriteAllowed();
  const { role, orgId, user } = await getActiveOrg();
  try {
    assertCanPerform(role, 'update', 'banking');
  } catch {
    return;
  }

  const bankAccountId = String(formData.get('bankAccountId') ?? '').trim();
  const accountId = String(formData.get('linkedAccountId') ?? '').trim();
  if (!bankAccountId || !accountId) return;
  await linkExistingBankLedgerAccount({
    bankAccountId,
    accountId,
    orgId,
    userId: user.id,
  });
  revalidatePath('/banking');
  revalidatePath(`/banking/${bankAccountId}`);
  revalidatePath('/reconciliation');
}

/* ------------------------------------------------------------------ */
/*  Get allocation display (with account + fund names)                 */
/* ------------------------------------------------------------------ */

export async function getAllocationForLine(
  bankLineId: string
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
    supabase
      .from('accounts')
      .select('name')
      .eq('id', alloc.account_id)
      .single(),
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
