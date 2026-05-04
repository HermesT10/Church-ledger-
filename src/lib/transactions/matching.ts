import type { MatchConfidence, MatchSuggestion, ManualTransactionRow } from './types';

interface BankLineLike {
  id: string;
  txn_date: string;
  description: string | null;
  reference: string | null;
  amount_pence: number;
  bank_account_id?: string | null;
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function dateDistanceDays(a: string, b: string): number {
  const at = new Date(a + 'T00:00:00Z').getTime();
  const bt = new Date(b + 'T00:00:00Z').getTime();
  return Math.abs(at - bt) / (24 * 60 * 60 * 1000);
}

function textSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const aw = new Set(normalize(a).split(' ').filter(Boolean));
  const bw = new Set(normalize(b).split(' ').filter(Boolean));
  if (aw.size === 0 || bw.size === 0) return 0;
  let overlap = 0;
  for (const word of aw) {
    if (bw.has(word)) overlap += 1;
  }
  return overlap / Math.max(aw.size, bw.size);
}

export function confidenceLabel(score: number): MatchConfidence {
  if (score >= 0.8) return 'high';
  if (score >= 0.55) return 'medium';
  return 'low';
}

export function buildMatchSuggestion(
  transaction: ManualTransactionRow,
  bankLine: BankLineLike,
): MatchSuggestion {
  const reasons: string[] = [];
  let score = 0;

  if (Math.abs(bankLine.amount_pence) === transaction.amount_pence) {
    score += 0.45;
    reasons.push('same amount');
  }

  const days = dateDistanceDays(transaction.transaction_date, bankLine.txn_date);
  if (days === 0) {
    score += 0.2;
    reasons.push('same date');
  } else if (days <= 3) {
    score += 0.15;
    reasons.push('close date');
  } else if (days <= 14) {
    score += 0.05;
    reasons.push('nearby date');
  }

  if (transaction.reference && bankLine.reference && normalize(transaction.reference) === normalize(bankLine.reference)) {
    score += 0.2;
    reasons.push('matching reference');
  }

  const descriptionText = `${transaction.description} ${transaction.payee_payer_name ?? ''}`;
  const bankText = `${bankLine.description ?? ''} ${bankLine.reference ?? ''}`;
  const similarity = textSimilarity(descriptionText, bankText);
  if (similarity >= 0.4) {
    score += 0.1;
    reasons.push('similar wording');
  }

  if (transaction.expected_bank_account_id && bankLine.bank_account_id === transaction.expected_bank_account_id) {
    score += 0.05;
    reasons.push('expected bank account');
  }

  const normalizedScore = Math.min(1, Number(score.toFixed(4)));

  return {
    bank_line_id: bankLine.id,
    manual_transaction_id: transaction.id,
    confidence_score: normalizedScore,
    confidence_label: confidenceLabel(normalizedScore),
    match_reason: reasons.length > 0 ? reasons.join(', ') : 'possible manual match',
    bank_description: bankLine.description,
    bank_reference: bankLine.reference,
    bank_amount_pence: bankLine.amount_pence,
    bank_txn_date: bankLine.txn_date,
  };
}
