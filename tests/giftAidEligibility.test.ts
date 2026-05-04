import { describe, it, expect } from 'vitest';
import {
  evaluateGiftAidEligibility,
  type EligibilityInput,
} from '@/lib/giftaid/eligibility';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const VALID_DONOR = {
  full_name: 'John Smith',
  first_name: 'John',
  last_name: 'Smith',
  house_name_or_number: '123',
  address: '123 Church Lane',
  postcode: 'AB1 2CD',
};

const ACTIVE_DECLARATION = {
  id: 'decl-1',
  status: 'active' as const,
  start_date: '2024-01-01',
  end_date: null,
  is_active: true,
};

function makeInput(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    donation: {
      donation_date: '2025-06-15',
      amount_pence: 2500,
      gift_aid_claim_id: null,
    },
    donor: VALID_DONOR,
    declarations: [ACTIVE_DECLARATION],
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('evaluateGiftAidEligibility', () => {
  it('eligible donation passes', () => {
    const result = evaluateGiftAidEligibility(makeInput());
    expect(result.eligible).toBe(true);
    expect(result.status).toBe('eligible');
    expect(result.reason).toBeUndefined();
    expect(result.issues).toHaveLength(0);
    expect(result.matchedDeclarationId).toBe('decl-1');
  });

  it('missing donor fails', () => {
    const result = evaluateGiftAidEligibility(makeInput({ donor: null }));
    expect(result.eligible).toBe(false);
    expect(result.status).toBe('unmatched');
    expect(result.reason).toContain('No donor linked');
    expect(result.issues.map((issue) => issue.code)).toContain('missing_donor');
  });

  it('missing first name or initial needs review', () => {
    const result = evaluateGiftAidEligibility(
      makeInput({
        donor: {
          ...VALID_DONOR,
          full_name: 'Smith',
          first_name: null,
        },
      })
    );
    expect(result.eligible).toBe(false);
    expect(result.status).toBe('needs_review');
    expect(result.issues.map((issue) => issue.code)).toContain(
      'missing_first_name_or_initial'
    );
  });

  it('single-character first name counts as an initial', () => {
    const result = evaluateGiftAidEligibility(
      makeInput({
        donor: {
          ...VALID_DONOR,
          first_name: 'J',
        },
      })
    );
    expect(result.eligible).toBe(true);
    expect(result.status).toBe('eligible');
  });

  it('missing last name needs review', () => {
    const result = evaluateGiftAidEligibility(
      makeInput({
        donor: {
          ...VALID_DONOR,
          full_name: 'John',
          last_name: null,
        },
      })
    );
    expect(result.eligible).toBe(false);
    expect(result.status).toBe('needs_review');
    expect(result.issues.map((issue) => issue.code)).toContain(
      'missing_last_name'
    );
  });

  it('missing house name or number needs review', () => {
    const result = evaluateGiftAidEligibility(
      makeInput({
        donor: {
          ...VALID_DONOR,
          house_name_or_number: null,
          address: '  ',
        },
      })
    );
    expect(result.eligible).toBe(false);
    expect(result.status).toBe('needs_review');
    expect(result.issues.map((issue) => issue.code)).toContain(
      'missing_house_name_or_number'
    );
  });

  it('missing postcode needs review', () => {
    const result = evaluateGiftAidEligibility(
      makeInput({
        donor: { ...VALID_DONOR, postcode: null },
      })
    );
    expect(result.eligible).toBe(false);
    expect(result.status).toBe('needs_review');
    expect(result.issues.map((issue) => issue.code)).toContain(
      'missing_postcode'
    );
  });

  it('declaration not active for the donation date becomes matched_no_declaration', () => {
    const result = evaluateGiftAidEligibility(
      makeInput({
        declarations: [
          {
            id: 'decl-2',
            status: 'cancelled',
            start_date: '2024-01-01',
            end_date: null,
            is_active: false,
          },
        ],
      })
    );
    expect(result.eligible).toBe(false);
    expect(result.status).toBe('matched_no_declaration');
    expect(result.reason).toContain('No active Gift Aid declaration');
  });

  it('declaration date range misses (donation before start) fails', () => {
    const result = evaluateGiftAidEligibility(
      makeInput({
        donation: {
          donation_date: '2023-06-01',
          amount_pence: 2500,
          gift_aid_claim_id: null,
        },
        declarations: [
          {
            id: 'decl-2',
            status: 'active',
            start_date: '2024-01-01',
            end_date: null,
            is_active: true,
          },
        ],
      })
    );
    expect(result.eligible).toBe(false);
    expect(result.status).toBe('matched_no_declaration');
    expect(result.reason).toContain('No active Gift Aid declaration');
  });

  it('no declarations at all becomes matched_no_declaration', () => {
    const result = evaluateGiftAidEligibility(makeInput({ declarations: [] }));
    expect(result.eligible).toBe(false);
    expect(result.status).toBe('matched_no_declaration');
    expect(result.issues.map((issue) => issue.code)).toContain(
      'missing_declaration'
    );
  });

  it('invalid donation date is ineligible', () => {
    const result = evaluateGiftAidEligibility(
      makeInput({
        donation: {
          donation_date: 'not-a-date',
          amount_pence: 2500,
          gift_aid_claim_id: null,
        },
      })
    );
    expect(result.eligible).toBe(false);
    expect(result.status).toBe('ineligible');
    expect(result.issues.map((issue) => issue.code)).toContain(
      'invalid_donation_date'
    );
  });

  it('zero amount is ineligible', () => {
    const result = evaluateGiftAidEligibility(
      makeInput({
        donation: {
          donation_date: '2025-06-15',
          amount_pence: 0,
          gift_aid_claim_id: null,
        },
      })
    );
    expect(result.eligible).toBe(false);
    expect(result.status).toBe('ineligible');
    expect(result.issues.map((issue) => issue.code)).toContain(
      'non_positive_amount'
    );
  });

  it('already claimed is ineligible', () => {
    const result = evaluateGiftAidEligibility(
      makeInput({
        donation: {
          donation_date: '2025-06-15',
          amount_pence: 2500,
          gift_aid_claim_id: 'some-claim-id',
        },
      })
    );
    expect(result.eligible).toBe(false);
    expect(result.status).toBe('ineligible');
    expect(result.reason).toContain('already been included in a Gift Aid claim');
  });

  it('multiple declarations, one valid, passes', () => {
    const result = evaluateGiftAidEligibility(
      makeInput({
        donation: {
          donation_date: '2025-06-15',
          amount_pence: 2500,
          gift_aid_claim_id: null,
        },
        declarations: [
          // Expired declaration
          {
            id: 'decl-expired',
            status: 'expired',
            start_date: '2023-01-01',
            end_date: '2023-12-31',
            is_active: true,
          },
          // Current valid declaration
          {
            id: 'decl-current',
            status: 'active',
            start_date: '2025-01-01',
            end_date: null,
            is_active: true,
          },
        ],
      })
    );
    expect(result.eligible).toBe(true);
    expect(result.matchedDeclarationId).toBe('decl-current');
  });

  it('collects multiple donor issues together', () => {
    const result = evaluateGiftAidEligibility(
      makeInput({
        donor: {
          ...VALID_DONOR,
          full_name: 'Smith',
          first_name: null,
          last_name: null,
          house_name_or_number: null,
          address: null,
          postcode: null,
        },
      })
    );
    expect(result.eligible).toBe(false);
    expect(result.status).toBe('needs_review');
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'missing_first_name_or_initial',
        'missing_last_name',
        'missing_house_name_or_number',
        'missing_postcode',
      ])
    );
  });
});
