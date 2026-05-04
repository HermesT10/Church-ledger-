'use server';

import { revalidatePath } from 'next/cache';
import { assertWriteAllowed } from '@/lib/demo';
import { logAuditEvent } from '@/lib/audit';
import { invalidateOrgReportCache } from '@/lib/cache';
import { getActiveOrg } from '@/lib/org';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { postManualTransactionToLedger } from '@/lib/transactions/posting';
import { buildMatchSuggestion } from '@/lib/transactions/matching';
import { reconcileBankLineAsDonation } from '@/lib/reconciliation/actions';
import {
  createLettingsCharge,
  findOrCreateLettingsHirerForReconciliation,
  reconcileLettingsChargeFromBankLine,
} from '@/lib/lettings/actions';
import type { LettingsPostingOverrides } from '@/lib/lettings/actions.types';
import { validateBankLedgerLink } from './ledger-link';
import {
  type BankReconciliationMatchSuggestion,
  type BankReconciliationSourceType,
  compareLettingsSuggestions,
  lettingsChargeToSuggestion,
  suggestMatchesForBankTransaction,
  validateSplitTotal,
  type BankTransactionForMatching,
  type LettingsChargeForRanking,
} from './reconciliation-matching';
import type { ManualTransactionInput, ManualTransactionLineInput, ManualTransactionRow } from '@/lib/transactions/types';
import type {
  CreateAndReconcileInput,
  ExclusionReason,
  ReconciliationQueueCounts,
  ReconciliationQueueFilter,
  ReconciliationWorkspaceBankLine,
  ReconciliationWorkspaceData,
} from './reconciliation-workspace-actions.types';

type ActionResult<T = null> = { data: T | null; error: string | null };

const EMPTY_COUNTS: ReconciliationQueueCounts = {
  needs_reconciliation: 0,
  reconciled: 0,
  excluded: 0,
  all: 0,
};

function permissionError(error: unknown): string {
  return error instanceof PermissionError ? error.message : 'Permission denied.';
}

function sourceLabel(sourceType: BankReconciliationSourceType): string {
  return sourceType.replaceAll('_', ' ');
}

function optionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeAlias(value: string | null | undefined) {
  return optionalText(value)?.toLowerCase().replace(/[^a-z0-9]+/g, '') ?? null;
}

async function assertReconciliationPermission(action: 'read' | 'create' | 'update') {
  const ctx = await getActiveOrg();
  assertCanPerform(ctx.role, action, 'reconciliation');
  return ctx;
}

async function getOpenBankLine(bankTransactionId: string, orgId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bank_lines')
    .select('id, organisation_id, bank_account_id, txn_date, description, additional_description, display_description, reference, amount_pence, balance_pence, allocated, reconciled, status, posted_journal_id, raw')
    .eq('id', bankTransactionId)
    .eq('organisation_id', orgId)
    .maybeSingle();

  if (error || !data) return { data: null, error: error?.message ?? 'Bank transaction not found.' };
  if (data.posted_journal_id || data.allocated || data.reconciled || data.status === 'excluded') {
    return { data: null, error: 'This bank transaction has already been posted, matched, reconciled, allocated, or excluded.' };
  }
  return { data, error: null };
}

function applyQueueFilter<T extends {
  status: string | null;
  reconciled: boolean;
  allocated: boolean;
  posted_journal_id: string | null;
  matched_source_type?: string | null;
}>(query: T[], filter: ReconciliationQueueFilter): T[] {
  return query.filter((line) => {
    const status = String(line.status ?? 'unmatched');
    const excluded = status === 'excluded' || line.matched_source_type === 'excluded';
    const reconciled = line.reconciled || status === 'reconciled' || Boolean(line.posted_journal_id);
    const duplicate = status === 'duplicate';
    const needsAction = !duplicate
      && !excluded
      && !reconciled
      && !line.allocated
      && ['unmatched', 'suggested_match', 'needs_review'].includes(status);

    if (filter === 'needs_reconciliation') return needsAction;
    if (filter === 'reconciled') return !duplicate && reconciled;
    if (filter === 'excluded') return !duplicate && excluded;
    return !duplicate;
  });
}

function countQueueFilters(lines: ReconciliationWorkspaceBankLine[]): ReconciliationQueueCounts {
  return {
    needs_reconciliation: applyQueueFilter(lines, 'needs_reconciliation').length,
    reconciled: applyQueueFilter(lines, 'reconciled').length,
    excluded: applyQueueFilter(lines, 'excluded').length,
    all: applyQueueFilter(lines, 'all').length,
  };
}

async function assertNoExistingBankMatch(bankTransactionId: string, orgId: string): Promise<string | null> {
  const supabase = await createClient();
  const [{ data: brm }, { data: txMatch }] = await Promise.all([
    supabase
      .from('bank_reconciliation_matches')
      .select('id')
      .eq('workspace_id', orgId)
      .eq('bank_transaction_id', bankTransactionId)
      .eq('status', 'confirmed')
      .maybeSingle(),
    supabase
      .from('transaction_matches')
      .select('id')
      .eq('organisation_id', orgId)
      .eq('bank_line_id', bankTransactionId)
      .eq('match_status', 'confirmed')
      .maybeSingle(),
  ]);
  if (brm || txMatch) return 'This bank transaction is already matched.';
  return null;
}

async function assertSourceAvailable(sourceType: BankReconciliationSourceType, sourceId: string, orgId: string): Promise<string | null> {
  if (sourceType === 'bank_rule' || sourceType === 'excluded' || sourceType === 'lettings_charge') return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from('bank_reconciliation_matches')
    .select('id')
    .eq('workspace_id', orgId)
    .eq('matched_source_type', sourceType)
    .eq('matched_source_id', sourceId)
    .eq('status', 'confirmed')
    .maybeSingle();
  if (data) return `This ${sourceLabel(sourceType)} is already matched.`;
  return null;
}

