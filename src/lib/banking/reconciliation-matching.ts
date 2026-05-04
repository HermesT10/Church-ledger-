import { createClient } from '@/lib/supabase/server';
import { getActiveOrg } from '@/lib/org';
import { confidenceLabel as transactionConfidenceLabel } from '@/lib/transactions/matching';
import { buildMatchSuggestion } from '@/lib/transactions/matching';
import { buildMatchCandidate } from '@/lib/reconciliation/matching';
import { scoreHmrcReceiptMatch } from '@/lib/giftaid/payment-reconciliation';
import { resolveBankRulePriority, type BankRuleAction } from './bank-rules-engine';
import type { BankRuleRow } from './types';
import type { ManualTransactionRow, MatchConfidence } from '@/lib/transactions/types';

export type BankReconciliationSourceType =
  | 'journal'
  | 'manual_transaction'
  | 'donation'
  | 'gift_aid_donor_donation'
  | 'invoice_payment'
  | 'supplier_payment'
  | 'payroll_payment'
  | 'cash_deposit'
  | 'fund_transfer'
  | 'adjustment'
  | 'gift_aid_claim_payment'
  | 'lettings_charge'
  | 'lettings_payment'
  | 'bank_rule'
  | 'excluded';

export interface BankTransactionForMatching {
  id: string;
  organisation_id: string;
  bank_account_id: string;
  txn_date: string;
  description: string | null;
  reference: string | null;
  amount_pence: number;
  balance_pence: number | null;
}

export interface BankReconciliationMatchSuggestion {
  source_type: BankReconciliationSourceType;
  source_id: string;
  source_label: string;
  source_date: string | null;
  source_amount_pence: number | null;
  confidence_score: number;
  confidence_label: MatchConfidence;
  match_reason: string[];
  rule_action?: BankRuleAction;
  rule_conflict?: string | null;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

function normalize(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function dateDistanceDays(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const at = new Date(`${a}T00:00:00Z`).getTime();
  const bt = new Date(`${b}T00:00:00Z`).getTime();
  if (Number.isNaN(at) || Number.isNaN(bt)) return null;
  return Math.abs(at - bt) / (24 * 60 * 60 * 1000);
}

function textSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const aw = new Set(normalize(a).split(' ').filter((word) => word.length > 2));
  const bw = new Set(normalize(b).split(' ').filter((word) => word.length > 2));
  if (aw.size === 0 || bw.size === 0) return 0;
  let overlap = 0;
  for (const word of aw) {
    if (bw.has(word)) overlap += 1;
  }
  return overlap / Math.max(aw.size, bw.size);
}

export function confidenceLabel(score: number): MatchConfidence {
  return transactionConfidenceLabel(score);
}

export function scoreGenericSourceMatch(params: {
  bankTransaction: Pick<BankTransactionForMatching, 'amount_pence' | 'txn_date' | 'description' | 'reference' | 'bank_account_id'>;
  sourceAmountPence: number | null;
  sourceDate: string | null;
  sourceText: string | null;
  sourceReference?: string | null;
  expectedBankAccountId?: string | null;
  sourceType?: string | null;
  ruleMatched?: boolean;
  recurringPattern?: boolean;
}): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const bank = params.bankTransaction;

  if (params.sourceAmountPence != null && Math.abs(bank.amount_pence) === Math.abs(params.sourceAmountPence)) {
    score += 0.4;
    reasons.push('exact amount match');
  }

  const days = dateDistanceDays(bank.txn_date, params.sourceDate);
  if (days === 0) {
    score += 0.18;
    reasons.push('same date');
  } else if (days != null && days <= 3) {
    score += 0.13;
    reasons.push('close date');
  } else if (days != null && days <= 14) {
    score += 0.06;
    reasons.push('nearby date');
  }

