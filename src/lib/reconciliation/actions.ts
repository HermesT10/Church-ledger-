'use server';

import { createClient } from '@/lib/supabase/server';
import { getActiveOrg } from '@/lib/org';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { invalidateOrgReportCache } from '@/lib/cache';
import {
  buildMatchCandidate,
  rankCandidates,
  type MatchCandidate,
} from './matching';
import {
  computeClearingBalances,
  type ClearingProviderRow,
  type JournalLineInput,
  type ProviderClearingMap,
} from './clearingReport';
import { assertWriteAllowed } from '@/lib/demo';
import type {
  UnreconciledBankLine,
  ReconciledBankLine,
  ReconciliationStats,
  ReconciliationRow,
  ReconciliationWithMeta,
  ClearableBankLine,
  ReconciliationSummary,
  GLReconciliationData,
} from './types';

/* ------------------------------------------------------------------ */
/*  getUnreconciledBankLines                                           */
/* ------------------------------------------------------------------ */

export async function getUnreconciledBankLines(
  bankAccountId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<{ data: UnreconciledBankLine[]; error: string | null }> {
  const supabase = await createClient();

  // Get all bank line IDs that ARE matched
  const { data: matches } = await supabase
    .from('bank_reconciliation_matches')
    .select('bank_line_id')
    .not('bank_line_id', 'is', null);

  const matchedIds = new Set((matches ?? []).map((m) => m.bank_line_id));

  // Fetch all bank lines for this account
  let query = supabase
    .from('bank_lines')
    .select('id, txn_date, description, reference, amount_pence, balance_pence')
    .eq('bank_account_id', bankAccountId)
    .order('txn_date', { ascending: false });

  if (dateFrom) query = query.gte('txn_date', dateFrom);
  if (dateTo) query = query.lte('txn_date', dateTo);

  const { data, error } = await query;

  if (error) return { data: [], error: error.message };

  // Filter out matched lines
  const unreconciled = (data ?? [])
    .filter((bl) => !matchedIds.has(bl.id))
    .map((bl) => ({
      id: bl.id,
      txn_date: bl.txn_date,
      description: bl.description,
      reference: bl.reference,
      amount_pence: Number(bl.amount_pence),
      balance_pence: bl.balance_pence != null ? Number(bl.balance_pence) : null,
    }));

  return { data: unreconciled, error: null };
}

/* ------------------------------------------------------------------ */
/*  getReconciledBankLines                                             */
/* ------------------------------------------------------------------ */

export async function getReconciledBankLines(
  bankAccountId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<{ data: ReconciledBankLine[]; error: string | null }> {
  const supabase = await createClient();

  // Get matched bank lines with their match info
  let query = supabase
    .from('bank_lines')
    .select('id, txn_date, description, reference, amount_pence')
    .eq('bank_account_id', bankAccountId)
    .order('txn_date', { ascending: false });

  if (dateFrom) query = query.gte('txn_date', dateFrom);
  if (dateTo) query = query.lte('txn_date', dateTo);

  const { data: bankLines, error: blErr } = await query;
  if (blErr) return { data: [], error: blErr.message };

  const blIds = (bankLines ?? []).map((bl) => bl.id);
  if (blIds.length === 0) return { data: [], error: null };

  // Fetch matches for these bank lines
  const { data: matches, error: mErr } = await supabase
    .from('bank_reconciliation_matches')
    .select('id, bank_line_id, journal_id, match_type, provider')
    .in('bank_line_id', blIds);

  if (mErr) return { data: [], error: mErr.message };

  const matchMap = new Map(
    (matches ?? []).map((m) => [m.bank_line_id, m])
  );

  // Fetch journal info for matched journals
  const journalIds = (matches ?? []).map((m) => m.journal_id);
  let journalMap = new Map<string, { memo: string | null; journal_date: string }>();
  if (journalIds.length > 0) {
    const { data: journals } = await supabase
      .from('journals')
      .select('id, memo, journal_date')
      .in('id', journalIds);

    for (const j of journals ?? []) {
      journalMap.set(j.id, { memo: j.memo, journal_date: j.journal_date });
    }
  }

  // Build reconciled rows
  const reconciled: ReconciledBankLine[] = [];
  for (const bl of bankLines ?? []) {
    const match = matchMap.get(bl.id);
    if (!match) continue;

    const journal = journalMap.get(match.journal_id);
    reconciled.push({
      id: bl.id,
      txn_date: bl.txn_date,
      description: bl.description,
      reference: bl.reference,
      amount_pence: Number(bl.amount_pence),
      match_id: match.id,
      match_type: match.match_type,
      match_provider: match.provider,
      journal_id: match.journal_id,
      journal_memo: journal?.memo ?? null,
      journal_date: journal?.journal_date ?? null,
    });
  }

  return { data: reconciled, error: null };
}

/* ------------------------------------------------------------------ */
/*  suggestMatches                                                     */
/* ------------------------------------------------------------------ */

export async function suggestMatches(
  bankLineId: string
): Promise<{ data: MatchCandidate[]; error: string | null }> {
  const supabase = await createClient();

  // 1. Fetch the bank line
  const { data: bankLine, error: blErr } = await supabase
    .from('bank_lines')
    .select('id, txn_date, description, reference, amount_pence, organisation_id')
    .eq('id', bankLineId)
    .single();

  if (blErr || !bankLine) {
    return { data: [], error: blErr?.message ?? 'Bank line not found.' };
  }

  const orgId = bankLine.organisation_id as string;

  // 2. Fetch already-matched journal IDs (exclude them from candidates)
  const { data: existingMatches } = await supabase
    .from('bank_reconciliation_matches')
    .select('journal_id')
    .eq('organisation_id', orgId);

  const matchedJournalIds = new Set(
    (existingMatches ?? []).map((m) => m.journal_id)
  );

  // 3. Fetch posted journals within ±14 days
  const bankDate = new Date(bankLine.txn_date);
  const dateFrom = new Date(bankDate.getTime() - 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const dateTo = new Date(bankDate.getTime() + 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const { data: journals, error: jErr } = await supabase
    .from('journals')
    .select('id, journal_date, memo')
    .eq('organisation_id', orgId)
    .eq('status', 'posted')
    .gte('journal_date', dateFrom)
    .lte('journal_date', dateTo);

  if (jErr) return { data: [], error: jErr.message };

  const candidateJournals = (journals ?? []).filter(
    (j) => !matchedJournalIds.has(j.id)
  );

  if (candidateJournals.length === 0) {
    return { data: [], error: null };
  }

  // 4. For each candidate journal, compute the relevant amount
  //    For incoming bank lines (positive amount): look for Dr Bank lines
  //    For outgoing bank lines (negative amount): look for Cr Bank lines
  const journalIds = candidateJournals.map((j) => j.id);
  const { data: jLines, error: jlErr } = await supabase
    .from('journal_lines')
    .select('journal_id, debit_pence, credit_pence')
    .in('journal_id', journalIds);

  if (jlErr) return { data: [], error: jlErr.message };

  // Sum total debits per journal (represents the journal's total movement)
  const journalAmountMap = new Map<string, number>();
  for (const jl of jLines ?? []) {
    const current = journalAmountMap.get(jl.journal_id) ?? 0;
    journalAmountMap.set(
      jl.journal_id,
      current + Number(jl.debit_pence)
    );
  }

  // 5. Score and rank
  const bankLineForMatching = {
    id: bankLine.id,
    txn_date: bankLine.txn_date,
    amount_pence: Number(bankLine.amount_pence),
    description: bankLine.description,
    reference: bankLine.reference,
  };

  const candidates: MatchCandidate[] = candidateJournals.map((j) => {
    const journalForMatching = {
      id: j.id,
      journal_date: j.journal_date,
      memo: j.memo,
      amountPence: journalAmountMap.get(j.id) ?? 0,
    };

    return buildMatchCandidate(bankLineForMatching, journalForMatching);
  });

  return { data: rankCandidates(candidates, 3), error: null };
}

/* ------------------------------------------------------------------ */
/*  createMatch                                                        */
/* ------------------------------------------------------------------ */

export async function createMatch(params: {
  bankLineId: string;
  journalId: string;
  matchType: 'manual' | 'payout' | 'auto';
  provider?: string | null;
}): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { bankLineId, journalId, matchType, provider } = params;

  const { user, role, orgId } = await getActiveOrg();

  try { assertCanPerform(role, 'create', 'reconciliation'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();

  // Validate bank line belongs to org
  const { data: bl } = await supabase
    .from('bank_lines')
    .select('organisation_id')
    .eq('id', bankLineId)
    .single();

  if (!bl || bl.organisation_id !== orgId) {
    return { success: false, error: 'Bank line not found or does not belong to this organisation.' };
  }

  // Validate journal belongs to org
  const { data: journal } = await supabase
    .from('journals')
    .select('organisation_id')
    .eq('id', journalId)
    .single();

  if (!journal || journal.organisation_id !== orgId) {
    return { success: false, error: 'Journal not found or does not belong to this organisation.' };
  }

  // Insert (unique constraint on bank_line_id prevents duplicates)
  const { error: insertErr } = await supabase
    .from('bank_reconciliation_matches')
    .insert({
      organisation_id: orgId,
      bank_line_id: bankLineId,
      journal_id: journalId,
      match_type: matchType,
      provider: provider ?? null,
      matched_by: user.id,
    });

  if (insertErr) {
    if (insertErr.message.includes('unique') || insertErr.message.includes('duplicate')) {
      return { success: false, error: 'This bank line is already matched.' };
    }
    return { success: false, error: insertErr.message };
  }

  // Mark bank line as reconciled
  await supabase
    .from('bank_lines')
    .update({ reconciled: true, reconciled_at: new Date().toISOString() })
    .eq('id', bankLineId);

  // Invalidate report caches since a bank line was reconciled
  invalidateOrgReportCache(orgId);

  return { success: true, error: null };
}

/* ------------------------------------------------------------------ */
/*  removeMatch                                                        */
/* ------------------------------------------------------------------ */

export async function removeMatch(
  matchId: string
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { role } = await getActiveOrg();

  try { assertCanPerform(role, 'delete', 'reconciliation'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();

  // Fetch the match to get the bank_line_id before deleting
  const { data: match } = await supabase
    .from('bank_reconciliation_matches')
    .select('bank_line_id')
    .eq('id', matchId)
    .single();

  const { error } = await supabase
    .from('bank_reconciliation_matches')
    .delete()
    .eq('id', matchId);

  if (error) return { success: false, error: error.message };

  // Clear reconciled flag on the bank line
  if (match?.bank_line_id) {
    await supabase
      .from('bank_lines')
      .update({ reconciled: false, reconciled_at: null })
      .eq('id', match.bank_line_id);
  }

  return { success: true, error: null };
}

/* ------------------------------------------------------------------ */
/*  getReconciliationStats                                             */
/* ------------------------------------------------------------------ */

export async function getReconciliationStats(
  bankAccountId: string
): Promise<{ data: ReconciliationStats | null; error: string | null }> {
  const supabase = await createClient();

  // All bank lines for this account
  const { data: bankLines, error: blErr } = await supabase
    .from('bank_lines')
    .select('id, amount_pence')
    .eq('bank_account_id', bankAccountId);

  if (blErr) return { data: null, error: blErr.message };

  const allIds = (bankLines ?? []).map((bl) => bl.id);
  if (allIds.length === 0) {
    return {
      data: {
        totalLines: 0,
        reconciledCount: 0,
        unreconciledCount: 0,
        unreconciledAmountPence: 0,
      },
      error: null,
    };
  }

  // Matched bank line IDs
  const { data: matches } = await supabase
    .from('bank_reconciliation_matches')
    .select('bank_line_id')
    .in('bank_line_id', allIds);

  const matchedIds = new Set((matches ?? []).map((m) => m.bank_line_id));

  const totalLines = allIds.length;
  const reconciledCount = matchedIds.size;
  const unreconciledCount = totalLines - reconciledCount;
  const unreconciledAmountPence = (bankLines ?? [])
    .filter((bl) => !matchedIds.has(bl.id))
    .reduce((sum, bl) => sum + Math.abs(Number(bl.amount_pence)), 0);

  return {
    data: {
      totalLines,
      reconciledCount,
      unreconciledCount,
      unreconciledAmountPence,
    },
    error: null,
  };
}

/* ================================================================== */
/*  STATEMENT RECONCILIATION                                           */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  getLastReconciliation                                              */
/* ------------------------------------------------------------------ */

export async function getLastReconciliation(
  bankAccountId: string,
): Promise<{ data: ReconciliationRow | null; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('reconciliations')
    .select('*')
    .eq('bank_account_id', bankAccountId)
    .eq('locked', true)
    .order('statement_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { data: null, error: error.message };

  if (!data) return { data: null, error: null };

  return {
    data: {
      id: data.id,
      organisation_id: data.organisation_id,
      bank_account_id: data.bank_account_id,
      statement_date: data.statement_date,
      statement_closing_balance_pence: Number(data.statement_closing_balance_pence),
      opening_balance_pence: Number(data.opening_balance_pence),
      cleared_balance_pence: data.cleared_balance_pence != null ? Number(data.cleared_balance_pence) : null,
      lines_cleared: data.lines_cleared,
      reconciled_by: data.reconciled_by,
      reconciled_at: data.reconciled_at,
      locked: data.locked,
      created_at: data.created_at,
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  startReconciliation                                                */
/* ------------------------------------------------------------------ */

export async function startReconciliation(params: {
  bankAccountId: string;
  statementDate: string;
  statementClosingBalancePence: number;
}): Promise<{ data: ReconciliationRow | null; error: string | null }> {
  await assertWriteAllowed();
  const { bankAccountId, statementDate, statementClosingBalancePence } = params;
  const { user, role, orgId } = await getActiveOrg();

  try {
    assertCanPerform(role, 'create', 'reconciliation');
  } catch (e) {
    return { data: null, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  // Cannot reconcile future dates
  const today = new Date().toISOString().slice(0, 10);
  if (statementDate > today) {
    return { data: null, error: 'Cannot reconcile a future date.' };
  }

  // Derive opening balance from last locked reconciliation
  const { data: lastRec } = await getLastReconciliation(bankAccountId);
  const openingBalancePence = lastRec?.statement_closing_balance_pence ?? 0;

  const supabase = await createClient();

  // Check for existing unlocked reconciliation for this account
  const { data: existing } = await supabase
    .from('reconciliations')
    .select('id')
    .eq('bank_account_id', bankAccountId)
    .eq('locked', false)
    .maybeSingle();

  if (existing) {
    // Delete old draft reconciliation and unlink its bank lines
    await supabase
      .from('bank_lines')
      .update({ reconciliation_id: null })
      .eq('reconciliation_id', existing.id);

    await supabase
      .from('reconciliations')
      .delete()
      .eq('id', existing.id);
  }

  const { data, error } = await supabase
    .from('reconciliations')
    .insert({
      organisation_id: orgId,
      bank_account_id: bankAccountId,
      statement_date: statementDate,
      statement_closing_balance_pence: statementClosingBalancePence,
      opening_balance_pence: openingBalancePence,
      reconciled_by: user.id,
    })
    .select('*')
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: {
      id: data.id,
      organisation_id: data.organisation_id,
      bank_account_id: data.bank_account_id,
      statement_date: data.statement_date,
      statement_closing_balance_pence: Number(data.statement_closing_balance_pence),
      opening_balance_pence: Number(data.opening_balance_pence),
      cleared_balance_pence: null,
      lines_cleared: 0,
      reconciled_by: data.reconciled_by,
      reconciled_at: data.reconciled_at,
      locked: data.locked,
      created_at: data.created_at,
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  getClearableLines                                                  */
/* ------------------------------------------------------------------ */

export async function getClearableLines(params: {
  bankAccountId: string;
  statementDate: string;
  reconciliationId: string;
}): Promise<{ data: ClearableBankLine[]; error: string | null }> {
  const { bankAccountId, statementDate, reconciliationId } = params;
  const supabase = await createClient();

  // Fetch all bank lines up to the statement date that are either:
  // - Not yet assigned to any reconciliation, OR
  // - Already assigned to THIS reconciliation (cleared in this session)
  const { data, error } = await supabase
    .from('bank_lines')
    .select('id, txn_date, description, reference, amount_pence, balance_pence, allocated, reconciliation_id')
    .eq('bank_account_id', bankAccountId)
    .lte('txn_date', statementDate)
    .or(`reconciliation_id.is.null,reconciliation_id.eq.${reconciliationId}`)
    .order('txn_date', { ascending: true });

  if (error) return { data: [], error: error.message };

  const lines: ClearableBankLine[] = (data ?? []).map((l) => ({
    id: l.id,
    txn_date: l.txn_date,
    description: l.description,
    reference: l.reference,
    amount_pence: Number(l.amount_pence),
    balance_pence: l.balance_pence != null ? Number(l.balance_pence) : null,
    allocated: l.allocated ?? false,
    cleared: l.reconciliation_id === reconciliationId,
  }));

  return { data: lines, error: null };
}

/* ------------------------------------------------------------------ */
/*  toggleClearLine                                                    */
/* ------------------------------------------------------------------ */

export async function toggleClearLine(params: {
  reconciliationId: string;
  bankLineId: string;
  cleared: boolean;
}): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { reconciliationId, bankLineId, cleared } = params;
  const { role } = await getActiveOrg();

  try {
    assertCanPerform(role, 'create', 'reconciliation');
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const supabase = await createClient();

  // Verify reconciliation is not locked
  const { data: rec } = await supabase
    .from('reconciliations')
    .select('locked')
    .eq('id', reconciliationId)
    .single();

  if (!rec) return { success: false, error: 'Reconciliation not found.' };
  if (rec.locked) return { success: false, error: 'This reconciliation is locked.' };

  const { error } = await supabase
    .from('bank_lines')
    .update({ reconciliation_id: cleared ? reconciliationId : null })
    .eq('id', bankLineId);

  if (error) return { success: false, error: error.message };

  return { success: true, error: null };
}

/* ------------------------------------------------------------------ */
/*  getReconciliationSummary                                           */
/* ------------------------------------------------------------------ */

export async function getReconciliationSummary(params: {
  reconciliationId: string;
  bankAccountId: string;
  statementDate: string;
}): Promise<{ data: ReconciliationSummary | null; error: string | null }> {
  const { reconciliationId, bankAccountId, statementDate } = params;
  const supabase = await createClient();

  // Fetch the reconciliation record for opening + statement balance
  const { data: rec } = await supabase
    .from('reconciliations')
    .select('opening_balance_pence, statement_closing_balance_pence')
    .eq('id', reconciliationId)
    .single();

  if (!rec) return { data: null, error: 'Reconciliation not found.' };

  const openingBalancePence = Number(rec.opening_balance_pence);
  const statementBalancePence = Number(rec.statement_closing_balance_pence);

  // Sum cleared lines
  const { data: clearedLines, error } = await supabase
    .from('bank_lines')
    .select('amount_pence')
    .eq('reconciliation_id', reconciliationId);

  if (error) return { data: null, error: error.message };

  const clearedTotalPence = (clearedLines ?? []).reduce(
    (sum, l) => sum + Number(l.amount_pence),
    0,
  );

  // Total clearable lines
  const { count } = await supabase
    .from('bank_lines')
    .select('id', { count: 'exact', head: true })
    .eq('bank_account_id', bankAccountId)
    .lte('txn_date', statementDate)
    .or(`reconciliation_id.is.null,reconciliation_id.eq.${reconciliationId}`);

  const clearedBalance = openingBalancePence + clearedTotalPence;
  const differencePence = statementBalancePence - clearedBalance;

  return {
    data: {
      openingBalancePence,
      clearedTotalPence,
      statementBalancePence,
      differencePence,
      clearedCount: clearedLines?.length ?? 0,
      totalLines: count ?? 0,
      isBalanced: differencePence === 0,
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  finalizeReconciliation                                             */
/* ------------------------------------------------------------------ */

export async function finalizeReconciliation(
  reconciliationId: string,
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { user, role } = await getActiveOrg();

  try {
    assertCanPerform(role, 'create', 'reconciliation');
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const supabase = await createClient();

  // Fetch the reconciliation
  const { data: rec } = await supabase
    .from('reconciliations')
    .select('*')
    .eq('id', reconciliationId)
    .single();

  if (!rec) return { success: false, error: 'Reconciliation not found.' };
  if (rec.locked) return { success: false, error: 'Already finalized.' };

  // Compute cleared balance
  const { data: clearedLines } = await supabase
    .from('bank_lines')
    .select('amount_pence')
    .eq('reconciliation_id', reconciliationId);

  const clearedTotal = (clearedLines ?? []).reduce(
    (sum, l) => sum + Number(l.amount_pence),
    0,
  );

  const openingBalance = Number(rec.opening_balance_pence);
  const statementBalance = Number(rec.statement_closing_balance_pence);
  const clearedBalance = openingBalance + clearedTotal;
  const difference = statementBalance - clearedBalance;

  if (difference !== 0) {
    return {
      success: false,
      error: `Cannot finalize: difference is £${(Math.abs(difference) / 100).toFixed(2)}. Must be zero.`,
    };
  }

  // Lock it
  const { error: updateErr } = await supabase
    .from('reconciliations')
    .update({
      locked: true,
      reconciled_at: new Date().toISOString(),
      reconciled_by: user.id,
      cleared_balance_pence: clearedBalance,
      lines_cleared: clearedLines?.length ?? 0,
    })
    .eq('id', reconciliationId);

  if (updateErr) return { success: false, error: updateErr.message };

  // Mark all cleared bank lines as reconciled
  await supabase
    .from('bank_lines')
    .update({ reconciled: true, reconciled_at: new Date().toISOString() })
    .eq('reconciliation_id', reconciliationId);

  return { success: true, error: null };
}

/* ------------------------------------------------------------------ */
/*  undoReconciliation (admin only)                                    */
/* ------------------------------------------------------------------ */

export async function undoReconciliation(
  reconciliationId: string,
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { role } = await getActiveOrg();

  if (role !== 'admin') {
    return { success: false, error: 'Only admins can undo reconciliations.' };
  }

  const supabase = await createClient();

  // Unlink bank lines
  await supabase
    .from('bank_lines')
    .update({ reconciliation_id: null, reconciled: false, reconciled_at: null })
    .eq('reconciliation_id', reconciliationId);

  // Delete the reconciliation record
  const { error } = await supabase
    .from('reconciliations')
    .delete()
    .eq('id', reconciliationId);

  if (error) return { success: false, error: error.message };

  return { success: true, error: null };
}

/* ------------------------------------------------------------------ */
/*  getReconciliationHistory                                           */
/* ------------------------------------------------------------------ */

export async function getReconciliationHistory(
  bankAccountId: string,
): Promise<{ data: ReconciliationWithMeta[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('reconciliations')
    .select('*')
    .eq('bank_account_id', bankAccountId)
    .order('statement_date', { ascending: false });

  if (error) return { data: [], error: error.message };

  // Fetch user names
  const userIds = [...new Set((data ?? []).map((r) => r.reconciled_by).filter(Boolean))];
  const nameMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds);
    for (const p of profiles ?? []) {
      nameMap.set(p.id, p.full_name ?? '');
    }
  }

  // Fetch bank account name
  const { data: ba } = await supabase
    .from('bank_accounts')
    .select('name')
    .eq('id', bankAccountId)
    .single();

  const rows: ReconciliationWithMeta[] = (data ?? []).map((r) => ({
    id: r.id,
    organisation_id: r.organisation_id,
    bank_account_id: r.bank_account_id,
    statement_date: r.statement_date,
    statement_closing_balance_pence: Number(r.statement_closing_balance_pence),
    opening_balance_pence: Number(r.opening_balance_pence),
    cleared_balance_pence: r.cleared_balance_pence != null ? Number(r.cleared_balance_pence) : null,
    lines_cleared: r.lines_cleared,
    reconciled_by: r.reconciled_by,
    reconciled_at: r.reconciled_at,
    locked: r.locked,
    created_at: r.created_at,
    reconciled_by_name: r.reconciled_by ? (nameMap.get(r.reconciled_by) ?? null) : null,
    bank_account_name: ba?.name ?? 'Unknown',
  }));

  return { data: rows, error: null };
}

/* ------------------------------------------------------------------ */
/*  getClearingReconciliation                                          */
/* ------------------------------------------------------------------ */

export async function getClearingReconciliation(
  orgId: string
): Promise<{ data: ClearingProviderRow[]; error: string | null }> {
  const supabase = await createClient();

  // 1. Fetch giving_platforms to get clearing account mappings
  const { data: platforms, error: platErr } = await supabase
    .from('giving_platforms')
    .select('provider, clearing_account_id')
    .eq('organisation_id', orgId);

  if (platErr) return { data: [], error: platErr.message };

  if (!platforms || platforms.length === 0) {
    return { data: [], error: null };
  }

  // Fetch account names
  const clearingIds = platforms.map((p) => p.clearing_account_id);
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name')
    .in('id', clearingIds);

  const accountNameMap = new Map(
    (accounts ?? []).map((a) => [a.id, a.name as string])
  );

  const providerMap: ProviderClearingMap[] = platforms.map((p) => ({
    provider: p.provider,
    clearingAccountId: p.clearing_account_id,
    clearingAccountName: accountNameMap.get(p.clearing_account_id) ?? 'Unknown',
  }));

  // 2. Fetch all journal lines touching any clearing account (posted journals only)
  const { data: journalLines, error: jlErr } = await supabase
    .from('journal_lines')
    .select('journal_id, account_id, debit_pence, credit_pence')
    .in('account_id', clearingIds);

  if (jlErr) return { data: [], error: jlErr.message };

  // Fetch the corresponding journal metadata for memo/date/status filtering
  const journalIds = [...new Set((journalLines ?? []).map((jl) => jl.journal_id))];
  let journalMetaMap = new Map<string, { memo: string | null; journal_date: string; status: string }>();
  if (journalIds.length > 0) {
    const { data: journals } = await supabase
      .from('journals')
      .select('id, memo, journal_date, status')
      .in('id', journalIds);

    for (const j of journals ?? []) {
      journalMetaMap.set(j.id, { memo: j.memo, journal_date: j.journal_date, status: j.status });
    }
  }

  // Filter to only posted journals
  const filteredLines: JournalLineInput[] = (journalLines ?? [])
    .filter((jl) => {
      const meta = journalMetaMap.get(jl.journal_id);
      return meta && meta.status === 'posted';
    })
    .map((jl) => {
      const meta = journalMetaMap.get(jl.journal_id)!;
      return {
        journal_id: jl.journal_id,
        journal_date: meta.journal_date,
        journal_memo: meta.memo,
        account_id: jl.account_id,
        debit_pence: Number(jl.debit_pence),
        credit_pence: Number(jl.credit_pence),
      };
    });

  // 3. Fetch matched journal IDs
  const { data: matchRows } = await supabase
    .from('bank_reconciliation_matches')
    .select('journal_id')
    .eq('organisation_id', orgId);

  const matchedJournalIds = new Set(
    (matchRows ?? []).map((m) => m.journal_id)
  );

  // 4. Compute clearing balances
  const rows = computeClearingBalances({
    journalLines: filteredLines,
    matchedJournalIds,
    providerMap,
  });

  return { data: rows, error: null };
}

/* ================================================================== */
/*  GL-BASED RECONCILIATION                                            */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  getBankGLBalance — compute bank balance from journal_lines          */
/* ------------------------------------------------------------------ */

export async function getBankGLBalance(
  bankAccountId: string,
): Promise<{ data: GLReconciliationData | null; error: string | null }> {
  const supabase = await createClient();
  const { orgId } = await getActiveOrg();

  // Get the linked GL account for this bank account
  const { data: ba } = await supabase
    .from('bank_accounts')
    .select('linked_account_id')
    .eq('id', bankAccountId)
    .eq('organisation_id', orgId)
    .single();

  if (!ba?.linked_account_id) {
    return { data: null, error: 'Bank account has no linked GL account.' };
  }

  // Sum all posted journal_lines touching this account
  // Asset accounts: balance = debit - credit
  const { data: postedJournals } = await supabase
    .from('journals')
    .select('id')
    .eq('organisation_id', orgId)
    .eq('status', 'posted');

  if (!postedJournals || postedJournals.length === 0) {
    return {
      data: {
        glBalancePence: 0,
        statementBalancePence: null,
        differencePence: 0,
        isReconciled: true,
      },
      error: null,
    };
  }

  const journalIds = postedJournals.map((j) => j.id);

  const { data: lines } = await supabase
    .from('journal_lines')
    .select('debit_pence, credit_pence')
    .eq('account_id', ba.linked_account_id)
    .in('journal_id', journalIds);

  let glBalance = 0;
  for (const l of lines ?? []) {
    glBalance += Number(l.debit_pence) - Number(l.credit_pence);
  }

  // Get latest bank statement balance
  const { data: latestLine } = await supabase
    .from('bank_lines')
    .select('balance_pence')
    .eq('bank_account_id', bankAccountId)
    .not('balance_pence', 'is', null)
    .order('txn_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const statementBalance = latestLine ? Number(latestLine.balance_pence) : null;
  const difference = statementBalance !== null ? statementBalance - glBalance : 0;

  return {
    data: {
      glBalancePence: glBalance,
      statementBalancePence: statementBalance,
      differencePence: difference,
      isReconciled: difference === 0,
    },
    error: null,
  };
}
