import { describe, it, expect } from 'vitest';
import {
  validateBillLines,
  validateStatusTransition,
  type BillLineInput,
} from '@/lib/bills/validation';

/* ------------------------------------------------------------------ */
/*  validateBillLines                                                  */
/* ------------------------------------------------------------------ */

describe('validateBillLines', () => {
  it('passes when lines sum equals expected total', () => {
    const lines: BillLineInput[] = [
      { account_id: 'a1', amount: '50.00' },
      { account_id: 'a2', amount: '25.00' },
    ];
    const result = validateBillLines(lines, 7500); // 75.00 = 7500 pence
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.linesSumPence).toBe(7500);
  });

  it('rejects empty lines array', () => {
    const result = validateBillLines([], 1000);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('At least one');
  });

  it('rejects line with zero amount', () => {
    const lines: BillLineInput[] = [
      { account_id: 'a1', amount: '0' },
    ];
    const result = validateBillLines(lines, 0);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('greater than zero'))).toBe(true);
  });

  it('rejects line with negative amount', () => {
    const lines: BillLineInput[] = [
      { account_id: 'a1', amount: '-10.00' },
    ];
    const result = validateBillLines(lines, -1000);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('greater than zero'))).toBe(true);
  });

  it('rejects line with missing account', () => {
    const lines: BillLineInput[] = [
      { account_id: '', amount: '10.00' },
    ];
    const result = validateBillLines(lines, 1000);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('account is required'))).toBe(true);
  });

  it('rejects when lines sum does not match total', () => {
    const lines: BillLineInput[] = [
      { account_id: 'a1', amount: '50.00' },
      { account_id: 'a2', amount: '30.00' },
    ];
    const result = validateBillLines(lines, 10000); // expect 100.00 but lines = 80.00
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('do not match'))).toBe(true);
  });

  it('handles single line matching total', () => {
    const lines: BillLineInput[] = [
      { account_id: 'a1', amount: '123.45' },
    ];
    const result = validateBillLines(lines, 12345);
    expect(result.valid).toBe(true);
    expect(result.linesSumPence).toBe(12345);
  });

  it('handles decimal rounding correctly', () => {
    const lines: BillLineInput[] = [
      { account_id: 'a1', amount: '33.33' },
      { account_id: 'a2', amount: '33.33' },
      { account_id: 'a3', amount: '33.34' },
    ];
    const result = validateBillLines(lines, 10000);
    expect(result.valid).toBe(true);
    expect(result.linesSumPence).toBe(10000);
  });
});

/* ------------------------------------------------------------------ */
/*  validateStatusTransition                                           */
/* ------------------------------------------------------------------ */

describe('validateStatusTransition', () => {
  it('allows draft → approved', () => {
    const result = validateStatusTransition('draft', 'approved');
    expect(result.valid).toBe(true);
  });

  it('allows approved → posted', () => {
    const result = validateStatusTransition('approved', 'posted');
    expect(result.valid).toBe(true);
  });

  it('allows posted → paid', () => {
    const result = validateStatusTransition('posted', 'paid');
    expect(result.valid).toBe(true);
  });

  it('rejects draft → posted (skip approved)', () => {
    const result = validateStatusTransition('draft', 'posted');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('Cannot transition');
  });

  it('rejects draft → paid (skip steps)', () => {
    const result = validateStatusTransition('draft', 'paid');
    expect(result.valid).toBe(false);
  });

  it('rejects posted → draft (backward)', () => {
    const result = validateStatusTransition('posted', 'draft');
    expect(result.valid).toBe(false);
  });

  it('rejects approved → draft (backward)', () => {
    const result = validateStatusTransition('approved', 'draft');
    expect(result.valid).toBe(false);
  });

  it('rejects paid → anything (terminal state)', () => {
    expect(validateStatusTransition('paid', 'draft').valid).toBe(false);
    expect(validateStatusTransition('paid', 'posted').valid).toBe(false);
  });

  it('rejects unknown current status', () => {
    const result = validateStatusTransition('unknown', 'draft');
    expect(result.valid).toBe(false);
    expect(result.message).toContain('Unknown current status');
  });
});
