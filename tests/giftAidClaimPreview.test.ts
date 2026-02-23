import { describe, it, expect } from 'vitest';
import {
  buildClaimPreview,
  calculateClaimablePence,
  type ClaimPreviewDonation,
  type EligibilityDeclaration,
} from '@/lib/giftaid/eligibility';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const VALID_DONOR = {
  full_name: 'John Smith',
  address: '123 Church Lane',
  postcode: 'AB1 2CD',
};

const ACTIVE_DECLARATION: EligibilityDeclaration = {
  start_date: '2024-01-01',
  end_date: null,
  is_active: true,
};

function makeDonation(
  overrides: Partial<ClaimPreviewDonation> = {}
): ClaimPreviewDonation {
  return {
    id: 'don-1',
    donation_date: '2025-06-15',
    amount_pence: 2000,
    gift_aid_claim_id: null,
    donor: VALID_DONOR,
    declarations: [ACTIVE_DECLARATION],
    ...overrides,
  };
}

const START = '2025-01-01';
const END = '2025-12-31';

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('calculateClaimablePence', () => {
  it('exact quarter: 2000 -> 500', () => {
    expect(calculateClaimablePence(2000)).toBe(500);
  });

  it('rounds correctly: 1001 -> 250 (Math.round(250.25))', () => {
    expect(calculateClaimablePence(1001)).toBe(250);
  });

  it('rounds up case: 999 -> 250 (Math.round(249.75))', () => {
    expect(calculateClaimablePence(999)).toBe(250);
  });

  it('zero amount -> 0', () => {
    expect(calculateClaimablePence(0)).toBe(0);
  });
});

describe('buildClaimPreview', () => {
  it('basic eligible donation -- correct claimable at 25%', () => {
    const donations = [makeDonation({ amount_pence: 4000 })];
    const result = buildClaimPreview(donations, START, END);

    expect(result.startDate).toBe(START);
    expect(result.endDate).toBe(END);
    expect(result.eligibleDonations).toHaveLength(1);
    expect(result.ineligibleDonations).toHaveLength(0);
    expect(result.eligibleDonations[0].claimablePence).toBe(1000);
    expect(result.eligibleDonations[0].amountPence).toBe(4000);
    expect(result.totals.eligibleCount).toBe(1);
    expect(result.totals.eligibleAmountPence).toBe(4000);
    expect(result.totals.claimableTotalPence).toBe(1000);
  });

  it('multiple donations mixed -- some eligible, some not; totals correct', () => {
    const donations = [
      makeDonation({ id: 'don-1', amount_pence: 2000 }),
      makeDonation({
        id: 'don-2',
        amount_pence: 1000,
        donor: null, // ineligible: no donor
      }),
      makeDonation({ id: 'don-3', amount_pence: 3000 }),
    ];
    const result = buildClaimPreview(donations, START, END);

    expect(result.eligibleDonations).toHaveLength(2);
    expect(result.ineligibleDonations).toHaveLength(1);
    expect(result.ineligibleDonations[0].donationId).toBe('don-2');
    expect(result.ineligibleDonations[0].reason).toContain('No donor linked');
    expect(result.totals.eligibleCount).toBe(2);
    expect(result.totals.eligibleAmountPence).toBe(5000);
    expect(result.totals.claimableTotalPence).toBe(500 + 750); // 2000*0.25 + 3000*0.25
  });

  it('rounding: odd pence amount -- 1001 -> claimable 250', () => {
    const donations = [makeDonation({ amount_pence: 1001 })];
    const result = buildClaimPreview(donations, START, END);

    expect(result.eligibleDonations[0].claimablePence).toBe(250);
    expect(result.totals.claimableTotalPence).toBe(250);
  });

  it('rounding: exact quarter -- 2000 -> claimable 500', () => {
    const donations = [makeDonation({ amount_pence: 2000 })];
    const result = buildClaimPreview(donations, START, END);

    expect(result.eligibleDonations[0].claimablePence).toBe(500);
    expect(result.totals.claimableTotalPence).toBe(500);
  });

  it('rounding: round-up case -- 999 -> claimable 250', () => {
    const donations = [makeDonation({ amount_pence: 999 })];
    const result = buildClaimPreview(donations, START, END);

    expect(result.eligibleDonations[0].claimablePence).toBe(250);
    expect(result.totals.claimableTotalPence).toBe(250);
  });

  it('all ineligible -- totals are zero', () => {
    const donations = [
      makeDonation({ id: 'don-1', donor: null }),
      makeDonation({
        id: 'don-2',
        donor: { full_name: 'Jane', address: null, postcode: null },
      }),
    ];
    const result = buildClaimPreview(donations, START, END);

    expect(result.eligibleDonations).toHaveLength(0);
    expect(result.ineligibleDonations).toHaveLength(2);
    expect(result.totals.eligibleCount).toBe(0);
    expect(result.totals.eligibleAmountPence).toBe(0);
    expect(result.totals.claimableTotalPence).toBe(0);
  });

  it('empty donations array -- totals are zero, both lists empty', () => {
    const result = buildClaimPreview([], START, END);

    expect(result.eligibleDonations).toHaveLength(0);
    expect(result.ineligibleDonations).toHaveLength(0);
    expect(result.totals.eligibleCount).toBe(0);
    expect(result.totals.eligibleAmountPence).toBe(0);
    expect(result.totals.claimableTotalPence).toBe(0);
    expect(result.startDate).toBe(START);
    expect(result.endDate).toBe(END);
  });

  it('donor name in eligible output -- donor full_name correctly mapped', () => {
    const donations = [
      makeDonation({
        donor: { full_name: 'Alice Thompson', address: '10 High St', postcode: 'XY3 4ZZ' },
      }),
    ];
    const result = buildClaimPreview(donations, START, END);

    expect(result.eligibleDonations[0].donorName).toBe('Alice Thompson');
  });
});
