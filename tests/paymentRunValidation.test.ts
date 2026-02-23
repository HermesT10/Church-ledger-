import { describe, it, expect } from 'vitest';
import {
  validatePaymentRunItems,
  type PaymentRunItemInput,
} from '@/lib/bills/validation';

/* ------------------------------------------------------------------ */
/*  validatePaymentRunItems                                            */
/* ------------------------------------------------------------------ */

describe('validatePaymentRunItems', () => {
  it('passes when items sum equals expected total', () => {
    const items: PaymentRunItemInput[] = [
      { bill_id: 'b1', amount_pence: 5000 },
      { bill_id: 'b2', amount_pence: 3000 },
    ];
    const result = validatePaymentRunItems(items, 8000);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.itemsSumPence).toBe(8000);
  });

  it('rejects empty items array', () => {
    const result = validatePaymentRunItems([], 1000);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('At least one bill');
  });

  it('rejects item with zero amount', () => {
    const items: PaymentRunItemInput[] = [
      { bill_id: 'b1', amount_pence: 0 },
    ];
    const result = validatePaymentRunItems(items, 0);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('greater than zero'))).toBe(true);
  });

  it('rejects item with negative amount', () => {
    const items: PaymentRunItemInput[] = [
      { bill_id: 'b1', amount_pence: -500 },
    ];
    const result = validatePaymentRunItems(items, -500);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('greater than zero'))).toBe(true);
  });

  it('rejects item with missing bill_id', () => {
    const items: PaymentRunItemInput[] = [
      { bill_id: '', amount_pence: 1000 },
    ];
    const result = validatePaymentRunItems(items, 1000);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('bill ID is required'))).toBe(true);
  });

  it('rejects when items sum does not match total', () => {
    const items: PaymentRunItemInput[] = [
      { bill_id: 'b1', amount_pence: 5000 },
      { bill_id: 'b2', amount_pence: 3000 },
    ];
    const result = validatePaymentRunItems(items, 10000);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('does not match'))).toBe(true);
  });

  it('handles single item matching total', () => {
    const items: PaymentRunItemInput[] = [
      { bill_id: 'b1', amount_pence: 25000 },
    ];
    const result = validatePaymentRunItems(items, 25000);
    expect(result.valid).toBe(true);
    expect(result.itemsSumPence).toBe(25000);
  });

  it('handles many items summing correctly', () => {
    const items: PaymentRunItemInput[] = [
      { bill_id: 'b1', amount_pence: 1000 },
      { bill_id: 'b2', amount_pence: 2000 },
      { bill_id: 'b3', amount_pence: 3000 },
      { bill_id: 'b4', amount_pence: 4000 },
    ];
    const result = validatePaymentRunItems(items, 10000);
    expect(result.valid).toBe(true);
    expect(result.itemsSumPence).toBe(10000);
  });
});
