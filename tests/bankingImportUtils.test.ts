import { describe, it, expect } from 'vitest';
import {
  parseMoneyToPence,
  normalizeText,
  makeFingerprint,
} from '@/lib/banking/importUtils';

/* ------------------------------------------------------------------ */
/*  parseMoneyToPence                                                  */
/* ------------------------------------------------------------------ */

describe('parseMoneyToPence', () => {
  it('handles £ sign with commas: "£1,234.56" => 123456n', () => {
    expect(parseMoneyToPence('£1,234.56')).toBe(123456n);
  });

  it('handles negative with minus: "-12.34" => -1234n', () => {
    expect(parseMoneyToPence('-12.34')).toBe(-1234n);
  });

  it('handles accounting parentheses: "(12.34)" => -1234n', () => {
    expect(parseMoneyToPence('(12.34)')).toBe(-1234n);
  });

  it('handles zero: "0" => 0n', () => {
    expect(parseMoneyToPence('0')).toBe(0n);
  });

  it('handles empty string: "" => 0n', () => {
    expect(parseMoneyToPence('')).toBe(0n);
  });

  it('handles plain number input: 12.34 => 1234n', () => {
    expect(parseMoneyToPence(12.34)).toBe(1234n);
  });

  it('handles negative number input: -50 => -5000n', () => {
    expect(parseMoneyToPence(-50)).toBe(-5000n);
  });

  it('handles whitespace: " £ 100.00 " => 10000n', () => {
    expect(parseMoneyToPence(' £ 100.00 ')).toBe(10000n);
  });

  it('handles whole number without decimals: "500" => 50000n', () => {
    expect(parseMoneyToPence('500')).toBe(50000n);
  });

  it('handles invalid input gracefully: "abc" => 0n', () => {
    expect(parseMoneyToPence('abc')).toBe(0n);
  });
});

/* ------------------------------------------------------------------ */
/*  normalizeText                                                      */
/* ------------------------------------------------------------------ */

describe('normalizeText', () => {
  it('trims whitespace', () => {
    expect(normalizeText('  hello  ')).toBe('hello');
  });

  it('lowercases text', () => {
    expect(normalizeText('Hello World')).toBe('hello world');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeText('  hello   world  ')).toBe('hello world');
  });

  it('returns empty string for null', () => {
    expect(normalizeText(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(normalizeText(undefined)).toBe('');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeText('')).toBe('');
  });
});

/* ------------------------------------------------------------------ */
/*  makeFingerprint                                                    */
/* ------------------------------------------------------------------ */

describe('makeFingerprint', () => {
  const baseParams = {
    txn_date: '2025-01-15',
    amount_pence: 12345n,
    reference: 'REF-001',
    description: 'Church donation',
  };

  it('returns a 64-character hex string (SHA-256)', () => {
    const fp = makeFingerprint(baseParams);
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is stable for the same inputs', () => {
    const fp1 = makeFingerprint(baseParams);
    const fp2 = makeFingerprint(baseParams);
    expect(fp1).toBe(fp2);
  });

  it('changes when reference changes', () => {
    const fp1 = makeFingerprint(baseParams);
    const fp2 = makeFingerprint({ ...baseParams, reference: 'REF-002' });
    expect(fp1).not.toBe(fp2);
  });

  it('changes when amount changes', () => {
    const fp1 = makeFingerprint(baseParams);
    const fp2 = makeFingerprint({ ...baseParams, amount_pence: 99999n });
    expect(fp1).not.toBe(fp2);
  });

  it('changes when date changes', () => {
    const fp1 = makeFingerprint(baseParams);
    const fp2 = makeFingerprint({ ...baseParams, txn_date: '2025-02-01' });
    expect(fp1).not.toBe(fp2);
  });

  it('normalizes text before hashing (case insensitive)', () => {
    const fp1 = makeFingerprint(baseParams);
    const fp2 = makeFingerprint({
      ...baseParams,
      reference: '  ref-001  ',
      description: '  CHURCH   DONATION  ',
    });
    expect(fp1).toBe(fp2);
  });
});
