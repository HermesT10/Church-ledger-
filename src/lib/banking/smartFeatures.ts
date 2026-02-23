'use server';

import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';

/* ================================================================== */
/*  Smart Features for Bank Allocation                                 */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  Auto-suggest account + fund from past allocations                   */
/* ------------------------------------------------------------------ */

export interface AllocationSuggestion {
  accountId: string;
  accountName: string;
  fundId: string;
  fundName: string;
  supplierId: string | null;
  supplierName: string | null;
  confidence: 'high' | 'medium' | 'low';
  matchReason: string;
}

export async function suggestAllocation(
  description: string,
): Promise<{ data: AllocationSuggestion | null; error: string | null }> {
  if (!description?.trim()) return { data: null, error: null };

  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  // Find past allocations with similar descriptions
  const normalizedDesc = description.trim().toLowerCase();

  // Strategy 1: Exact description match from past bank lines
  const { data: exactMatches } = await supabase
    .from('bank_lines')
    .select('id, description')
    .eq('organisation_id', orgId)
    .eq('allocated', true)
    .ilike('description', normalizedDesc)
    .limit(5);

  // Strategy 2: Fuzzy match - contains major keywords
  const keywords = normalizedDesc
    .split(/\s+/)
    .filter((w) => w.length > 3);

  let fuzzyLineIds: string[] = [];
  if (keywords.length > 0 && (!exactMatches || exactMatches.length === 0)) {
    const pattern = keywords.slice(0, 3).map((k) => `%${k}%`);
    const { data: fuzzyMatches } = await supabase
      .from('bank_lines')
      .select('id')
      .eq('organisation_id', orgId)
      .eq('allocated', true)
      .ilike('description', pattern[0])
      .limit(20);

    fuzzyLineIds = (fuzzyMatches ?? []).map((m) => m.id);
  }

  const targetLineIds = [
    ...(exactMatches ?? []).map((m) => m.id),
    ...fuzzyLineIds,
  ];

  if (targetLineIds.length === 0) return { data: null, error: null };

  // Fetch allocations for these lines
  const { data: allocations } = await supabase
    .from('allocations')
    .select('account_id, fund_id, supplier_id')
    .in('bank_line_id', targetLineIds);

  if (!allocations || allocations.length === 0) return { data: null, error: null };

  // Find the most common account/fund combination
  const combo = new Map<string, { accountId: string; fundId: string; supplierId: string | null; count: number }>();
  for (const a of allocations) {
    const key = `${a.account_id}|${a.fund_id}`;
    const existing = combo.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      combo.set(key, { accountId: a.account_id, fundId: a.fund_id, supplierId: a.supplier_id, count: 1 });
    }
  }

  // Get top combo
  let top = { accountId: '', fundId: '', supplierId: null as string | null, count: 0 };
  for (const v of combo.values()) {
    if (v.count > top.count) top = v;
  }

  if (!top.accountId) return { data: null, error: null };

  // Fetch names
  const [{ data: account }, { data: fund }] = await Promise.all([
    supabase.from('accounts').select('name').eq('id', top.accountId).single(),
    supabase.from('funds').select('name').eq('id', top.fundId).single(),
  ]);

  let supplierName: string | null = null;
  if (top.supplierId) {
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('name')
      .eq('id', top.supplierId)
      .single();
    supplierName = supplier?.name ?? null;
  }

  const isExact = (exactMatches?.length ?? 0) > 0;
  const confidence = isExact ? (top.count >= 3 ? 'high' : 'medium') : 'low';

  return {
    data: {
      accountId: top.accountId,
      accountName: account?.name ?? 'Unknown',
      fundId: top.fundId,
      fundName: fund?.name ?? 'Unknown',
      supplierId: top.supplierId,
      supplierName,
      confidence,
      matchReason: isExact
        ? `Matched ${top.count} previous allocation(s) with identical description`
        : `Matched ${top.count} previous allocation(s) with similar description`,
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  Duplicate Detection for bank lines                                  */
/* ------------------------------------------------------------------ */

export interface DuplicateCandidate {
  id: string;
  txn_date: string;
  description: string | null;
  amount_pence: number;
  fingerprint: string | null;
}

export async function detectDuplicates(params: {
  bankAccountId: string;
  txnDate: string;
  amountPence: number;
  description: string;
  fingerprint?: string | null;
}): Promise<{ data: DuplicateCandidate[]; error: string | null }> {
  const { bankAccountId, txnDate, amountPence, description, fingerprint } = params;
  const supabase = await createClient();

  // Strategy 1: Exact fingerprint match
  if (fingerprint) {
    const { data: fpMatches } = await supabase
      .from('bank_lines')
      .select('id, txn_date, description, amount_pence, fingerprint')
      .eq('bank_account_id', bankAccountId)
      .eq('fingerprint', fingerprint)
      .limit(5);

    if (fpMatches && fpMatches.length > 0) {
      return {
        data: fpMatches.map((m) => ({
          id: m.id,
          txn_date: m.txn_date,
          description: m.description,
          amount_pence: Number(m.amount_pence),
          fingerprint: m.fingerprint,
        })),
        error: null,
      };
    }
  }

  // Strategy 2: Same date + amount + similar description
  const { data: candidates } = await supabase
    .from('bank_lines')
    .select('id, txn_date, description, amount_pence, fingerprint')
    .eq('bank_account_id', bankAccountId)
    .eq('txn_date', txnDate)
    .eq('amount_pence', amountPence)
    .limit(10);

  const dupes: DuplicateCandidate[] = [];
  for (const c of candidates ?? []) {
    // Check description similarity
    const cDesc = (c.description ?? '').toLowerCase();
    const inputDesc = description.toLowerCase();
    if (cDesc === inputDesc || cDesc.includes(inputDesc) || inputDesc.includes(cDesc)) {
      dupes.push({
        id: c.id,
        txn_date: c.txn_date,
        description: c.description,
        amount_pence: Number(c.amount_pence),
        fingerprint: c.fingerprint,
      });
    }
  }

  return { data: dupes, error: null };
}

/* ------------------------------------------------------------------ */
/*  Restricted Fund Warning                                             */
/* ------------------------------------------------------------------ */

export interface FundWarning {
  fundId: string;
  fundName: string;
  fundType: string;
  currentBalancePence: number;
  proposedAmountPence: number;
  wouldGoNegative: boolean;
  message: string;
}

export async function checkFundWarning(params: {
  fundId: string;
  amountPence: number;
}): Promise<{ data: FundWarning | null; error: string | null }> {
  const { fundId, amountPence } = params;
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  // Only warn for restricted funds
  const { data: fund } = await supabase
    .from('funds')
    .select('id, name, type')
    .eq('id', fundId)
    .eq('organisation_id', orgId)
    .single();

  if (!fund) return { data: null, error: null };
  if (fund.type !== 'restricted') return { data: null, error: null };

  // Compute current balance from journal_lines
  const { data: journals } = await supabase
    .from('journals')
    .select('id')
    .eq('organisation_id', orgId)
    .eq('status', 'posted');

  if (!journals || journals.length === 0) {
    const wouldGoNegative = amountPence > 0;
    return {
      data: {
        fundId: fund.id,
        fundName: fund.name,
        fundType: fund.type,
        currentBalancePence: 0,
        proposedAmountPence: amountPence,
        wouldGoNegative,
        message: wouldGoNegative
          ? `Warning: This would create a negative balance in restricted fund "${fund.name}".`
          : '',
      },
      error: null,
    };
  }

  const journalIds = journals.map((j) => j.id);

  // Get all income/expense lines for this fund
  const { data: lines } = await supabase
    .from('journal_lines')
    .select('debit_pence, credit_pence')
    .eq('fund_id', fundId)
    .in('journal_id', journalIds);

  // Fund balance = credits - debits (income increases, expense decreases)
  let balance = 0;
  for (const l of lines ?? []) {
    balance += Number(l.credit_pence) - Number(l.debit_pence);
  }

  // Expense allocations reduce the fund balance
  const newBalance = balance - Math.abs(amountPence);
  const wouldGoNegative = newBalance < 0;

  if (!wouldGoNegative) return { data: null, error: null };

  return {
    data: {
      fundId: fund.id,
      fundName: fund.name,
      fundType: fund.type,
      currentBalancePence: balance,
      proposedAmountPence: amountPence,
      wouldGoNegative: true,
      message: `Warning: This would reduce restricted fund "${fund.name}" to £${(newBalance / 100).toFixed(2)}. Current balance: £${(balance / 100).toFixed(2)}.`,
    },
    error: null,
  };
}
