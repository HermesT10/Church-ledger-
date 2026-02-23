import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { MONTH_KEYS, type MonthKey } from '@/lib/budgets/budgetMath';
import { getCached, setCached } from '@/lib/cache';
import { timedQuery } from '@/lib/perf';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MonthlyActuals {
  m01_pence: bigint;
  m02_pence: bigint;
  m03_pence: bigint;
  m04_pence: bigint;
  m05_pence: bigint;
  m06_pence: bigint;
  m07_pence: bigint;
  m08_pence: bigint;
  m09_pence: bigint;
  m10_pence: bigint;
  m11_pence: bigint;
  m12_pence: bigint;
  ytd_pence: bigint;
}

/** Keyed by account_id. */
export type ActualsMap = Record<string, MonthlyActuals>;

/** Shape of a raw journal line used by the pure aggregation helper. */
export interface RawJournalLine {
  account_id: string;
  fund_id: string | null;
  debit_pence: number;
  credit_pence: number;
  journal_date: string; // ISO date string, e.g. '2026-03-15'
}

/* ------------------------------------------------------------------ */
/*  Pure aggregation helper (testable without Supabase)                */
/* ------------------------------------------------------------------ */

function emptyMonthlyActuals(): MonthlyActuals {
  return {
    m01_pence: 0n,
    m02_pence: 0n,
    m03_pence: 0n,
    m04_pence: 0n,
    m05_pence: 0n,
    m06_pence: 0n,
    m07_pence: 0n,
    m08_pence: 0n,
    m09_pence: 0n,
    m10_pence: 0n,
    m11_pence: 0n,
    m12_pence: 0n,
    ytd_pence: 0n,
  };
}

/**
 * Aggregate raw journal lines into monthly actuals per account.
 *
 * Sign convention:
 *  - Income accounts:  net = credit_pence - debit_pence (credits increase income)
 *  - Expense accounts: net = debit_pence - credit_pence (debits increase expense)
 *
 * @param lines         Raw journal lines with dates and amounts.
 * @param accountTypes  Map of accountId -> account type ('income' | 'expense').
 *                      Lines whose account_id is not in this map are skipped.
 */
export function aggregateActuals(
  lines: RawJournalLine[],
  accountTypes: Record<string, string>,
): ActualsMap {
  const result: ActualsMap = {};

  for (const line of lines) {
    const accountType = accountTypes[line.account_id];
    if (!accountType) continue; // skip unknown accounts

    // Only aggregate income and expense
    if (accountType !== 'income' && accountType !== 'expense') continue;

    // Extract month (1-12) from the journal date
    const month = new Date(line.journal_date).getMonth() + 1; // getMonth() is 0-based
    if (month < 1 || month > 12) continue;

    const monthKey: MonthKey = MONTH_KEYS[month - 1];

    // Compute net pence based on account type
    let netPence: bigint;
    if (accountType === 'income') {
      netPence = BigInt(line.credit_pence) - BigInt(line.debit_pence);
    } else {
      // expense
      netPence = BigInt(line.debit_pence) - BigInt(line.credit_pence);
    }

    // Ensure entry exists
    if (!result[line.account_id]) {
      result[line.account_id] = emptyMonthlyActuals();
    }

    result[line.account_id][monthKey] += netPence;
  }

  // Compute YTD for each account
  for (const accountId of Object.keys(result)) {
    let ytd = 0n;
    for (const key of MONTH_KEYS) {
      ytd += result[accountId][key];
    }
    result[accountId].ytd_pence = ytd;
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Server action                                                      */
/* ------------------------------------------------------------------ */

/** Cache TTL for monthly actuals: 5 minutes */
const ACTUALS_CACHE_TTL_MS = 5 * 60 * 1000;

export async function getActualsByMonth(params: {
  organisationId: string;
  year: number;
  fundId?: string | null;
  accountIds?: string[];
}): Promise<{ data: ActualsMap; error: string | null }> {
  'use server';
  const { organisationId, year, fundId, accountIds } = params;

  // Auth check
  await getActiveOrg();

  // Cache key: org + year + fund + sorted account IDs
  const accountsHash = accountIds ? accountIds.slice().sort().join(',') : 'all';
  const cacheKey = `actuals:${organisationId}:${year}:${fundId ?? 'all'}:${accountsHash}`;
  const cached = getCached<ActualsMap>(cacheKey);
  if (cached) return { data: cached, error: null };

  return timedQuery(`getActualsByMonth(${organisationId}, ${year})`, async () => {
    const supabase = await createClient();

    // 1. Fetch posted journal IDs for the org and year
    const { data: journals, error: journalErr } = await supabase
      .from('journals')
      .select('id, journal_date')
      .eq('organisation_id', organisationId)
      .eq('status', 'posted')
      .gte('journal_date', `${year}-01-01`)
      .lte('journal_date', `${year}-12-31`);

    if (journalErr) {
      return { data: {}, error: journalErr.message };
    }

    if (!journals || journals.length === 0) {
      return { data: {}, error: null };
    }

    // Build a map of journal_id -> journal_date for month extraction
    const journalDateMap: Record<string, string> = {};
    const journalIds: string[] = [];
    for (const j of journals) {
      journalDateMap[j.id] = j.journal_date;
      journalIds.push(j.id);
    }

    // 2. Fetch journal lines for those journals
    // Add organisation_id filter early so the DB can use idx_jlines_org_account
    let linesQuery = supabase
      .from('journal_lines')
      .select('account_id, fund_id, debit_pence, credit_pence, journal_id')
      .eq('organisation_id', organisationId)
      .in('journal_id', journalIds);

    // Optional fund filter
    if (fundId !== undefined && fundId !== null) {
      linesQuery = linesQuery.eq('fund_id', fundId);
    }

    // Optional account filter
    if (accountIds && accountIds.length > 0) {
      linesQuery = linesQuery.in('account_id', accountIds);
    }

    const { data: lines, error: linesErr } = await linesQuery;

    if (linesErr) {
      return { data: {}, error: linesErr.message };
    }

    if (!lines || lines.length === 0) {
      return { data: {}, error: null };
    }

    // 3. Collect unique account IDs from lines and fetch their types
    const uniqueAccountIds = [...new Set(lines.map((l) => l.account_id))];

    const { data: accounts, error: accErr } = await supabase
      .from('accounts')
      .select('id, type')
      .in('id', uniqueAccountIds);

    if (accErr) {
      return { data: {}, error: accErr.message };
    }

    const accountTypes: Record<string, string> = {};
    for (const acc of accounts ?? []) {
      accountTypes[acc.id] = acc.type;
    }

    // 4. Transform lines into RawJournalLine format (attach journal_date)
    const rawLines: RawJournalLine[] = lines.map((l) => ({
      account_id: l.account_id,
      fund_id: l.fund_id,
      debit_pence: l.debit_pence,
      credit_pence: l.credit_pence,
      journal_date: journalDateMap[l.journal_id],
    }));

    // 5. Aggregate
    const result = aggregateActuals(rawLines, accountTypes);

    // Store in cache
    setCached(cacheKey, result, ACTUALS_CACHE_TTL_MS);

    return { data: result, error: null };
  });
}
