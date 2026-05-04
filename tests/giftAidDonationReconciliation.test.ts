import { describe, expect, it } from 'vitest';
import {
  assessDonationGiftAidForReconciliation,
  canAddDonationToGiftAidClaim,
  GIFT_AID_DECLARATION_MISSING_ALERT,
} from '@/lib/giftaid/donation-reconciliation';

const VALID_DONOR = {
  full_name: 'Jane Smith',
  first_name: 'Jane',
  last_name: 'Smith',
  house_name_or_number: '10',
  address: '10 Church Road',
  postcode: 'AB1 2CD',
};

const ACTIVE_DECLARATION = {
  id: 'decl-1',
  status: 'active' as const,
  start_date: '2024-01-01',
  end_date: null,
  is_active: true,
};

const DONATION = {
  id: 'don-1',
  donor_id: 'donor-1',
  donation_date: '2025-05-10',
  amount_pence: 4000,
  gift_aid_claim_id: null,
};

describe('assessDonationGiftAidForReconciliation', () => {
  it('marks donations with a valid donor declaration as eligible', () => {
    const result = assessDonationGiftAidForReconciliation({
      giftAidEligible: true,
      donation: DONATION,
      donor: VALID_DONOR,
      declarations: [ACTIVE_DECLARATION],
    });

    expect(result.status).toBe('eligible');
    expect(result.giftAidEligible).toBe(true);
    expect(result.matchedDeclarationId).toBe('decl-1');
    expect(result.estimatedClaimPence).toBe(1000);
  });

  it('warns when the donor has no valid declaration', () => {
    const result = assessDonationGiftAidForReconciliation({
      giftAidEligible: true,
      donation: DONATION,
      donor: VALID_DONOR,
      declarations: [],
    });

    expect(result.status).toBe('missing_declaration');
    expect(result.giftAidEligible).toBe(false);
    expect(result.warning).toBe(GIFT_AID_DECLARATION_MISSING_ALERT);
  });

  it('marks incomplete donor identity as invalid donor details', () => {
    const result = assessDonationGiftAidForReconciliation({
      giftAidEligible: true,
      donation: DONATION,
      donor: { ...VALID_DONOR, first_name: null, full_name: 'Smith' },
      declarations: [ACTIVE_DECLARATION],
    });

    expect(result.status).toBe('invalid_donor_details');
    expect(result.reason).toContain('Donor first name or initial is required');
  });

  it('uses missing declaration for quick-created donors until a declaration exists', () => {
    const result = assessDonationGiftAidForReconciliation({
      giftAidEligible: true,
      donation: { ...DONATION, donor_id: 'new-donor' },
      donor: { ...VALID_DONOR, full_name: 'New Donor' },
      declarations: [],
    });

    expect(result.status).toBe('missing_declaration');
  });
});

describe('canAddDonationToGiftAidClaim', () => {
  it('blocks donations that are already linked to a claim batch', () => {
    const result = canAddDonationToGiftAidClaim({
      giftAidClaimBatchId: 'batch-1',
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('batch-1');
  });

  it('blocks donations in exported/submitted/paid lifecycle statuses', () => {
    expect(
      canAddDonationToGiftAidClaim({ giftAidStatus: 'exported' }).allowed
    ).toBe(false);
    expect(
      canAddDonationToGiftAidClaim({ giftAidStatus: 'submitted' }).allowed
    ).toBe(false);
    expect(canAddDonationToGiftAidClaim({ giftAidStatus: 'paid' }).allowed).toBe(
      false
    );
  });

  it('allows unclaimed donations', () => {
    expect(canAddDonationToGiftAidClaim({ giftAidStatus: 'eligible' }).allowed).toBe(
      true
    );
  });
});
