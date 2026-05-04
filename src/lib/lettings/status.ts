import type { LettingsChargeStatus } from './types';

export function calculateLettingsChargeStatus(params: {
  expectedAmountPence: number;
  paidAmountPence: number;
  dueDate?: string | null;
  existingStatus?: LettingsChargeStatus | null;
  today?: string;
}): LettingsChargeStatus {
  if (params.existingStatus === 'waived' || params.existingStatus === 'cancelled') {
    return params.existingStatus;
  }
  if (params.expectedAmountPence <= 0 && params.paidAmountPence <= 0) return 'expected';
  if (params.paidAmountPence >= params.expectedAmountPence) return 'paid';
  if (params.paidAmountPence > 0) return 'part_paid';
  if (params.dueDate && params.dueDate < (params.today ?? new Date().toISOString().slice(0, 10))) {
    return 'overdue';
  }
  return 'expected';
}

export function monthDueDate(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}