async function insertConfirmedMatch(params: {
  orgId: string;
  userId: string;
  bankTransactionId: string;
  sourceType: BankReconciliationSourceType;
  sourceId: string;
  confidenceScore?: number;
  matchReason?: string[];
  journalId?: string | null;
}) {
  const admin = createAdminClient();
  return admin
    .from('bank_reconciliation_matches')
    .insert({
      organisation_id: params.orgId,
      workspace_id: params.orgId,
      bank_line_id: params.bankTransactionId,
      bank_transaction_id: params.bankTransactionId,
      journal_id: params.journalId ?? (params.sourceType === 'journal' ? params.sourceId : null),
      matched_source_type: params.sourceType,
      matched_source_id: params.sourceId,
      match_type: 'manual',
      provider: params.sourceType,
      confidence_score: params.confidenceScore ?? 1,
      match_reason: (params.matchReason ?? ['confirmed by user']).join(', '),
      status: 'confirmed',
      matched_by: params.userId,
      confirmed_by: params.userId,
      confirmed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
}

async function markBankLineReconciled(params: {
  orgId: string;
  userId: string;
  bankTransactionId: string;
  sourceType: BankReconciliationSourceType;
  sourceId: string;
  journalId?: string | null;
}) {
  const admin = createAdminClient();
  return admin
    .from('bank_lines')
    .update({
      reconciled: true,
      reconciled_at: new Date().toISOString(),
      reconciled_by: params.userId,
      status: 'reconciled',
      matched_source_type: params.sourceType,
      matched_source_id: params.sourceId,
      posted_journal_id: params.journalId ?? null,
    })
    .eq('id', params.bankTransactionId)
    .eq('organisation_id', params.orgId);
}

async function finalizeLettingsPaymentReconciliation(params: {
  orgId: string;
  userId: string;
  bankTransactionId: string;
  chargeId: string;
  reconcileResult: { paymentId: string; journalId: string };
  confidenceScore?: number;
  matchReason?: string[];
  auditVariant: 'confirm' | 'create_from_bank';
}): Promise<ActionResult<{ matchId: string; journalId: string | null }>> {
  const admin = createAdminClient();
  const { data: match, error: matchError } = await insertConfirmedMatch({
    orgId: params.orgId,
    userId: params.userId,
    bankTransactionId: params.bankTransactionId,
    sourceType: 'lettings_payment',
    sourceId: params.reconcileResult.paymentId,
    confidenceScore: params.confidenceScore ?? 1,
    matchReason: params.matchReason ?? ['confirmed Lettings payment match'],
    journalId: params.reconcileResult.journalId,
  });
  if (matchError || !match) {
    await admin.from('journal_lines').delete().eq('journal_id', params.reconcileResult.journalId);
    await admin.from('journals').delete().eq('id', params.reconcileResult.journalId);
    await admin.from('lettings_payments').delete().eq('id', params.reconcileResult.paymentId).eq('organisation_id', params.orgId);
    return { data: null, error: matchError?.message ?? 'Failed to create reconciliation match.' };
  }

  const { error: bankUpdateError } = await markBankLineReconciled({
    orgId: params.orgId,
    userId: params.userId,
    bankTransactionId: params.bankTransactionId,
    sourceType: 'lettings_payment',
    sourceId: params.reconcileResult.paymentId,
    journalId: params.reconcileResult.journalId,
  });
  if (bankUpdateError) {
    await admin.from('bank_reconciliation_matches').delete().eq('id', match.id);
    await admin.from('journal_lines').delete().eq('journal_id', params.reconcileResult.journalId);
    await admin.from('journals').delete().eq('id', params.reconcileResult.journalId);
    await admin.from('lettings_payments').delete().eq('id', params.reconcileResult.paymentId).eq('organisation_id', params.orgId);
    return { data: null, error: bankUpdateError.message };
  }

  if (params.auditVariant === 'create_from_bank') {
    await logAuditEvent({
      orgId: params.orgId,
      userId: params.userId,
      action: 'bank_reconciliation_create_lettings_from_bank',
      entityType: 'bank_line',
      entityId: params.bankTransactionId,
      metadata: {
        chargeId: params.chargeId,
        paymentId: params.reconcileResult.paymentId,
        journalId: params.reconcileResult.journalId,
      },
    });
  } else {
    await logAuditEvent({
      orgId: params.orgId,
      userId: params.userId,
      action: 'bank_reconciliation_confirm_lettings_match',
      entityType: 'bank_line',
      entityId: params.bankTransactionId,
      metadata: {
        chargeId: params.chargeId,
        paymentId: params.reconcileResult.paymentId,
        journalId: params.reconcileResult.journalId,
      },
    });
  }

  revalidatePath('/reconciliation');
  revalidatePath('/lettings');
  invalidateOrgReportCache(params.orgId);
  return { data: { matchId: match.id, journalId: params.reconcileResult.journalId }, error: null };
}

export async function getReconciliationWorkspaceData(
  bankAccountId?: string | null,
  filter: ReconciliationQueueFilter = 'needs_reconciliation',
): Promise<{ data: ReconciliationWorkspaceData | null; error: string | null }> {
  let ctx;
  try {
    ctx = await assertReconciliationPermission('read');
  } catch (error) {
    return { data: null, error: permissionError(error) };
  }

  const supabase = await createClient();
  const { data: accounts, error: accountError } = await supabase
    .from('bank_accounts')
    .select('id, name')
    .eq('organisation_id', ctx.orgId)
    .eq('status', 'active')
    .order('name');

  if (accountError) return { data: null, error: accountError.message };

  const selectedBankAccountId = bankAccountId || accounts?.[0]?.id || null;
  if (!selectedBankAccountId) {
    return {
      data: {
        bankAccounts: [],
        selectedBankAccountId: null,
        selectedBankAccountLedgerLink: null,
        filter,
        counts: EMPTY_COUNTS,
        transactions: [],
      },
      error: null,
    };
  }

  const ledgerLink = await validateBankLedgerLink(selectedBankAccountId, ctx.orgId);

  const { data: lines, error: lineError } = await supabase
    .from('bank_lines')
    .select('id, bank_account_id, txn_date, transaction_time, description, additional_description, display_description, reference, amount, direction, money_in, money_out, amount_pence, balance_pence, running_balance, status, reconciled, allocated, posted_journal_id, matched_source_type, matched_source_id, raw')
    .eq('organisation_id', ctx.orgId)
    .eq('bank_account_id', selectedBankAccountId)
    .order('txn_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500);

  if (lineError) return { data: null, error: lineError.message };
  const allLines = (lines ?? []).map((line) => ({
    ...line,
    amount_pence: Number(line.amount_pence),
    amount: line.amount == null ? null : Number(line.amount),
    direction: line.direction === 'in' || line.direction === 'out' ? line.direction : null,
    money_in: line.money_in == null ? null : Number(line.money_in),
    money_out: line.money_out == null ? null : Number(line.money_out),
    balance_pence: line.balance_pence == null ? null : Number(line.balance_pence),
    running_balance: line.running_balance == null ? null : Number(line.running_balance),
    reconciled: Boolean(line.reconciled),
    allocated: Boolean(line.allocated),
    posted_journal_id: line.posted_journal_id ?? null,
    status: line.status ?? 'unmatched',
    raw: (line.raw ?? null) as Record<string, unknown> | null,
  }));
  const counts = countQueueFilters(allLines);

  return {
    data: {
      bankAccounts: (accounts ?? []).map((account) => ({ id: account.id, name: account.name })),
      selectedBankAccountId,
      selectedBankAccountLedgerLink: ledgerLink,
      filter,
      counts,
      transactions: applyQueueFilter(allLines, filter).slice(0, 100),
    },
    error: null,
  };
}

export async function getSuggestionsForBankTransaction(
  bankTransactionId: string,
): Promise<{ data: BankReconciliationMatchSuggestion[]; error: string | null }> {
  try {
    await assertReconciliationPermission('read');
  } catch (error) {
    return { data: [], error: permissionError(error) };
  }
  return suggestMatchesForBankTransaction(bankTransactionId);
}

/** Search outstanding lettings charges for manual match (reconciliation workspace). */
export async function listLettingsChargesForReconciliationSearch(
  bankTransactionId: string,
  query?: string | null,
): Promise<{ data: BankReconciliationMatchSuggestion[]; error: string | null }> {
  try {
    await assertReconciliationPermission('read');
  } catch (error) {
    return { data: [], error: permissionError(error) };
  }

  const { orgId } = await getActiveOrg();
  const supabase = await createClient();
  const { data: bankRow, error: bankError } = await supabase
    .from('bank_lines')
    .select('id, organisation_id, bank_account_id, txn_date, description, reference, amount_pence, balance_pence, allocated, reconciled, status')
    .eq('id', bankTransactionId)
    .eq('organisation_id', orgId)
    .maybeSingle();

  if (bankError || !bankRow) return { data: [], error: bankError?.message ?? 'Bank transaction not found.' };
  if (bankRow.reconciled || bankRow.allocated || bankRow.status === 'excluded') {
    return { data: [], error: null };
  }
  if (Number(bankRow.amount_pence) <= 0) return { data: [], error: null };

  const line: BankTransactionForMatching = {
    id: bankRow.id,
    organisation_id: bankRow.organisation_id,
    bank_account_id: bankRow.bank_account_id,
    txn_date: bankRow.txn_date,
    description: bankRow.description,
    reference: bankRow.reference,
    amount_pence: Number(bankRow.amount_pence),
    balance_pence: bankRow.balance_pence == null ? null : Number(bankRow.balance_pence),
  };

  const date = new Date(`${line.txn_date}T00:00:00Z`);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;

  const { data: charges, error: chError } = await supabase
    .from('lettings_charges')
    .select('id, period_year, period_month, description, expected_amount_pence, paid_amount_pence, outstanding_amount_pence, due_date, status, hirer:lettings_hirers(name, default_room_name)')
    .eq('organisation_id', orgId)
    .gte('period_year', year - 1)
    .lte('period_year', year + 1)
    .not('status', 'in', '("paid","waived","cancelled")')
    .limit(200);

  if (chError) return { data: [], error: chError.message };

  const filtered = (charges ?? []).filter((charge) => {
    const dist = (Number(charge.period_year) - year) * 12 + (Number(charge.period_month) - month);
    return Math.abs(dist) <= 6;
  });

  let suggestions = filtered.map((c) => lettingsChargeToSuggestion(line, c as LettingsChargeForRanking, month));
  const q = query?.trim().toLowerCase();
  if (q) {
    suggestions = suggestions.filter(
      (s) =>
        s.source_label.toLowerCase().includes(q) ||
        s.match_reason.some((r) => r.toLowerCase().includes(q)) ||
        s.source_id.toLowerCase().includes(q),
    );
  }

  suggestions = suggestions
    .filter((s) => s.confidence_score >= 0.15)
    .sort((a, b) => compareLettingsSuggestions(a, b, line))
    .slice(0, 40);

  return { data: suggestions, error: null };
}

async function confirmManualTransactionMatch(params: {
  bankTransactionId: string;
  sourceId: string;
  orgId: string;
  userId: string;
  confidenceScore: number;
  matchReason: string[];
}): Promise<ActionResult<{ matchId: string; journalId: string | null }>> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const [txRes, bankRes] = await Promise.all([
    supabase
      .from('manual_transactions')
      .select('*')
      .eq('id', params.sourceId)
      .eq('organisation_id', params.orgId)
      .maybeSingle(),
    supabase
      .from('bank_lines')
      .select('id, txn_date, description, reference, amount_pence, bank_account_id')
      .eq('id', params.bankTransactionId)
      .eq('organisation_id', params.orgId)
      .maybeSingle(),
  ]);

  if (!txRes.data) return { data: null, error: 'Manual transaction not found.' };
  if (!bankRes.data) return { data: null, error: 'Bank transaction not found.' };
  const tx = txRes.data as ManualTransactionRow;
  if (tx.posted_journal_id || tx.matched_bank_transaction_id) {
    return { data: null, error: 'This manual transaction is already matched or posted.' };
  }

  const suggestion = buildMatchSuggestion(tx, {
    id: bankRes.data.id,
    txn_date: bankRes.data.txn_date,
    description: bankRes.data.description,
    reference: bankRes.data.reference,
    amount_pence: Number(bankRes.data.amount_pence),
    bank_account_id: bankRes.data.bank_account_id,
  });

  const { data: txMatch, error: txMatchError } = await admin
    .from('transaction_matches')
    .insert({
      organisation_id: params.orgId,
      bank_line_id: params.bankTransactionId,
      manual_transaction_id: params.sourceId,
      match_status: 'confirmed',
      confidence_score: suggestion.confidence_score,
      confidence_label: suggestion.confidence_label,
      match_reason: suggestion.match_reason,
      confirmed_by: params.userId,
      confirmed_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (txMatchError || !txMatch) {
    return { data: null, error: txMatchError?.message ?? 'Failed to confirm manual transaction match.' };
  }

  await admin
    .from('manual_transactions')
    .update({
      status: 'matched',
      matched_bank_transaction_id: params.bankTransactionId,
      reconciled_at: new Date().toISOString(),
    })
    .eq('id', params.sourceId)
    .eq('organisation_id', params.orgId);

  const posted = await postManualTransactionToLedger({
    transactionId: params.sourceId,
    orgId: params.orgId,
    userId: params.userId,
  });
  if (posted.error && !posted.journalId) return { data: null, error: posted.error };

  const { data: brm, error: brmError } = await insertConfirmedMatch({
    orgId: params.orgId,
    userId: params.userId,
    bankTransactionId: params.bankTransactionId,
    sourceType: 'manual_transaction',
    sourceId: params.sourceId,
    confidenceScore: params.confidenceScore,
    matchReason: params.matchReason,
    journalId: posted.journalId,
  });
  if (brmError || !brm) return { data: null, error: brmError?.message ?? 'Failed to create reconciliation match.' };

  await markBankLineReconciled({
    orgId: params.orgId,
    userId: params.userId,
    bankTransactionId: params.bankTransactionId,
    sourceType: 'manual_transaction',
    sourceId: params.sourceId,
    journalId: posted.journalId,
  });

  return { data: { matchId: brm.id, journalId: posted.journalId }, error: null };
}

export async function confirmBankTransactionMatch(params: {
  bankTransactionId: string;
  sourceType: BankReconciliationSourceType;
  sourceId: string;
  confidenceScore?: number;
  matchReason?: string[];
}): Promise<ActionResult<{ matchId: string; journalId: string | null }>> {
  await assertWriteAllowed();
  let ctx;
  try {
    ctx = await assertReconciliationPermission('create');
  } catch (error) {
    return { data: null, error: permissionError(error) };
  }

  const open = await getOpenBankLine(params.bankTransactionId, ctx.orgId);
  if (open.error || !open.data) return { data: null, error: open.error };
  const ledgerLink = await validateBankLedgerLink(open.data.bank_account_id, ctx.orgId);
  if (ledgerLink.status !== 'linked') return { data: null, error: ledgerLink.code };
  const existing = await assertNoExistingBankMatch(params.bankTransactionId, ctx.orgId);
  if (existing) return { data: null, error: existing };
  const sourceError = await assertSourceAvailable(params.sourceType, params.sourceId, ctx.orgId);
  if (sourceError) return { data: null, error: sourceError };

  if (params.sourceType === 'manual_transaction') {
    const result = await confirmManualTransactionMatch({
      bankTransactionId: params.bankTransactionId,
      sourceId: params.sourceId,
      orgId: ctx.orgId,
      userId: ctx.user.id,
      confidenceScore: params.confidenceScore ?? 1,
      matchReason: params.matchReason ?? ['confirmed manual transaction match'],
    });
    if (result.error) return result;
    await logAuditEvent({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'bank_reconciliation_confirm_match',
      entityType: 'bank_line',
      entityId: params.bankTransactionId,
      metadata: { sourceType: params.sourceType, sourceId: params.sourceId, journalId: result.data?.journalId },
    });
    revalidatePath('/reconciliation');
    invalidateOrgReportCache(ctx.orgId);
    return result;
  }

  if (params.sourceType === 'lettings_charge') {
    const result = await reconcileLettingsChargeFromBankLine({
      bankTransactionId: params.bankTransactionId,
      chargeId: params.sourceId,
      orgId: ctx.orgId,
      userId: ctx.user.id,
    });
    if (result.error || !result.data) return { data: null, error: result.error ?? 'Unable to reconcile Lettings payment.' };
    return finalizeLettingsPaymentReconciliation({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      bankTransactionId: params.bankTransactionId,
      chargeId: params.sourceId,
      reconcileResult: result.data,
      confidenceScore: params.confidenceScore ?? 1,
      matchReason: params.matchReason ?? ['confirmed Lettings payment match'],
      auditVariant: 'confirm',
    });
  }

  const supabase = await createClient();
  const admin = createAdminClient();
  let journalId: string | null = null;

  if (params.sourceType === 'journal') {
    const { data: journal } = await supabase
      .from('journals')
      .select('id, organisation_id, status')
      .eq('id', params.sourceId)
      .eq('organisation_id', ctx.orgId)
      .eq('status', 'posted')
      .maybeSingle();
    if (!journal) return { data: null, error: 'Posted journal not found.' };
    journalId = journal.id;
  } else if (params.sourceType === 'donation' || params.sourceType === 'gift_aid_donor_donation') {
    const { data: donation } = await supabase
      .from('donations')
      .select('id, organisation_id, bank_transaction_id, journal_id')
      .eq('id', params.sourceId)
      .eq('organisation_id', ctx.orgId)
      .maybeSingle();
    if (!donation) return { data: null, error: 'Donation not found.' };
    if (donation.bank_transaction_id) return { data: null, error: 'This donation is already linked to a bank transaction.' };
    journalId = donation.journal_id ?? null;
    await admin
      .from('donations')
      .update({ bank_transaction_id: params.bankTransactionId, updated_by: ctx.user.id })
      .eq('id', params.sourceId)
      .eq('organisation_id', ctx.orgId);
  } else if (params.sourceType === 'gift_aid_claim_payment') {
    const amount = Math.abs(Number(open.data.amount_pence));
    await admin
      .from('gift_aid_claim_batches')
      .update({
        received_bank_transaction_id: params.bankTransactionId,
        received_payment_total_pence: amount,
        gift_aid_payment_status: 'reconciled',
        payment_reconciled_at: new Date().toISOString(),
      })
      .eq('id', params.sourceId)
      .eq('workspace_id', ctx.orgId);
  } else if (params.sourceType === 'invoice_payment') {
    const { data: invoice } = await supabase
      .from('receivable_invoices')
      .select('id, organisation_id, total_pence, paid_pence, status')
      .eq('id', params.sourceId)
      .eq('organisation_id', ctx.orgId)
      .maybeSingle();
    if (!invoice) return { data: null, error: 'Receivable invoice not found.' };
    if (invoice.status === 'paid' || invoice.status === 'voided') {
      return { data: null, error: 'This receivable invoice cannot accept another payment match.' };
    }

    const amount = Math.abs(Number(open.data.amount_pence));
    const total = Number(invoice.total_pence ?? 0);
    const nextPaid = Math.min(total, Number(invoice.paid_pence ?? 0) + amount);
    const nextStatus = nextPaid >= total ? 'paid' : 'partially_paid';
    const { error: invoiceUpdateError } = await admin
      .from('receivable_invoices')
      .update({
        paid_pence: nextPaid,
        status: nextStatus,
        payment_journal_id: journalId,
      })
      .eq('id', params.sourceId)
      .eq('organisation_id', ctx.orgId);
    if (invoiceUpdateError) return { data: null, error: invoiceUpdateError.message };
  }

  const { data: match, error: matchError } = await insertConfirmedMatch({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    bankTransactionId: params.bankTransactionId,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    confidenceScore: params.confidenceScore ?? 1,
    matchReason: params.matchReason ?? ['confirmed by user'],
    journalId,
  });
  if (matchError || !match) return { data: null, error: matchError?.message ?? 'Failed to create reconciliation match.' };

  const { error: bankUpdateError } = await markBankLineReconciled({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    bankTransactionId: params.bankTransactionId,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    journalId,
  });
  if (bankUpdateError) return { data: null, error: bankUpdateError.message };

  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'bank_reconciliation_confirm_match',
    entityType: 'bank_line',
    entityId: params.bankTransactionId,
    metadata: { sourceType: params.sourceType, sourceId: params.sourceId, journalId },
  });

  revalidatePath('/reconciliation');
  invalidateOrgReportCache(ctx.orgId);
  return { data: { matchId: match.id, journalId }, error: null };
}

export async function createAndReconcileBankTransaction(
  input: CreateAndReconcileInput,
): Promise<ActionResult<{ sourceId: string; journalId: string | null }>> {
  await assertWriteAllowed();
  let ctx;
  try {
    ctx = await assertReconciliationPermission('create');
  } catch (error) {
    return { data: null, error: permissionError(error) };
  }

  const open = await getOpenBankLine(input.bankTransactionId, ctx.orgId);
  if (open.error || !open.data) return { data: null, error: open.error };
  const existing = await assertNoExistingBankMatch(input.bankTransactionId, ctx.orgId);
  if (existing) return { data: null, error: existing };

  const bankLine = open.data;
  const ledgerLink = await validateBankLedgerLink(bankLine.bank_account_id, ctx.orgId);
  if (ledgerLink.status !== 'linked') {
    return { data: null, error: ledgerLink.code };
  }
  const amount = Math.abs(Number(bankLine.amount_pence));
  const direction: 'in' | 'out' = Number(bankLine.amount_pence) >= 0 ? 'in' : 'out';
  const description = input.description.trim() || bankLine.description || 'Bank transaction';

  if (input.type === 'donation') {
    if (direction !== 'in') return { data: null, error: 'Donation reconciliation requires money in.' };
    if (!input.accountId || !input.fundId) return { data: null, error: 'Donation reconciliation requires an income account and fund.' };
    const donationResult = await reconcileBankLineAsDonation({
      bankLineId: input.bankTransactionId,
      donorId: input.donorId ?? null,
      quickCreateDonor: input.quickCreateDonor ?? undefined,
      anonymous: !input.donorId && !input.quickCreateDonor,
      fundId: input.fundId,
      accountId: input.accountId,
      incomeStreamId: input.incomeStreamId ?? null,
      giftAidEligible: input.giftAidEligible ?? false,
      saveBankReferenceAsAlias: Boolean(input.rememberBankReference),
      addGiftAidFollowUp: Boolean(input.addGiftAidFollowUp),
      generateGiftAidDeclarationLink: Boolean(input.generateGiftAidDeclarationLink),
    });
    if (!donationResult.success || !donationResult.donationId) {
      return { data: null, error: donationResult.error ?? 'Failed to create donation from bank transaction.' };
    }
    revalidatePath('/reconciliation');
    revalidatePath('/donations');
    revalidatePath('/gift-aid');
    invalidateOrgReportCache(ctx.orgId);
    return { data: { sourceId: donationResult.donationId, journalId: null }, error: null };
  }

  if (input.type === 'lettings_income') {
    if (direction !== 'in') return { data: null, error: 'Lettings reconciliation requires money in.' };

    const chargeIdRaw = input.lettingsChargeId?.trim() ?? '';
    const createNew = Boolean(input.createNewLetting);
    const hasChargeId = chargeIdRaw.length > 0;

    if (hasChargeId === createNew) {
      return {
        data: null,
        error:
          hasChargeId && createNew
            ? 'Choose either an existing letting charge or create a new one, not both.'
            : 'Select an existing letting charge, or create a new letting from this payment.',
      };
    }

    if (hasChargeId) {
      const uuidOk = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(chargeIdRaw);
      if (!uuidOk) return { data: null, error: 'Invalid lettings charge id.' };

      const postingOverrides: LettingsPostingOverrides | null =
        input.fundId || input.accountId || input.incomeStreamId
          ? {
              fundId: input.fundId ?? undefined,
              incomeAccountId: input.accountId ?? undefined,
              incomeStreamId: input.incomeStreamId ?? undefined,
            }
          : null;

      const result = await reconcileLettingsChargeFromBankLine({
        bankTransactionId: input.bankTransactionId,
        chargeId: chargeIdRaw,
        orgId: ctx.orgId,
        userId: ctx.user.id,
        postingOverrides,
      });
      if (result.error || !result.data) return { data: null, error: result.error ?? 'Unable to reconcile Lettings payment.' };

      const fin = await finalizeLettingsPaymentReconciliation({
        orgId: ctx.orgId,
        userId: ctx.user.id,
        bankTransactionId: input.bankTransactionId,
        chargeId: chargeIdRaw,
        reconcileResult: result.data,
        confidenceScore: 0.95,
        matchReason: ['reconciled from Create & Reconcile with existing charge'],
        auditVariant: 'confirm',
      });
      if (fin.error) return { data: null, error: fin.error };
      if (!fin.data) return { data: null, error: 'Failed to finalize lettings reconciliation.' };
      return { data: { sourceId: result.data.paymentId, journalId: result.data.journalId }, error: null };
    }

    const lettingName = input.lettingName?.trim() ?? '';
    if (!lettingName) return { data: null, error: 'Hirer name is required to create a letting.' };
    if (!input.fundId) return { data: null, error: 'Select a fund for this letting.' };
    if (!input.accountId?.trim()) return { data: null, error: 'Select an income account for this letting.' };

    const periodStr = (input.lettingPeriodDate?.trim() || bankLine.txn_date).slice(0, 10);
    const periodYear = Number.parseInt(periodStr.slice(0, 4), 10);
    const periodMonth = Number.parseInt(periodStr.slice(5, 7), 10);
    if (!Number.isFinite(periodYear) || !Number.isFinite(periodMonth) || periodMonth < 1 || periodMonth > 12) {
      return { data: null, error: 'Invalid charge period date.' };
    }

    const hirerRes = await findOrCreateLettingsHirerForReconciliation(lettingName);
    if (hirerRes.error || !hirerRes.data) return { data: null, error: hirerRes.error ?? 'Unable to resolve lettings hirer.' };

    const supabaseCheck = await createClient();
    const { data: existingCharge } = await supabaseCheck
      .from('lettings_charges')
      .select('id')
      .eq('organisation_id', ctx.orgId)
      .eq('hirer_id', hirerRes.data.id)
      .eq('period_year', periodYear)
      .eq('period_month', periodMonth)
      .neq('status', 'cancelled')
      .maybeSingle();
    if (existingCharge) {
      return {
        data: null,
        error: 'A lettings charge already exists for this hirer and month—use Match existing.',
      };
    }

    const expectedAmountPence = Math.abs(Number(bankLine.amount_pence));

    const chargeRes = await createLettingsCharge({
      hirerId: hirerRes.data.id,
      periodYear,
      periodMonth,
      description: input.lettingChargeNotes?.trim() || null,
      expectedAmountPence,
      dueDate: null,
      defaultFundId: input.fundId,
      defaultIncomeAccountId: input.accountId ?? null,
    });
    if (chargeRes.error || !chargeRes.data) return { data: null, error: chargeRes.error ?? 'Unable to create lettings charge.' };

    const postingOverrides: LettingsPostingOverrides = {
      fundId: input.fundId,
      incomeAccountId: input.accountId,
      incomeStreamId: input.incomeStreamId ?? undefined,
    };

    const result = await reconcileLettingsChargeFromBankLine({
      bankTransactionId: input.bankTransactionId,
      chargeId: chargeRes.data.id,
      orgId: ctx.orgId,
      userId: ctx.user.id,
      postingOverrides,
    });
    if (result.error || !result.data) return { data: null, error: result.error ?? 'Unable to reconcile Lettings payment.' };

    const fin = await finalizeLettingsPaymentReconciliation({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      bankTransactionId: input.bankTransactionId,
      chargeId: chargeRes.data.id,
      reconcileResult: result.data,
      confidenceScore: 0.95,
      matchReason: ['created lettings charge and reconciled from bank line'],
      auditVariant: 'create_from_bank',
    });
    if (fin.error) return { data: null, error: fin.error };
    if (!fin.data) return { data: null, error: 'Failed to finalize lettings reconciliation.' };
    return { data: { sourceId: result.data.paymentId, journalId: result.data.journalId }, error: null };
  }
  if (input.type === 'gift_aid_hmrc_payment') {
    return { data: null, error: 'Use a Gift Aid HMRC payment suggestion to reconcile claim receipts.' };
  }
  if (input.type === 'payroll_payment') {
    return { data: null, error: 'Payroll payment matching is not available from create-and-reconcile yet.' };
  }
  if (input.type === 'exclude') {
    return { data: null, error: 'Use the Exclude action to exclude a bank transaction.' };
  }

  const txType = input.type;
  if ((txType === 'income' && direction !== 'in') || (txType === 'expense' && direction !== 'out')) {
    return { data: null, error: `This bank line direction does not match a ${txType} transaction.` };
  }

  let supplierId = input.supplierId ?? null;
  let supplierName: string | null = null;
  if (txType === 'expense' && input.quickCreateSupplier?.name) {
    const { data: supplier, error: supplierError } = await createAdminClient()
      .from('suppliers')
      .insert({
        organisation_id: ctx.orgId,
        name: input.quickCreateSupplier.name.trim(),
        email: optionalText(input.quickCreateSupplier.email),
        phone: optionalText(input.quickCreateSupplier.phone),
        is_active: true,
      })
      .select('id, name')
      .single();
    if (supplierError || !supplier) {
      return { data: null, error: supplierError?.message ?? 'Failed to create supplier.' };
    }
    supplierId = supplier.id;
    supplierName = supplier.name;
    await logAuditEvent({
      orgId: ctx.orgId,
      userId: ctx.user.id,
      action: 'supplier_created_from_reconciliation',
      entityType: 'supplier',
      entityId: supplier.id,
      metadata: { bankTransactionId: input.bankTransactionId },
    });
  } else if (supplierId) {
    const { data: supplier } = await createClient()
      .then((client) => client
        .from('suppliers')
        .select('id, name')
        .eq('id', supplierId)
        .eq('organisation_id', ctx.orgId)
        .eq('is_active', true)
        .maybeSingle());
    if (!supplier) return { data: null, error: 'Selected supplier was not found for this organisation.' };
    supplierName = supplier.name;
  }

  let transferLines: ManualTransactionLineInput[] | null = null;
  if (txType === 'transfer') {
    const bankAccount = await createClient().then((client) =>
      client
        .from('bank_accounts')
        .select('id, linked_account_id')
        .eq('id', bankLine.bank_account_id)
        .eq('organisation_id', ctx.orgId)
        .maybeSingle()
    );
    const linkedBankAccountId = bankAccount.data?.linked_account_id as string | null | undefined;
    const fromAccountId = input.transferFromAccountId ?? (direction === 'out' ? linkedBankAccountId : null);
    const toAccountId = input.transferToAccountId ?? (direction === 'in' ? linkedBankAccountId : null);
    if (!fromAccountId || !toAccountId) return { data: null, error: 'Internal transfer requires from and to accounts.' };
    if (fromAccountId === toAccountId) return { data: null, error: 'Transfer accounts must be different.' };

    const { data: transferAccounts } = await createClient().then((client) =>
      client
        .from('accounts')
        .select('id, type, is_active')
        .eq('organisation_id', ctx.orgId)
        .in('id', [fromAccountId, toAccountId])
    );
    if ((transferAccounts ?? []).length !== 2) return { data: null, error: 'Transfer accounts must belong to this organisation.' };
    if ((transferAccounts ?? []).some((account) => account.type !== 'asset' || !account.is_active)) {
      return { data: null, error: 'Internal transfers require active asset accounts.' };
    }
    transferLines = [
      {
        account_id: toAccountId,
        fund_id: null,
        income_stream_id: null,
        amount_pence: amount,
        description: `Transfer in: ${description}`,
        direction: 'in',
      },
      {
        account_id: fromAccountId,
        fund_id: null,
        income_stream_id: null,
        amount_pence: amount,
        description: `Transfer out: ${description}`,
        direction: 'out',
      },
    ];
  }

  const lines = transferLines ?? (input.lines?.length
    ? input.lines
    : [{
        account_id: input.accountId ?? '',
        fund_id: input.fundId ?? null,
        income_stream_id: input.incomeStreamId ?? null,
        description,
        amount_pence: amount,
        direction,
      }]);

  const splitError = validateSplitTotal({ bankAmountPence: Number(bankLine.amount_pence), lines });
  if (splitError) return { data: null, error: splitError };
  if (lines.some((line) => !line.account_id)) return { data: null, error: 'Every split line requires an account.' };
  if ((txType === 'income' || txType === 'expense') && lines.some((line) => !line.fund_id)) {
    return { data: null, error: 'Income and expense lines require a fund.' };
  }

  const admin = createAdminClient();
  const manualInput: ManualTransactionInput = {
    type: txType,
    transaction_date: bankLine.txn_date,
    amount_pence: amount,
    description,
    payee_payer_name: null,
    reference: bankLine.reference,
    payment_method: 'bank',
    expected_bank_account_id: bankLine.bank_account_id,
    requires_bank_match: true,
    duplicate_override_reason: 'Created from reconciled bank line.',
    lines,
  };

  const { data: tx, error: txError } = await admin
    .from('manual_transactions')
    .insert({
      organisation_id: ctx.orgId,
      type: manualInput.type,
      transaction_date: manualInput.transaction_date,
      amount_pence: manualInput.amount_pence,
      description: manualInput.description,
      payee_payer_name: supplierName ?? manualInput.payee_payer_name,
      reference: manualInput.reference,
      payment_method: manualInput.payment_method,
      expected_bank_account_id: manualInput.expected_bank_account_id,
      supplier_id: supplierId,
      transfer_from_account_id: txType === 'transfer' ? input.transferFromAccountId ?? null : null,
      transfer_to_account_id: txType === 'transfer' ? input.transferToAccountId ?? null : null,
      reconciliation_metadata: {
        source: 'bank_reconciliation',
        bankTransactionId: input.bankTransactionId,
        rememberBankReference: Boolean(input.rememberBankReference),
      },
      status: 'matched',
      approval_status: 'approved',
      requires_bank_match: true,
      matched_bank_transaction_id: input.bankTransactionId,
      reconciled_at: new Date().toISOString(),
      duplicate_override_reason: manualInput.duplicate_override_reason,
      created_by: ctx.user.id,
      approved_by: ctx.user.id,
      approved_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (txError || !tx) return { data: null, error: txError?.message ?? 'Failed to create transaction.' };

  const lineRows = lines.map((line, index) => ({
    organisation_id: ctx.orgId,
    manual_transaction_id: tx.id,
    fund_id: line.fund_id ?? null,
    account_id: line.account_id,
    income_stream_id: line.income_stream_id ?? null,
    description: line.description ?? description,
    amount_pence: line.amount_pence,
    direction: line.direction,
    line_order: index + 1,
  }));
  const { error: lineError } = await admin.from('manual_transaction_lines').insert(lineRows);
  if (lineError) return { data: null, error: lineError.message };

  await admin.from('transaction_matches').insert({
    organisation_id: ctx.orgId,
    bank_line_id: input.bankTransactionId,
    manual_transaction_id: tx.id,
    match_status: 'confirmed',
    confidence_score: 1,
    confidence_label: 'high',
    match_reason: 'created from bank transaction',
    confirmed_by: ctx.user.id,
    confirmed_at: new Date().toISOString(),
  });

  const posted = await postManualTransactionToLedger({
    transactionId: tx.id,
    orgId: ctx.orgId,
    userId: ctx.user.id,
  });
  if (posted.error && !posted.journalId) return { data: null, error: posted.error };

  const { error: matchError } = await insertConfirmedMatch({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    bankTransactionId: input.bankTransactionId,
    sourceType: txType === 'adjustment' ? 'adjustment' : 'manual_transaction',
    sourceId: tx.id,
    confidenceScore: 1,
    matchReason: input.lines && input.lines.length > 1 ? ['created and reconciled as split transaction'] : ['created from bank transaction'],
    journalId: posted.journalId,
  });
  if (matchError) return { data: null, error: matchError.message };

  await markBankLineReconciled({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    bankTransactionId: input.bankTransactionId,
    sourceType: txType === 'adjustment' ? 'adjustment' : 'manual_transaction',
    sourceId: tx.id,
    journalId: posted.journalId,
  });

  const aliasText = optionalText(bankLine.reference) ?? optionalText(bankLine.description);
  const normalizedAlias = normalizeAlias(aliasText);
  if (txType === 'expense' && supplierId && input.rememberBankReference && aliasText && normalizedAlias) {
    await admin.from('supplier_matching_aliases').upsert(
      {
        workspace_id: ctx.orgId,
        supplier_id: supplierId,
        alias_text: aliasText,
        normalized_alias: normalizedAlias,
        source: 'reconciliation',
        confidence: 0.95,
        created_from_bank_transaction_id: input.bankTransactionId,
        created_by: ctx.user.id,
      },
      { onConflict: 'workspace_id,normalized_alias,supplier_id' }
    );
  }

  if ((txType === 'income' || txType === 'expense') && input.rememberBankReference && aliasText) {
    await admin.from('bank_rules').insert({
      workspace_id: ctx.orgId,
      name: `Reconciliation: ${aliasText.slice(0, 80)}`,
      bank_account_id: bankLine.bank_account_id,
      priority: 100,
      condition_type: 'contains',
      condition_value: aliasText,
      direction,
      transaction_type: txType,
      account_id: input.accountId ?? null,
      fund_id: input.fundId ?? null,
      income_stream_id: input.incomeStreamId ?? null,
      donor_id: null,
      supplier_id: supplierId,
      description_template: description,
      auto_apply: false,
      status: 'active',
      created_by: ctx.user.id,
    });
  }

  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: input.lines && input.lines.length > 1 ? 'bank_reconciliation_split' : 'bank_reconciliation_create_and_reconcile',
    entityType: 'bank_line',
    entityId: input.bankTransactionId,
    metadata: { transactionId: tx.id, journalId: posted.journalId, type: input.type, lines: lineRows.length },
  });

  revalidatePath('/reconciliation');
  invalidateOrgReportCache(ctx.orgId);
  return { data: { sourceId: tx.id, journalId: posted.journalId }, error: null };
}

export async function splitBankTransaction(
  input: CreateAndReconcileInput,
): Promise<ActionResult<{ sourceId: string; journalId: string | null }>> {
  if (!input.lines || input.lines.length < 2) {
    return { data: null, error: 'Add at least two split lines.' };
  }
  if (input.type === 'lettings_income') {
    return { data: null, error: 'Split is not available for lettings income. Use match or create letting instead.' };
  }
  return createAndReconcileBankTransaction(input);
}

export async function excludeBankTransaction(params: {
  bankTransactionId: string;
  reason: ExclusionReason;
  notes?: string | null;
}): Promise<ActionResult<{ matchId: string }>> {
  await assertWriteAllowed();
  let ctx;
  try {
    ctx = await assertReconciliationPermission('update');
  } catch (error) {
    return { data: null, error: permissionError(error) };
  }

  const open = await getOpenBankLine(params.bankTransactionId, ctx.orgId);
  if (open.error || !open.data) return { data: null, error: open.error };
  const existing = await assertNoExistingBankMatch(params.bankTransactionId, ctx.orgId);
  if (existing) return { data: null, error: existing };

  const admin = createAdminClient();
  const { data: match, error: matchError } = await insertConfirmedMatch({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    bankTransactionId: params.bankTransactionId,
    sourceType: 'excluded',
    sourceId: params.bankTransactionId,
    confidenceScore: 1,
    matchReason: [`excluded: ${params.reason}`, params.notes ?? ''].filter(Boolean),
  });
  if (matchError || !match) return { data: null, error: matchError?.message ?? 'Failed to exclude bank transaction.' };

  const raw = {
    ...(open.data.raw ?? {}),
    reconciliation_exclusion: {
      reason: params.reason,
      notes: params.notes ?? null,
      excluded_at: new Date().toISOString(),
      excluded_by: ctx.user.id,
    },
  };

  const { error: updateError } = await admin
    .from('bank_lines')
    .update({
      status: 'excluded',
      matched_source_type: 'excluded',
      matched_source_id: params.bankTransactionId,
      raw,
    })
    .eq('id', params.bankTransactionId)
    .eq('organisation_id', ctx.orgId);
  if (updateError) return { data: null, error: updateError.message };

  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'bank_reconciliation_exclude',
    entityType: 'bank_line',
    entityId: params.bankTransactionId,
    metadata: { reason: params.reason, notes: params.notes ?? null },
  });

  revalidatePath('/reconciliation');
  return { data: { matchId: match.id }, error: null };
}

export async function skipBankTransaction(params: { bankTransactionId: string }): Promise<ActionResult> {
  await assertWriteAllowed();
  let ctx;
  try {
    ctx = await assertReconciliationPermission('update');
  } catch (error) {
    return { data: null, error: permissionError(error) };
  }
  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'bank_reconciliation_skip',
    entityType: 'bank_line',
    entityId: params.bankTransactionId,
  });
  return { data: null, error: null };
}
