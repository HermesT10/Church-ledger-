import { describe, expect, it } from 'vitest';
import {
  allocationIsValid,
  computeGiftAidPaymentStatus,
  remainingCreditOnBankLine,
  scoreHmrcReceiptMatch,
} from '@/lib/giftaid/payment-reconciliation';

describe('computeGiftAidPaymentStatus', () => {
  it('returns pending when nothing received', () => {
    expect(
      computeGiftAidPaymentStatus({
        expectedPence: 5000,
        receivedPence: 0,
      }),
    ).toBe('pending');
  });

  it('respects reconciled when previously set', () => {
    expect(
      computeGiftAidPaymentStatus({
        expectedPence: 5000,
        receivedPence: 0,
        previousStatus: 'reconciled',
      }),
    ).toBe('reconciled');
  });

  it('returns paid when received matches expected', () => {
    expect(
      computeGiftAidPaymentStatus({
        expectedPence: 10_000,
        receivedPence: 10_000,
      }),
    ).toBe('paid');
  });

  it('returns overpaid when received exceeds expected', () => {
    expect(
      computeGiftAidPaymentStatus({
        expectedPence: 8000,
        receivedPence: 9000,
      }),
    ).toBe('overpaid');
  });

  it('returns partially_paid when under expected but some received', () => {
    expect(
      computeGiftAidPaymentStatus({
        expectedPence: 8000,
        receivedPence: 3000,
      }),
    ).toBe('partially_paid');
  });
});

describe('allocationIsValid', () => {
  it('rejects when allocation exceeds remaining on line', () => {
    expect(
      allocationIsValid({
        lineAmountPence: 5000,
        existingAllocationsSumPence: 2000,
        newAllocationPence: 4000,
      }),
    ).toBe(false);
  });

  it('accepts when split across batches fits', () => {
    expect(
      allocationIsValid({
        lineAmountPence: 8000,
        existingAllocationsSumPence: 5000,
        newAllocationPence: 3000,
      }),
    ).toBe(true);
  });
});

describe('remainingCreditOnBankLine', () => {
  it('subtracts prior allocations from line credit', () => {
    expect(
      remainingCreditOnBankLine({
        lineAmountPence: 10_000,
        allocatedSumPence: 6250,
      }),
    ).toBe(3750);
  });
});

describe('scoreHmrcReceiptMatch', () => {
  it('boosts score for HMRC-like text and exact amount', () => {
    const { score, hints } = scoreHmrcReceiptMatch({
      reference: 'HMRC GAX',
      description: 'Gift Aid',
      amountPence: 1000,
      txnDate: '2025-06-10',
      expectedAmountPence: 1000,
      expectedDate: '2025-06-10',
    });
    expect(score).toBeGreaterThan(50);
    expect(hints.some((h) => h.includes('Exact') || h.includes('HMRC'))).toBe(true);
  });
});
