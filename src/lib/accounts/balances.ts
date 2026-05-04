'use server';

import { createClient } from '@/lib/supabase/server';
import type { AccountType } from './types';

/* -------------------------------------------------------------------------- */
/*  Posted-ledger aggregates (canonical for balances on chart + cards)       */
/* -------------------------------------------------------------------------- */

const JOURNAL_IDS_CHUNK = 400;

async function fetchPostedJournalIdsForRange(
  orgId: string,
  opts?: { fromDateInclusive?: string; toDateInclusive?: string },
): Promise<string[]> {
  const supabase = await createClient();
  let q = supabase
    .from('journals')
    .select('id')
    .eq('organisation_id', orgId)
    .eq('status', 'posted');
  if (opts?.fromDateInclusive) q = q.gte('journal_date', opts.fromDateInclusive);
  if (opts?.toDateInclusive) q = q.lte('journal_date', opts.toDateInclusive);
  const { data, error } = await q;
  if (error || !data) return [];
  return data.map((r) => r.id as string);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Debit minus credit totals per account from posted journals only.
 */
export async function getPostedAccountNetMap(
  orgId: string,
  accountIds: string[],
  journalDateRange?: { from?: string; to?: string },
): Promise<Map<string, { lineCount: number; netPence: number }>> {
  const result = new Map<string, { lineCount: number; netPence: number }>();
  for (const id of accountIds) {
    result.set(id, { lineCount: 0, netPence: 0 });
  }
  if (accountIds.length === 0) return result;

  const journalIds = await fetchPostedJournalIdsForRange(orgId, {
    fromDateInclusive: journalDateRange?.from,
    toDateInclusive: journalDateRange?.to,
  });
  if (journalIds.length === 0) return result;

  const supabase = await createClient();
  const accountIdSet = new Set(accountIds);

  for (const jChunk of chunk(journalIds, JOURNAL_IDS_CHUNK)) {
    const { data: lines } = await supabase
      .from('journal_lines')
      .select('account_id, debit_pence, credit_pence')
      .eq('organisation_id', orgId)
      .in('journal_id', jChunk)
      .in('account_id', accountIds);

    for (const line of lines ?? []) {
      const aid = line.account_id as string;
      if (!accountIdSet.has(aid)) continue;
      const cur = result.get(aid)!;
      const net = Number(line.debit_pence ?? 0) - Number(line.credit_pence ?? 0);
      cur.lineCount += 1;
      cur.netPence += net;
      result.set(aid, cur);
    }
  }

  return result;
}

function ytdRange(): { from: string; to: string } {
  const now = new Date();
  const start = `${now.getFullYear()}-01-01`;
  const to = now.toISOString().slice(0, 10);
  return { from: start, to };
}

/** Summary numbers for Accounts control centre KPI row (posted journals only). */
export async function getChartOfAccountsSummary(orgId: string): Promise<{
  totalAssetsPence: number;
  totalLiabilitiesPence: number;
  totalFundBalancePence: number;
  incomeYtdPence: number;
  expenseYtdPence: number;
}> {
  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, type')
    .eq('organisation_id', orgId)
    .eq('is_active', true);

  const byType = new Map<string, string[]>();
  for (const a of accounts ?? []) {
    const t = a.type as string;
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(a.id as string);
  }

  const { from, to } = ytdRange();

  const sumType = async (
    types: AccountType[],
    range?: { from?: string; to?: string },
  ): Promise<number> => {
    const ids = types.flatMap((t) => byType.get(t) ?? []);
    if (ids.length === 0) return 0;
    const m = await getPostedAccountNetMap(orgId, ids, range);
    let sum = 0;
    for (const id of ids) {
      sum += m.get(id)?.netPence ?? 0;
    }
    return sum;
  };

  const [assets, liabilities, funds, incomeYtd, expenseYtd] = await Promise.all([
    sumType(['asset']),
    sumType(['liability']),
    sumType(['fund_balance', 'equity']),
    sumType(['income'], { from, to }),
    sumType(['expense'], { from, to }),
  ]);

  return {
    totalAssetsPence: assets,
    totalLiabilitiesPence: liabilities,
    totalFundBalancePence: funds,
    incomeYtdPence: incomeYtd,
    expenseYtdPence: expenseYtd,
  };
}

export interface AccountActivityRow {
  journal_line_id: string;
  journal_id: string;
  journal_date: string;
  reference: string | null;
  memo: string | null;
  status: string | null;
  source_type: string | null;
  source_id: string | null;
  /** Original journal id when this row's journal is a posted reversal. */
  reversal_of: string | null;
  reversal_of_journal_id: string | null;
  /** Set on the original journal when a reversal was posted. */
  reversed_by: string | null;
  fund_id: string | null;
  fund_name: string | null;
  description: string | null;
  debit_pence: number;
  credit_pence: number;
  net_pence: number;
}

/** Posted journal lines for an account with journal metadata — newest-first page */
export async function getAccountActivity(
  orgId: string,
  accountId: string,
  options?: { page?: number; pageSize?: number },
): Promise<{
  rows: AccountActivityRow[];
  total: number;
  error: string | null;
}> {
  const page = options?.page ?? 1;
  const pageSize = Math.min(options?.pageSize ?? 40, 200);
  const supabase = await createClient();

  const postedIds = await fetchPostedJournalIdsForRange(orgId);
  const postedSet = new Set(postedIds);
  if (postedIds.length === 0) {
    return { rows: [], total: 0, error: null };
  }

  const allLines: {
    jl: Record<string, unknown>;
    j: Record<string, unknown>;
    sortKey: number;
    sortId: string;
  }[] = [];

  for (const pid of chunk(postedIds, JOURNAL_IDS_CHUNK)) {
    const { data: jlBatch, error } = await supabase
      .from('journal_lines')
      .select('id,journal_id,description,fund_id,debit_pence,credit_pence')
      .eq('organisation_id', orgId)
      .eq('account_id', accountId)
      .in('journal_id', pid);
    if (error) return { rows: [], total: 0, error: error.message };

    const jidsNeeded = [...new Set((jlBatch ?? []).map((l) => l.journal_id as string))];
    if (jidsNeeded.length === 0) continue;

    const { data: jrows } = await supabase
      .from('journals')
      .select('id,journal_date,memo,status,source_type,source_id')
      .eq('organisation_id', orgId)
      .in('id', jidsNeeded);
    const jmap = new Map((jrows ?? []).map((j) => [j.id as string, j as Record<string, unknown>]));

    for (const jl of jlBatch ?? []) {
      const jid = jl.journal_id as string;
      const jrow = jmap.get(jid);
      if (!jrow || String(jrow.status) !== 'posted' || !postedSet.has(jid)) continue;

      const d = String(jrow.journal_date ?? '1970-01-01').slice(0, 10);
      const dk = Number(new Date(`${d}T12:00:00Z`).getTime());
      allLines.push({
        jl: jl as Record<string, unknown>,
        j: jrow,
        sortKey: dk,
        sortId: jl.id as string,
      });
    }
  }

  allLines.sort((a, b) => {
    if (b.sortKey !== a.sortKey) return b.sortKey - a.sortKey;
    return b.sortId.localeCompare(a.sortId);
  });

  const total = allLines.length;
  const slice = allLines.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

  const fundIds = [...new Set(slice.map((x) => x.jl.fund_id as string | null).filter(Boolean))] as string[];
  const fundsMap = new Map<string, string>();
  if (fundIds.length > 0) {
    const { data: fds } = await supabase.from('funds').select('id,name').eq('organisation_id', orgId).in('id', fundIds);
    for (const f of fds ?? []) fundsMap.set(f.id as string, f.name as string);
  }

  const rows: AccountActivityRow[] = slice.map(({ jl, j }) => {
    const dr = Number(jl.debit_pence ?? 0);
    const cr = Number(jl.credit_pence ?? 0);
    const fid = jl.fund_id as string | null;

    const jdate = String(j?.journal_date ?? '').slice(0, 10);
    const revOf = (j.reversal_of ?? j.reversal_of_journal_id) as string | null | undefined;
    return {
      journal_line_id: jl.id as string,
      journal_id: jl.journal_id as string,
      journal_date: jdate,
      reference: j.reference != null ? String(j.reference) : null,
      memo: j.memo != null ? String(j.memo) : null,
      status: j.status != null ? String(j.status) : null,
      source_type: j.source_type != null ? String(j.source_type) : null,
      source_id: j.source_id != null ? String(j.source_id) : null,
      reversal_of: revOf != null ? String(revOf) : null,
      reversal_of_journal_id:
        j.reversal_of_journal_id != null ? String(j.reversal_of_journal_id) : revOf != null ? String(revOf) : null,
      reversed_by: j.reversed_by != null ? String(j.reversed_by) : null,
      fund_id: fid,
      fund_name: fid ? fundsMap.get(fid) ?? null : null,
      description: jl.description != null ? String(jl.description) : null,
      debit_pence: dr,
      credit_pence: cr,
      net_pence: dr - cr,
    };
  });

  return { rows, total, error: null };
}

export interface AccountFundBreakdownRow {
  fund_id: string | null;
  fund_name: string | null;
  net_pence: number;
  percent_of_total: number;
}

/** Net movement by fund for one account (posted journals, optional date range) */
export async function getAccountFundBreakdown(
  orgId: string,
  accountId: string,
  range?: { from?: string; to?: string },
): Promise<AccountFundBreakdownRow[]> {
  const supabase = await createClient();
  const postedIds = await fetchPostedJournalIdsForRange(orgId, {
    fromDateInclusive: range?.from,
    toDateInclusive: range?.to,
  });
  if (postedIds.length === 0) return [];

  const byFund = new Map<string | null, number>();
  for (const chunkIds of chunk(postedIds, JOURNAL_IDS_CHUNK)) {
    const { data: lines } = await supabase
      .from('journal_lines')
      .select('fund_id, debit_pence, credit_pence')
      .eq('organisation_id', orgId)
      .eq('account_id', accountId)
      .in('journal_id', chunkIds);
    for (const l of lines ?? []) {
      const fid = l.fund_id as string | null;
      const net = Number(l.debit_pence ?? 0) - Number(l.credit_pence ?? 0);
      byFund.set(fid, (byFund.get(fid) ?? 0) + net);
    }
  }

  const fundIds = [...byFund.keys()].filter((k): k is string => k != null);
  const names = new Map<string, string>();
  if (fundIds.length > 0) {
    const { data: fds } = await supabase.from('funds').select('id,name').eq('organisation_id', orgId).in('id', fundIds);
    for (const f of fds ?? []) names.set(f.id as string, f.name as string);
  }

  let totalAbs = 0;
  for (const v of byFund.values()) totalAbs += Math.abs(v);
  if (totalAbs === 0) totalAbs = 1;

  const rows: AccountFundBreakdownRow[] = [];
  for (const [fid, net] of byFund) {
    rows.push({
      fund_id: fid,
      fund_name: fid ? names.get(fid) ?? 'Fund' : 'Unallocated',
      net_pence: net,
      percent_of_total: Math.round((Math.abs(net) * 10000) / totalAbs) / 100,
    });
  }
  rows.sort((a, b) => Math.abs(b.net_pence) - Math.abs(a.net_pence));
  return rows;
}
