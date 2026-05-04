import { describe, expect, it } from 'vitest';
import {
  buildClaimLineSnapshot,
  calculateGiftAidClaimPence,
  declarationCoversDonation,
  deriveDonationGiftAidStatus,
  resolveDeclarationStatus,
} from '@/lib/giftaid/helpers';

describe('Gift Aid helpers', () => {
  it('marks expired declarations based on end date', () => {
    expect(
      resolveDeclarationStatus(
        { status: 'active', endDate: '2025-01-31' },
        new Date('2025-02-01')
      )
    ).toBe('expired');
  });

  it('checks declaration coverage for the donation date', () => {
    expect(
      declarationCoversDonation({
        donationDate: '2026-04-10',
        declaration: {
          status: 'active',
          startDate: '2026-01-01',
          endDate: null,
        },
      })
    ).toBe(true);

    expect(
      declarationCoversDonation({
        donationDate: '2026-04-10',
        declaration: {
          status: 'cancelled',
          startDate: '2026-01-01',
          endDate: null,
        },
      })
    ).toBe(false);

    expect(
      declarationCoversDonation({
        donationDate: '2026-03-15',
        declaration: {
          status: 'cancelled',
          startDate: '2026-01-01',
          endDate: '2026-03-31',
        },
      })
    ).toBe(true);

    expect(
      declarationCoversDonation({
        donationDate: '2026-04-10',
        declaration: {
          status: 'cancelled',
          startDate: '2026-01-01',
          endDate: '2026-03-31',
        },
      })
    ).toBe(false);
  });

  it('derives production donation statuses consistently', () => {
    expect(
      deriveDonationGiftAidStatus({
        donorId: null,
        declarationStatus: null,
      })
    ).toBe('unmatched');

    expect(
      deriveDonationGiftAidStatus({
        donorId: 'donor-1',
        declarationStatus: 'expired',
      })
    ).toBe('matched_no_declaration');

    expect(
      deriveDonationGiftAidStatus({
        donorId: 'donor-1',
        declarationStatus: 'active',
        manuallyIneligible: true,
      })
    ).toBe('ineligible');

    expect(
      deriveDonationGiftAidStatus({
        donorId: 'donor-1',
        declarationStatus: 'active',
        claimBatchId: 'batch-1',
        batchStatus: 'submitted',
      })
    ).toBe('submitted');
  });

  it('builds an immutable claim line snapshot', () => {
    const line = buildClaimLineSnapshot({
      workspaceId: 'workspace-1',
      claimBatchId: 'batch-1',
      donation: {
        id: 'donation-1',
        donationDate: '2026-04-01',
        grossAmountPence: 4000,
      },
      donor: {
        id: 'donor-1',
        fullName: 'Jane Smith',
        title: 'Mrs',
        firstNameOrInitial: 'Jane',
        lastName: 'Smith',
        houseNameOrNumber: '1',
        address: '1 Church Street',
        postcode: 'AB1 2CD',
      },
      declarationId: 'decl-1',
    });

    expect(line.claimAmountPence).toBe(calculateGiftAidClaimPence(4000));
    expect(line.donorNameSnapshot).toBe('Jane Smith');
    expect(line.donorPostcodeSnapshot).toBe('AB1 2CD');
    expect(line.donorTitleSnapshot).toBe('Mrs');
    expect(line.donorFirstNameOrInitialSnapshot).toBe('Jane');
    expect(line.donorLastNameSnapshot).toBe('Smith');
    expect(line.donorHouseNameOrNumberSnapshot).toBe('1');
  });
});
