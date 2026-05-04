import { describe, it, expect } from 'vitest';
import {
  buildGiftAidCsv,
  buildGiftAidHmrcRow,
  buildClaimPreview,
  type GiftAidCsvRow,
  type ClaimPreviewDonation,
  type EligibilityDeclaration,
  penceToPounds,
} from '@/lib/giftaid/eligibility';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeRow(overrides: Partial<GiftAidCsvRow> = {}): GiftAidCsvRow {
  return {
    title: 'Mr',
    firstNameOrInitial: 'John',
    lastName: 'Smith',
    houseNameOrNumber: '123',
    postcode: 'AB1 2CD',
    donationDate: '2025-06-15',
    amountPounds: '20.00',
    ...overrides,
  };
}

const ACTIVE_DECLARATION: EligibilityDeclaration = {
  start_date: '2024-01-01',
  end_date: null,
  is_active: true,
};

const VALID_DONOR = {
  full_name: 'John Smith',
  address: '123 Church Lane',
  postcode: 'AB1 2CD',
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

/* ------------------------------------------------------------------ */
/*  penceToPounds                                                      */
/* ------------------------------------------------------------------ */

describe('penceToPounds', () => {
  it('converts pence to pounds string with 2 decimals', () => {
    expect(penceToPounds(2000)).toBe('20.00');
    expect(penceToPounds(1001)).toBe('10.01');
    expect(penceToPounds(50)).toBe('0.50');
    expect(penceToPounds(0)).toBe('0.00');
  });
});

/* ------------------------------------------------------------------ */
/*  buildGiftAidCsv                                                    */
/* ------------------------------------------------------------------ */

describe('buildGiftAidCsv', () => {
  it('correct header and row count -- 3 rows produces 4 lines', () => {
    const rows = [
      makeRow({ firstNameOrInitial: 'Alice', lastName: 'Jones' }),
      makeRow({ firstNameOrInitial: 'Bob', lastName: 'Green' }),
      makeRow({ firstNameOrInitial: 'Carol', lastName: 'White' }),
    ];
    const csv = buildGiftAidCsv(rows);
    const lines = csv.split('\n');

    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(
      'Title,First Name or Initial,Last Name,House Name or Number,Postcode,Donation Date,Amount'
    );
    expect(lines[1]).toContain('Alice');
    expect(lines[2]).toContain('Bob');
    expect(lines[3]).toContain('Carol');
  });

  it('escapes commas in fields with double-quote wrapping', () => {
    const rows = [
      makeRow({ houseNameOrNumber: '10 High Street, Flat 2, London' }),
    ];
    const csv = buildGiftAidCsv(rows);
    const lines = csv.split('\n');

    // The house name/number field should be wrapped in double quotes
    expect(lines[1]).toContain('"10 High Street, Flat 2, London"');
  });

  it('escapes double quotes in fields by doubling them', () => {
    const rows = [
      makeRow({ lastName: 'Smith "Johnny"' }),
    ];
    const csv = buildGiftAidCsv(rows);
    const lines = csv.split('\n');

    expect(lines[1]).toContain('"Smith ""Johnny"""');
  });

  it('empty rows -- returns just the header line', () => {
    const csv = buildGiftAidCsv([]);
    const lines = csv.split('\n');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe(
      'Title,First Name or Initial,Last Name,House Name or Number,Postcode,Donation Date,Amount'
    );
  });
});

describe('buildGiftAidHmrcRow', () => {
  it('maps donor and donation fields to HMRC export columns', () => {
    const row = buildGiftAidHmrcRow({
      donor: {
        title: 'Mrs',
        full_name: 'Jane Smith',
        first_name: 'Jane',
        last_name: 'Smith',
        house_name_or_number: '42A',
        address: '42A Church Road',
        postcode: 'ZZ1 2YY',
      },
      donationDate: '2025-06-15',
      amountPence: 2500,
    });

    expect(row).toEqual({
      title: 'Mrs',
      firstNameOrInitial: 'Jane',
      lastName: 'Smith',
      houseNameOrNumber: '42A',
      postcode: 'ZZ1 2YY',
      donationDate: '2025-06-15',
      amountPounds: '25.00',
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Double-claim prevention via buildClaimPreview                      */
/* ------------------------------------------------------------------ */

describe('Double-claim prevention', () => {
  it('donation with existing gift_aid_claim_id is ineligible', () => {
    const donations = [
      makeDonation({
        id: 'don-already-claimed',
        gift_aid_claim_id: 'existing-claim-id',
      }),
    ];

    const result = buildClaimPreview(donations, '2025-01-01', '2025-12-31');

    expect(result.eligibleDonations).toHaveLength(0);
    expect(result.ineligibleDonations).toHaveLength(1);
    expect(result.ineligibleDonations[0].donationId).toBe('don-already-claimed');
    expect(result.ineligibleDonations[0].reason).toContain(
      'already been included in a Gift Aid claim'
    );
    expect(result.totals.eligibleCount).toBe(0);
    expect(result.totals.claimableTotalPence).toBe(0);
  });

  it('mix of unclaimed and already-claimed donations', () => {
    const donations = [
      makeDonation({ id: 'don-unclaimed', amount_pence: 4000 }),
      makeDonation({
        id: 'don-claimed',
        amount_pence: 2000,
        gift_aid_claim_id: 'old-claim',
      }),
    ];

    const result = buildClaimPreview(donations, '2025-01-01', '2025-12-31');

    expect(result.eligibleDonations).toHaveLength(1);
    expect(result.eligibleDonations[0].donationId).toBe('don-unclaimed');
    expect(result.ineligibleDonations).toHaveLength(1);
    expect(result.ineligibleDonations[0].donationId).toBe('don-claimed');
    expect(result.totals.eligibleCount).toBe(1);
    expect(result.totals.eligibleAmountPence).toBe(4000);
    expect(result.totals.claimableTotalPence).toBe(1000);
  });
});