  const bankText = `${bank.description ?? ''} ${bank.reference ?? ''}`;
  const sourceText = `${params.sourceText ?? ''} ${params.sourceReference ?? ''}`;
  if (params.sourceReference && bank.reference && normalize(params.sourceReference) === normalize(bank.reference)) {
    score += 0.18;
    reasons.push('matching reference');
  }

  const similarity = textSimilarity(bankText, sourceText);
  if (similarity >= 0.5) {
    score += 0.14;
    reasons.push('strong description similarity');
  } else if (similarity >= 0.25) {
    score += 0.08;
    reasons.push('description similarity');
  }

  if (params.expectedBankAccountId && params.expectedBankAccountId === bank.bank_account_id) {
    score += 0.07;
    reasons.push('expected bank account');
  }

  if (params.sourceType) {
    const directionMatches =
      (bank.amount_pence >= 0 && ['income', 'donation', 'gift_aid_claim_payment', 'lettings_charge', 'lettings_payment'].includes(params.sourceType)) ||
      (bank.amount_pence < 0 && ['expense', 'supplier_payment', 'payroll_payment'].includes(params.sourceType));
    if (directionMatches) {
      score += 0.05;
      reasons.push('transaction type matches bank direction');
    }
  }

  if (params.ruleMatched) {
    score += 0.06;
    reasons.push('matches previous bank rule');
  }

  if (params.recurringPattern) {
    score += 0.07;
    reasons.push('recurring donor pattern');
  }

  return {
    score: Math.min(1, Number(score.toFixed(4))),
    reasons: reasons.length > 0 ? reasons : ['possible match'],
  };
}

export function validateSplitTotal(params: {
  bankAmountPence: number;
  lines: { amount_pence: number }[];
}): string | null {
  const total = params.lines.reduce((sum, line) => sum + Math.abs(Number(line.amount_pence)), 0);
  if (total !== Math.abs(params.bankAmountPence)) {
    return 'Split line amounts must equal the bank transaction amount.';
  }
  return null;
}

export function scoreBankRuleAgainstTransaction(rule: {
  id: string;
  name: string;
  condition_type: string;
  condition_value: string | null;
  direction: string | null;
  amount_min: number | null;
  amount_max: number | null;
  transaction_type: BankReconciliationSourceType | string;
}, bankTransaction: Pick<BankTransactionForMatching, 'amount_pence' | 'description' | 'reference'>): BankReconciliationMatchSuggestion | null {
  const text = normalize(`${bankTransaction.description ?? ''} ${bankTransaction.reference ?? ''}`);
  const value = normalize(rule.condition_value);
  const amount = Math.abs(bankTransaction.amount_pence) / 100;
  const direction = bankTransaction.amount_pence >= 0 ? 'in' : 'out';
  if (rule.direction && rule.direction !== direction) return null;

  let matched = false;
  if (rule.condition_type === 'contains') matched = Boolean(value && text.includes(value));
  if (rule.condition_type === 'exact') matched = Boolean(value && text === value);
  if (rule.condition_type === 'starts_with') matched = Boolean(value && text.startsWith(value));
  if (rule.condition_type === 'amount_equals') matched = rule.amount_min != null && amount === Number(rule.amount_min);
  if (rule.condition_type === 'amount_range') {
    matched =
      (rule.amount_min == null || amount >= Number(rule.amount_min)) &&
      (rule.amount_max == null || amount <= Number(rule.amount_max));
  }
  if (!matched) return null;

  return {
    source_type: 'bank_rule',
    source_id: rule.id,
    source_label: `Rule: ${rule.name}`,
    source_date: null,
    source_amount_pence: null,
    confidence_score: 0.62,
    confidence_label: 'medium',
    match_reason: [`matches bank rule "${rule.name}"`, `rule suggests ${rule.transaction_type}`],
  };
}

