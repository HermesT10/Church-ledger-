import type { InvoiceLineDraftInput } from './types';

export function validateInvoiceLines(lines: InvoiceLineDraftInput[], totalPence: number): string | null {
  if (!Array.isArray(lines) || lines.length === 0) return 'At least one invoice line is required.';
  let sum = 0;
  for (const line of lines) {
    if (!line.accountId) return 'Each line needs an account.';
    if (!line.fundId) return 'Each line needs a fund.';
    if (!Number.isInteger(line.amountPence) || line.amountPence <= 0) return 'Line amounts must be positive.';
    sum += line.amountPence;
  }
  if (sum !== totalPence) return 'Line total must equal invoice total.';
  return null;
}

export function receivablePaymentStatus(totalPence: number, paidPence: number): 'unpaid' | 'partially_paid' | 'paid' {
  if (paidPence >= totalPence && totalPence > 0) return 'paid';
  if (paidPence > 0) return 'partially_paid';
  return 'unpaid';
}
