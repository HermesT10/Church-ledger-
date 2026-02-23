import { describe, it, expect } from 'vitest';
import {
  evaluateGiftAidEligibility,
  type EligibilityInput,
} from '@/lib/giftaid/eligibility';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const VALID_DONOR = { address: '123 Church Lane', postcode: 'AB1 2CD' };

const ACTIVE_DECLARATION = {
  start_date: '2024-01-01',
  end_date: null,
  is_active: true,
};

function makeInput(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    donation: {
      donation_date: '2025-06-15',
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
    expect(result.reason).toBeUndefined();
  });

  it('missing donor fails', () => {
    const result = evaluateGiftAidEligibility(makeInput({ donor: null }));
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('No donor linked');
  });

  it('missing address fails', () => {
    const result = evaluateGiftAidEligibility(
      makeInput({ donor: { address: null, postcode: 'AB1 2CD' } })
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('address or postcode is missing');
  });

  it('missing postcode fails', () => {
    const result = evaluateGiftAidEligibility(
      makeInput({ donor: { address: '123 Church Lane', postcode: null } })
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('address or postcode is missing');
  });

  it('empty address string fails', () => {
    const result = evaluateGiftAidEligibility(
      makeInput({ donor: { address: '  ', postcode: 'AB1 2CD' } })
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('address or postcode is missing');
  });

  it('declaration not active fails', () => {
    const result = evaluateGiftAidEligibility(
      makeInput({
        declarations: [{ start_date: '2024-01-01', end_date: null, is_active: false }],
      })
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('No valid Gift Aid declaration');
  });

  it('declaration date range misses (donation before start) fails', () => {
    const result = evaluateGiftAidEligibility(
      makeInput({
        donation: { donation_date: '2023-06-01', gift_aid_claim_id: null },
        declarations: [{ start_date: '2024-01-01', end_date: null, is_active: true }],
      })
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('No valid Gift Aid declaration');
  });

  it('declaration ended before donation fails', () => {
    const result = evaluateGiftAidEligibility(
      makeInput({
        donation: { donation_date: '2025-06-15', gift_aid_claim_id: null },
        declarations: [
          { start_date: '2024-01-01', end_date: '2024-12-31', is_active: true },
        ],
      })
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('No valid Gift Aid declaration');
  });

  it('already claimed fails', () => {
    const result = evaluateGiftAidEligibility(
      makeInput({
        donation: {
          donation_date: '2025-06-15',
          gift_aid_claim_id: 'some-claim-id',
        },
      })
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('already been included in a Gift Aid claim');
  });

  it('multiple declarations, one valid, passes', () => {
    const result = evaluateGiftAidEligibility(
      makeInput({
        donation: { donation_date: '2025-06-15', gift_aid_claim_id: null },
        declarations: [
          // Expired declaration
          { start_date: '2023-01-01', end_date: '2023-12-31', is_active: true },
          // Current valid declaration
          { start_date: '2025-01-01', end_date: null, is_active: true },
        ],
      })
    );
    expect(result.eligible).toBe(true);
  });

  it('no declarations at all fails', () => {
    const result = evaluateGiftAidEligibility(
      makeInput({ declarations: [] })
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('No valid Gift Aid declaration');
  });
});
