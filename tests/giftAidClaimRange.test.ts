import { describe, expect, it } from 'vitest';
import { buildClaimPreview, type ClaimPreviewDonation, type EligibilityDeclaration } from '@/lib/giftaid/eligibility';
import {
  buildGiftAidClaimBuilderWarnings,
  isDonationOutsideHmrcClaimTimeLimit,
  resolveGiftAidClaimDateRange,
} from '@/lib/giftaid/claim-range';

const ACTIVE_DECLARATION: EligibilityDeclaration = {
  id: 'decl-1',
  status: 'active',
  start_date: '2024-01-01',
  end_date: null,
  is_active: true,
};

const VALID_DONOR = {
  full_name: 'Jane Smith',
  first_name: 'Jane',
  last_name: 'Smith',
  house_name_or_number: '42',
  address: '42 Church Road',
  postcode: 'AB1 2CD',
};

function makeDonation(
  overrides: Partial<ClaimPreviewDonation> = {}
): ClaimPreviewDonation {
  return {
    id: 'don-1',
    donation_date: '2025-01-10',
    amount_pence: 2000,
    gift_aid_claim_id: null,
    donor: VALID_DONOR,
    declarations: [ACTIVE_DECLARATION],
    ...overrides,
  };
}

describe('resolveGiftAidClaimDateRange', () => {
  const now = new Date('2026-04-15T12:00:00.000Z');

  it('builds this month and last month ranges', () => {
    expect(
      resolveGiftAidClaimDateRange({
        preset: 'this_month',
        now,
      })
    ).toEqual({
      preset: 'this_month',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    });

    expect(
      resolveGiftAidClaimDateRange({
        preset: 'last_month',
        now,
      })
    ).toEqual({
      preset: 'last_month',
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    });
  });

  it('builds calendar quarter ranges', () => {
    expect(
      resolveGiftAidClaimDateRange({
        preset: 'this_quarter',
        now,
      })
    ).toEqual({
      preset: 'this_quarter',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
    });

    expect(
      resolveGiftAidClaimDateRange({
        preset: 'last_quarter',
        now,
      })
    ).toEqual({
      preset: 'last_quarter',
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    });
  });

  it('builds financial year to date from the configured start month', () => {
    expect(
      resolveGiftAidClaimDateRange({
        preset: 'financial_year_to_date',
        fiscalYearStartMonth: 4,
        now,
      })
    ).toEqual({
      preset: 'financial_year_to_date',
      startDate: '2026-04-01',
      endDate: '2026-04-15',
    });
  });

  it('preserves a custom multi-month range', () => {
    expect(
      resolveGiftAidClaimDateRange({
        preset: 'custom',
        customStartDate: '2026-01-15',
        customEndDate: '2026-04-20',
        now,
      })
    ).toEqual({
      preset: 'custom',
      startDate: '2026-01-15',
      endDate: '2026-04-20',
    });
  });
});

describe('Gift Aid claim range warnings', () => {
  it('flags HMRC time-limit and spreadsheet size warnings', () => {
    const warnings = buildGiftAidClaimBuilderWarnings({
      outsideHmrcLimitCount: 2,
      alreadyClaimedCount: 1,
      missingDonorDetailsCount: 3,
      invalidDeclarationCount: 4,
      eligibleDonationCount: 1001,
      duplicateWarnings: ['Possible duplicate detected.'],
    });

    expect(warnings).toContain(
      '2 donation(s) in the selected range fall outside the HMRC Gift Aid claim time limit and were excluded.'
    );
    expect(warnings).toContain(
      '1 donation(s) in this range have already been included in another Gift Aid claim and were excluded.'
    );
    expect(warnings).toContain(
      '3 donation(s) are missing donor details required for the HMRC schedule.'
    );
    expect(warnings).toContain(
      '4 donation(s) are missing a valid Gift Aid declaration for the selected donation date.'
    );
    expect(warnings).toContain(
      'This spreadsheet export would exceed 1,000 Gift Aid donations. Split the selected range into smaller batches before export.'
    );
    expect(warnings).toContain('Possible duplicate detected.');
  });

  it('detects donations outside the HMRC claim window', () => {
    expect(
      isDonationOutsideHmrcClaimTimeLimit({
        donationDate: '2021-04-14',
        asOfDate: new Date('2026-04-15T12:00:00.000Z'),
      })
    ).toBe(true);

    expect(
      isDonationOutsideHmrcClaimTimeLimit({
        donationDate: '2022-04-15',
        asOfDate: new Date('2026-04-15T12:00:00.000Z'),
      })
    ).toBe(false);
  });
});

describe('buildClaimPreview with multi-month ranges', () => {
  it('keeps donations spanning multiple months inside a custom range-based batch', () => {
    const result = buildClaimPreview(
      [
        makeDonation({ id: 'don-1', donation_date: '2025-01-10', amount_pence: 2000 }),
        makeDonation({ id: 'don-2', donation_date: '2025-03-15', amount_pence: 3000 }),
        makeDonation({ id: 'don-3', donation_date: '2025-05-20', amount_pence: 4000 }),
      ],
      '2025-01-01',
      '2025-06-30'
    );

    expect(result.startDate).toBe('2025-01-01');
    expect(result.endDate).toBe('2025-06-30');
    expect(result.eligibleDonations).toHaveLength(3);
    expect(result.totals.eligibleAmountPence).toBe(9000);
    expect(result.totals.claimableTotalPence).toBe(2250);
  });
});
