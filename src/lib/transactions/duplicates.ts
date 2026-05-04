import type { DuplicateCandidate, ManualTransactionInput, ManualTransactionRow } from './types';

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function dateDistanceDays(a: string, b: string): number {
  const at = new Date(a + 'T00:00:00Z').getTime();
  const bt = new Date(b + 'T00:00:00Z').getTime();
  return Math.abs(at - bt) / (24 * 60 * 60 * 1000);
}

function sharedWords(a: string, b: string): number {
  const aw = new Set(normalizeText(a).split(' ').filter(Boolean));
  const bw = new Set(normalizeText(b).split(' ').filter(Boolean));
  let count = 0;
  for (const word of aw) {
    if (bw.has(word)) count += 1;
  }
  return count;
}

export function scoreDuplicateCandidate(
  input: ManualTransactionInput,
  existing: ManualTransactionRow,
): DuplicateCandidate | null {
  const reasons: string[] = [];
  let score = 0;

  if (input.amount_pence === existing.amount_pence) {
    score += 40;
    reasons.push('same amount');
  }

  const days = dateDistanceDays(input.transaction_date, existing.transaction_date);
  if (days === 0) {
    score += 25;
    reasons.push('same date');
  } else if (days <= 3) {
    score += 15;
    reasons.push('nearby date');
  }

  if (input.reference && existing.reference && normalizeText(input.reference) === normalizeText(existing.reference)) {
    score += 25;
    reasons.push('same reference');
  }

  if (
    input.payee_payer_name &&
    existing.payee_payer_name &&
    normalizeText(input.payee_payer_name) === normalizeText(existing.payee_payer_name)
  ) {
    score += 20;
    reasons.push('same payee/payer');
  }

  const words = sharedWords(input.description, existing.description);
  if (words >= 2) {
    score += Math.min(15, words * 5);
    reasons.push('similar description');
  }

  if (input.type === existing.type) {
    score += 5;
    reasons.push('same type');
  }

  if (score < 45) return null;

  return {
    id: existing.id,
    transaction_date: existing.transaction_date,
    amount_pence: existing.amount_pence,
    description: existing.description,
    payee_payer_name: existing.payee_payer_name,
    reference: existing.reference,
    status: existing.status,
    score,
    reasons,
  };
}

export function sortDuplicateCandidates(candidates: DuplicateCandidate[]): DuplicateCandidate[] {
  return [...candidates].sort((a, b) => b.score - a.score);
}
