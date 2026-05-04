import type { TransactionStatus, TransactionType } from './types';

const ALLOWED_TRANSITIONS: Record<TransactionStatus, readonly TransactionStatus[]> = {
  draft: ['submitted', 'approved', 'voided'],
  submitted: ['approved', 'rejected', 'voided'],
  approved: ['awaiting_bank_match', 'posted', 'rejected', 'voided'],
  awaiting_bank_match: ['matched', 'voided'],
  matched: ['reconciled', 'voided'],
  reconciled: ['posted', 'voided'],
  posted: [],
  rejected: ['draft', 'voided'],
  voided: [],
};

export function canTransition(from: TransactionStatus, to: TransactionStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: TransactionStatus, to: TransactionStatus): string | null {
  if (canTransition(from, to)) return null;
  return `Cannot move a transaction from ${from.replaceAll('_', ' ')} to ${to.replaceAll('_', ' ')}.`;
}

export function nextStatusAfterApproval(type: TransactionType, requiresBankMatch: boolean): TransactionStatus {
  if (type === 'adjustment' || !requiresBankMatch) return 'approved';
  return 'awaiting_bank_match';
}

export function statusLabel(status: TransactionStatus): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function isEditableStatus(status: TransactionStatus): boolean {
  return status === 'draft' || status === 'submitted' || status === 'rejected';
}

export function isTerminalStatus(status: TransactionStatus): boolean {
  return status === 'posted' || status === 'voided';
}
