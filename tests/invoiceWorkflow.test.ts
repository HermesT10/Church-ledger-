import { describe, expect, it } from 'vitest';
import { receivablePaymentStatus, validateInvoiceLines } from '@/lib/invoices/validation';

describe('invoice workflow validation', () => {
  it('requires at least one line', () => {
    expect(validateInvoiceLines([], 1000)).toBe('At least one invoice line is required.');
  });

  it('requires account and fund on every line', () => {
    expect(validateInvoiceLines([{ accountId: '', fundId: 'f1', amountPence: 1000 }], 1000)).toBe(
      'Each line needs an account.',
    );
    expect(validateInvoiceLines([{ accountId: 'a1', fundId: '', amountPence: 1000 }], 1000)).toBe(
      'Each line needs a fund.',
    );
  });

  it('requires positive integer pence amounts', () => {
    expect(validateInvoiceLines([{ accountId: 'a1', fundId: 'f1', amountPence: 0 }], 1000)).toBe(
      'Line amounts must be positive.',
    );
  });

  it('requires line total to match invoice total', () => {
    expect(validateInvoiceLines([{ accountId: 'a1', fundId: 'f1', amountPence: 999 }], 1000)).toBe(
      'Line total must equal invoice total.',
    );
  });

  it('accepts valid lines', () => {
    expect(
      validateInvoiceLines(
        [
          { accountId: 'a1', fundId: 'f1', amountPence: 600 },
          { accountId: 'a2', fundId: 'f1', amountPence: 400 },
        ],
        1000,
      ),
    ).toBeNull();
  });

  it('derives receivable payment status', () => {
    expect(receivablePaymentStatus(1000, 0)).toBe('unpaid');
    expect(receivablePaymentStatus(1000, 500)).toBe('partially_paid');
    expect(receivablePaymentStatus(1000, 1000)).toBe('paid');
  });
});
