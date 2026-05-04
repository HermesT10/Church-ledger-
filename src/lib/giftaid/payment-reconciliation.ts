/** Pure helpers — Gift Aid claim batch bank payment reconciliation (HMRC receipts). */

import type { GiftAidBankPaymentStatus } from './types';

const HMRC_TERMS =
  /\b(hmrc|hm\s*revenue|vat|paye|gift\s*aid|hmrc gov|government gateway)\b/i;

/** Keep explicit “reconciled” once set unless caller clears it. */
export function computeGiftAidPaymentStatus(params: {
  expectedPence: number | null;
  receivedPence: number;
  previousStatus?: GiftAidBankPaymentStatus;
}): GiftAidBankPaymentStatus {
  const received = Math.max(0, params.receivedPence);
  if (params.previousStatus === 'reconciled') {
    return 'reconciled';
  }

  if (received === 0) {
    return 'pending';
  }

  if (params.expectedPence === null || params.expectedPence === undefined) {
    return received > 0 ? 'partially_paid' : 'pending';
  }

  const expected = params.expectedPence;
  if (received < expected) {
    return received > 0 ? 'partially_paid' : 'pending';
  }
  if (received === expected) {
    return 'paid';
  }
  return 'overpaid';
}

export function scoreHmrcReceiptMatch(params: {
  reference: string | null;
  description: string | null;
  amountPence: number;
  txnDate: string;
  expectedAmountPence: number | null;
  expectedDate: string | null;
}): { score: number; hints: string[] } {
  const hints: string[] = [];
  let score = 0;

  const blob = `${params.reference ?? ''} ${params.description ?? ''}`.trim();
  if (HMRC_TERMS.test(blob)) {
    score += 40;
    hints.push('HMRC-style reference or description');
  }

  if (params.expectedAmountPence != null && params.expectedAmountPence > 0) {
    const diff = Math.abs(params.amountPence - params.expectedAmountPence);
    const rel = diff / params.expectedAmountPence;
    if (diff === 0) {
      score += 45;
      hints.push('Exact amount match');
    } else if (rel <= 0.02) {
      score += 30;
      hints.push('Within 2% of expected');
    } else if (rel <= 0.1) {
      score += 15;
      hints.push('Approximate amount');
    }
  } else if (params.amountPence > 0) {
    score += 5;
  }

  if (params.expectedDate && params.txnDate) {
    const exp = new Date(params.expectedDate).getTime();
    const act = new Date(params.txnDate).getTime();
    if (!Number.isNaN(exp) && !Number.isNaN(act)) {
      const days = Math.abs(act - exp) / (86400 * 1000);
      if (days <= 3) {
        score += 15;
        hints.push('Date within 3 working days');
      } else if (days <= 14) {
        score += 8;
        hints.push('Date within 2 weeks');
      }
    }
  }

  return { score: Math.min(100, score), hints };
}

/** Remaining credit on a bank line after allocations (same org, any batch). */
export function remainingCreditOnBankLine(params: {
  lineAmountPence: number;
  allocatedSumPence: number;
}): number {
  const credit = Math.max(0, params.lineAmountPence);
  return Math.max(0, credit - Math.max(0, params.allocatedSumPence));
}

export function allocationIsValid(params: {
  lineAmountPence: number;
  existingAllocationsSumPence: number;
  newAllocationPence: number;
}): boolean {
  if (params.newAllocationPence <= 0) return false;
  const remaining = remainingCreditOnBankLine({
    lineAmountPence: params.lineAmountPence,
    allocatedSumPence: params.existingAllocationsSumPence,
  });
  return params.newAllocationPence <= remaining;
}