async function alreadyMatchedSourceIds(
  supabase: Supabase,
  orgId: string,
  sourceType: BankReconciliationSourceType,
): Promise<Set<string>> {
  const { data } = await supabase
    .from('bank_reconciliation_matches')
    .select('matched_source_id')
    .eq('workspace_id', orgId)
    .eq('matched_source_type', sourceType)
    .eq('status', 'confirmed');
  return new Set((data ?? []).map((row) => row.matched_source_id).filter(Boolean));
}

async function journalSuggestions(
  supabase: Supabase,
  orgId: string,
  bankLine: BankTransactionForMatching,
): Promise<BankReconciliationMatchSuggestion[]> {
  const date = new Date(`${bankLine.txn_date}T00:00:00Z`);
  const from = new Date(date.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = new Date(date.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const matched = await alreadyMatchedSourceIds(supabase, orgId, 'journal');

  const { data: journals } = await supabase
    .from('journals')
    .select('id, journal_date, memo')
    .eq('organisation_id', orgId)
    .eq('status', 'posted')
    .gte('journal_date', from)
    .lte('journal_date', to)
    .limit(60);

  const candidates = (journals ?? []).filter((journal) => !matched.has(journal.id));
  if (candidates.length === 0) return [];

  const { data: lines } = await supabase
    .from('journal_lines')
    .select('journal_id, debit_pence, credit_pence')
    .in('journal_id', candidates.map((journal) => journal.id));
  const amountMap = new Map<string, number>();
  for (const line of lines ?? []) {
    amountMap.set(line.journal_id, (amountMap.get(line.journal_id) ?? 0) + Number(line.debit_pence ?? 0));
  }

  return candidates
    .map((journal) => {
      const candidate = buildMatchCandidate(bankLine, {
        id: journal.id,
        journal_date: journal.journal_date,
        memo: journal.memo,
        amountPence: amountMap.get(journal.id) ?? 0,
      });
      const confidenceScore = Number((candidate.score / 100).toFixed(4));
      return {
        source_type: 'journal' as const,
        source_id: candidate.journalId,
        source_label: candidate.memo || 'Posted journal',
        source_date: candidate.journalDate,
        source_amount_pence: candidate.amountPence,
        confidence_score: confidenceScore,
        confidence_label: confidenceLabel(confidenceScore),
        match_reason: candidate.reasons,
      };
    })
    .filter((suggestion) => suggestion.confidence_score >= 0.35);
}

async function manualTransactionSuggestions(
  supabase: Supabase,
  orgId: string,
  bankLine: BankTransactionForMatching,
): Promise<BankReconciliationMatchSuggestion[]> {
  const date = new Date(`${bankLine.txn_date}T00:00:00Z`);
  const from = new Date(date.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = new Date(date.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: txs } = await supabase
    .from('manual_transactions')
    .select('*')
    .eq('organisation_id', orgId)
    .eq('requires_bank_match', true)
    .is('posted_journal_id', null)
    .is('matched_bank_transaction_id', null)
    .in('status', ['approved', 'awaiting_bank_match', 'matched'])
    .gte('transaction_date', from)
    .lte('transaction_date', to)
    .limit(50);

  return ((txs ?? []) as ManualTransactionRow[])
    .map((tx) => {
      const suggestion = buildMatchSuggestion(tx, bankLine);
      return {
        source_type: 'manual_transaction' as const,
        source_id: tx.id,
        source_label: `${tx.type}: ${tx.description}`,
        source_date: tx.transaction_date,
        source_amount_pence: tx.amount_pence,
        confidence_score: suggestion.confidence_score,
        confidence_label: suggestion.confidence_label,
        match_reason: suggestion.match_reason.split(',').map((reason) => reason.trim()),
      };
    })
    .filter((suggestion) => suggestion.confidence_score >= 0.35);
}

async function receivableInvoicePaymentSuggestions(
  supabase: Supabase,
  orgId: string,
  bankLine: BankTransactionForMatching,
): Promise<BankReconciliationMatchSuggestion[]> {
  if (bankLine.amount_pence <= 0) return [];
  const matched = await alreadyMatchedSourceIds(supabase, orgId, 'invoice_payment');
  const { data } = await supabase
    .from('receivable_invoices')
    .select('id, invoice_number, invoice_date, due_date, total_pence, paid_pence, status, lettings_hirers(name)')
    .eq('organisation_id', orgId)
    .in('status', ['sent', 'viewed', 'partially_paid', 'overdue'])
    .limit(80);

  return (data ?? [])
    .filter((invoice) => !matched.has(invoice.id))
    .map((invoice) => {
      const hirer = Array.isArray(invoice.lettings_hirers) ? invoice.lettings_hirers[0] : invoice.lettings_hirers;
      const outstanding = Math.max(0, Number(invoice.total_pence ?? 0) - Number(invoice.paid_pence ?? 0));
      const label = hirer?.name ? `Invoice payment: ${hirer.name}` : 'Invoice payment';
      const scored = scoreGenericSourceMatch({
        bankTransaction: bankLine,
        sourceAmountPence: outstanding,
        sourceDate: invoice.due_date ?? invoice.invoice_date,
        sourceText: `${hirer?.name ?? ''} ${invoice.invoice_number ?? ''}`,
        sourceReference: invoice.invoice_number,
        sourceType: 'income',
      });
      return {
        source_type: 'invoice_payment' as const,
        source_id: invoice.id,
        source_label: invoice.invoice_number ? `${label} (${invoice.invoice_number})` : label,
        source_date: invoice.due_date ?? invoice.invoice_date,
        source_amount_pence: outstanding,
        confidence_score: scored.score,
        confidence_label: confidenceLabel(scored.score),
        match_reason: scored.reasons,
      };
    })
    .filter((suggestion) => suggestion.source_amount_pence != null && suggestion.source_amount_pence > 0 && suggestion.confidence_score >= 0.35);
}

async function donationSuggestions(
  supabase: Supabase,
  orgId: string,
  bankLine: BankTransactionForMatching,
): Promise<BankReconciliationMatchSuggestion[]> {
  if (bankLine.amount_pence <= 0) return [];
  const date = new Date(`${bankLine.txn_date}T00:00:00Z`);
  const from = new Date(date.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = new Date(date.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from('donations')
    .select('id, donation_date, amount_pence, source, status, bank_transaction_id, donors(full_name, display_name)')
    .eq('organisation_id', orgId)
    .is('bank_transaction_id', null)
    .gte('donation_date', from)
    .lte('donation_date', to)
    .limit(50);

  return (data ?? [])
    .map((donation) => {
      const donor = Array.isArray(donation.donors) ? donation.donors[0] : donation.donors;
      const donorName = donor?.display_name ?? donor?.full_name ?? null;
      const scored = scoreGenericSourceMatch({
        bankTransaction: bankLine,
        sourceAmountPence: Number(donation.amount_pence),
        sourceDate: donation.donation_date,
        sourceText: `${donorName ?? ''} ${donation.source ?? ''}`,
        sourceType: 'donation',
      });
      return {
        source_type: 'donation' as const,
        source_id: donation.id,
        source_label: donorName ? `Donation from ${donorName}` : 'Donation record',
        source_date: donation.donation_date,
        source_amount_pence: Number(donation.amount_pence),
        confidence_score: scored.score,
        confidence_label: confidenceLabel(scored.score),
        match_reason: scored.reasons,
      };
    })
    .filter((suggestion) => suggestion.confidence_score >= 0.35);
}

/** Row shape for lettings charge ranking (Supabase select). */
export type LettingsChargeForRanking = {
  id: string;
  period_year: number;
  period_month: number;
  description: string | null;
  expected_amount_pence: number | string;
  paid_amount_pence?: number | string;
  outstanding_amount_pence?: number | string;
  due_date: string | null;
  status: string;
  hirer:
    | { name: string; default_room_name: string | null }
    | { name: string; default_room_name: string | null }[]
    | null;
};

function hirerNameTokenBonus(bankLine: BankTransactionForMatching, hirerName: string): { bonus: number; label: string | null } {
  const bankText = `${bankLine.description ?? ''} ${bankLine.reference ?? ''}`;
  const sim = textSimilarity(bankText, hirerName);
  if (sim >= 0.35) return { bonus: 0.06, label: 'hirer name matches bank text' };
  if (sim >= 0.2) return { bonus: 0.04, label: 'hirer name in bank text' };
  return { bonus: 0, label: null };
}

function lettingsAmountAdjustment(
  bankLine: BankTransactionForMatching,
  outstandingPence: number,
  amountToScore: number,
): { delta: number; reasons: string[] } {
  const reasons: string[] = [];
  let delta = 0;
  const bankPence = Math.abs(bankLine.amount_pence);
  if (amountToScore <= 0) return { delta, reasons };
  if (bankPence <= outstandingPence && outstandingPence > 0) {
    delta += 0.08;
    reasons.push('payment fits outstanding');
  } else if (bankPence > outstandingPence && outstandingPence > 0) {
    delta -= 0.06;
    reasons.push('payment exceeds outstanding');
  } else if (Math.abs(bankPence - amountToScore) <= 1) {
    delta += 0.02;
  }
  return { delta, reasons };
}

/** Build a ranked suggestion for one lettings charge (shared by matcher and search API). */
export function lettingsChargeToSuggestion(
  bankLine: BankTransactionForMatching,
  charge: LettingsChargeForRanking,
  calendarMonth: number,
): BankReconciliationMatchSuggestion {
  const hirer = Array.isArray(charge.hirer) ? charge.hirer[0] : charge.hirer;
  const hirerName = hirer?.name ?? 'Lettings hirer';
  const outstanding = Number(charge.outstanding_amount_pence ?? charge.expected_amount_pence ?? 0);
  const amountToScore = outstanding > 0 ? outstanding : Number(charge.expected_amount_pence ?? 0);
  const scored = scoreGenericSourceMatch({
    bankTransaction: bankLine,
    sourceAmountPence: amountToScore,
    sourceDate: charge.due_date ?? `${charge.period_year}-${String(charge.period_month).padStart(2, '0')}-01`,
    sourceText: `${hirerName} ${hirer?.default_room_name ?? ''} ${charge.description ?? ''}`,
    sourceType: 'lettings_charge',
  });

  const { delta: amountDelta, reasons: amountReasons } = lettingsAmountAdjustment(bankLine, outstanding, amountToScore);
  const { bonus: nameBonus, label: nameLabel } = hirerNameTokenBonus(bankLine, hirerName);

  const sameMonth = charge.period_month === calendarMonth;
  let score = scored.score + (sameMonth ? 0.08 : 0) + amountDelta + nameBonus;
  score = Math.min(1, Number(score.toFixed(4)));

  const match_reason = [
    ...scored.reasons,
    ...amountReasons,
    ...(nameLabel ? [nameLabel] : []),
    ...(sameMonth ? ['same lettings month'] : []),
    `outstanding ${outstanding > 0 ? outstanding : 0}p`,
  ];

  return {
    source_type: 'lettings_charge',
    source_id: charge.id,
    source_label: `Lettings: ${hirerName} (${charge.period_month}/${charge.period_year})`,
    source_date: charge.due_date ?? null,
    source_amount_pence: amountToScore,
    confidence_score: score,
    confidence_label: confidenceLabel(score),
    match_reason,
  };
}

/** Comparator: higher score first, then closer due/source date, then smaller amount gap. */
export function compareLettingsSuggestions(
  a: BankReconciliationMatchSuggestion,
  b: BankReconciliationMatchSuggestion,
  bankLine: BankTransactionForMatching,
): number {
  if (b.confidence_score !== a.confidence_score) return b.confidence_score - a.confidence_score;
  const dayA = dateDistanceDays(bankLine.txn_date, a.source_date);
  const dayB = dateDistanceDays(bankLine.txn_date, b.source_date);
  const distA = dayA ?? 9999;
  const distB = dayB ?? 9999;
  if (distA !== distB) return distA - distB;
  const gapA = a.source_amount_pence == null ? 0 : Math.abs(Math.abs(bankLine.amount_pence) - a.source_amount_pence);
  const gapB = b.source_amount_pence == null ? 0 : Math.abs(Math.abs(bankLine.amount_pence) - b.source_amount_pence);
  if (gapA !== gapB) return gapA - gapB;
  return a.source_label.localeCompare(b.source_label);
}

async function lettingsChargeSuggestions(
  supabase: Supabase,
  orgId: string,
  bankLine: BankTransactionForMatching,
): Promise<BankReconciliationMatchSuggestion[]> {
  if (bankLine.amount_pence <= 0) return [];
  const date = new Date(`${bankLine.txn_date}T00:00:00Z`);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;

  const { data } = await supabase
    .from('lettings_charges')
    .select('id, period_year, period_month, description, expected_amount_pence, paid_amount_pence, outstanding_amount_pence, due_date, status, hirer:lettings_hirers(name, default_room_name)')
    .eq('organisation_id', orgId)
    .gte('period_year', year - 1)
    .lte('period_year', year + 1)
    .not('status', 'in', '("paid","waived","cancelled")')
    .limit(150);

  const filtered = (data ?? []).filter((charge) => {
    const dist =
      (Number(charge.period_year) - year) * 12 + (Number(charge.period_month) - month);
    return Math.abs(dist) <= 4;
  });

  return filtered
    .map((charge) => lettingsChargeToSuggestion(bankLine, charge as LettingsChargeForRanking, month))
    .filter((suggestion) => suggestion.confidence_score >= 0.28)
    .sort((a, b) => compareLettingsSuggestions(a, b, bankLine))
    .slice(0, 8);
}

async function giftAidClaimPaymentSuggestions(
  supabase: Supabase,
  orgId: string,
  bankLine: BankTransactionForMatching,
): Promise<BankReconciliationMatchSuggestion[]> {
  if (bankLine.amount_pence <= 0) return [];
  const { data } = await supabase
    .from('gift_aid_claim_batches')
    .select('id, claim_start, claim_end, expected_payment_amount_pence, expected_payment_date, payment_bank_account_id, gift_aid_payment_status, status')
    .eq('workspace_id', orgId)
    .in('gift_aid_payment_status', ['pending', 'partially_paid', 'paid', 'overpaid', 'underpaid'])
    .limit(40);

  return (data ?? [])
    .map((batch) => {
      const scored = scoreHmrcReceiptMatch({
        reference: bankLine.reference,
        description: bankLine.description,
        amountPence: Math.abs(bankLine.amount_pence),
        txnDate: bankLine.txn_date,
        expectedAmountPence: batch.expected_payment_amount_pence == null ? null : Number(batch.expected_payment_amount_pence),
        expectedDate: batch.expected_payment_date,
      });
      let score = scored.score / 100;
      const reasons = [...scored.hints];
      if (batch.payment_bank_account_id && batch.payment_bank_account_id === bankLine.bank_account_id) {
        score += 0.07;
        reasons.push('expected bank account');
      }
      const normalized = Math.min(1, Number(score.toFixed(4)));
      return {
        source_type: 'gift_aid_claim_payment' as const,
        source_id: batch.id,
        source_label: `HMRC Gift Aid claim ${batch.claim_start} to ${batch.claim_end}`,
        source_date: batch.expected_payment_date,
        source_amount_pence: batch.expected_payment_amount_pence == null ? null : Number(batch.expected_payment_amount_pence),
        confidence_score: normalized,
        confidence_label: confidenceLabel(normalized),
        match_reason: reasons.length > 0 ? reasons : ['possible HMRC claim payment'],
      };
    })
    .filter((suggestion) => suggestion.confidence_score >= 0.35);
}

async function bankRuleSuggestions(
  supabase: Supabase,
  orgId: string,
  bankLine: BankTransactionForMatching,
): Promise<BankReconciliationMatchSuggestion[]> {
  const { data } = await supabase
    .from('bank_rules')
    .select('id, name, condition_type, condition_value, direction, amount_min, amount_max, transaction_type')
    .eq('workspace_id', orgId)
    .eq('status', 'active')
    .or(`bank_account_id.eq.${bankLine.bank_account_id},bank_account_id.is.null`)
    .order('priority', { ascending: true })
    .limit(20);

  const resolution = resolveBankRulePriority((data ?? []) as BankRuleRow[], bankLine);
  return resolution.matches.map((match) => ({
    source_type: 'bank_rule',
    source_id: match.rule.id,
    source_label: `Rule: ${match.rule.name}`,
    source_date: null,
    source_amount_pence: null,
    confidence_score: resolution.winner?.rule.id === match.rule.id ? 0.72 : 0.58,
    confidence_label: resolution.winner?.rule.id === match.rule.id ? 'medium' : 'low',
    match_reason: [
      ...match.reasons,
      `suggests ${match.rule.transaction_type}`,
      ...(resolution.conflict?.rule_ids.includes(match.rule.id) ? [resolution.conflict.message] : []),
    ],
    rule_action: match.action,
    rule_conflict: resolution.conflict?.rule_ids.includes(match.rule.id) ? resolution.conflict.message : null,
  }));
}

export async function suggestMatchesForBankTransaction(
  bankTransactionId: string,
): Promise<{ data: BankReconciliationMatchSuggestion[]; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();
  const { data: bankLine, error } = await supabase
    .from('bank_lines')
    .select('id, organisation_id, bank_account_id, txn_date, description, reference, amount_pence, balance_pence, allocated, reconciled, status')
    .eq('id', bankTransactionId)
    .eq('organisation_id', orgId)
    .maybeSingle();

  if (error || !bankLine) return { data: [], error: error?.message ?? 'Bank transaction not found.' };
  if (bankLine.allocated || bankLine.reconciled || bankLine.status === 'excluded') return { data: [], error: null };

  const line: BankTransactionForMatching = {
    id: bankLine.id,
    organisation_id: bankLine.organisation_id,
    bank_account_id: bankLine.bank_account_id,
    txn_date: bankLine.txn_date,
    description: bankLine.description,
    reference: bankLine.reference,
    amount_pence: Number(bankLine.amount_pence),
    balance_pence: bankLine.balance_pence == null ? null : Number(bankLine.balance_pence),
  };

  const suggestions = (
    await Promise.all([
      manualTransactionSuggestions(supabase, orgId, line),
      journalSuggestions(supabase, orgId, line),
      receivableInvoicePaymentSuggestions(supabase, orgId, line),
      donationSuggestions(supabase, orgId, line),
      lettingsChargeSuggestions(supabase, orgId, line),
      giftAidClaimPaymentSuggestions(supabase, orgId, line),
      bankRuleSuggestions(supabase, orgId, line),
    ])
  )
    .flat()
    .sort((a, b) => {
      if (b.confidence_score !== a.confidence_score) return b.confidence_score - a.confidence_score;
      const lettingsBoost = line.amount_pence > 0 ? 1 : 0;
      const la = a.source_type === 'lettings_charge' ? lettingsBoost : 0;
      const lb = b.source_type === 'lettings_charge' ? lettingsBoost : 0;
      if (lb !== la) return lb - la;
      if (a.source_type === 'lettings_charge' && b.source_type === 'lettings_charge') {
        return compareLettingsSuggestions(a, b, line);
      }
      return 0;
    })
    .slice(0, 10);

  return { data: suggestions, error: null };
}
