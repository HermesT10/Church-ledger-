import { describe, expect, it } from 'vitest';
import {
  buildDonationDonorMatchAttempts,
  type MatchableGiftAidDonation,
  type MatchableGiftAidDonor,
} from '@/lib/giftaid/matching';

const DONORS: MatchableGiftAidDonor[] = [
  {
    id: 'donor-1',
    fullName: 'Jane Smith',
    email: 'jane@example.com',
    referenceCode: 'JSMITH01',
  },
  {
    id: 'donor-2',
    fullName: 'Janet Smythe',
    email: 'janet@example.com',
    referenceCode: 'JSMYTHE02',
  },
];

function createDonation(
  overrides: Partial<MatchableGiftAidDonation> = {}
): MatchableGiftAidDonation {
  return {
    id: 'donation-1',
    donorId: null,
    bankTransactionId: 'bank-line-1',
    givingImportRowId: null,
    source: 'other',
    providerReference: null,
    bankReference: null,
    bankDescription: null,
    importedDonorName: null,
    importedReference: null,
    importedRaw: null,
    ...overrides,
  };
}

describe('buildDonationDonorMatchAttempts', () => {
  it('auto-confirms an exact donor reference code match', () => {
    const attempts = buildDonationDonorMatchAttempts({
      donation: createDonation({
        bankReference: 'Standing order JSMITH01',
      }),
      donors: DONORS,
    });

    expect(attempts[0]).toMatchObject({
      donorId: 'donor-1',
      matchMethod: 'exact_reference_code',
      reviewStatus: 'auto_confirmed',
    });
  });

  it('matches exact imported giving metadata when available', () => {
    const attempts = buildDonationDonorMatchAttempts({
      donation: createDonation({
        bankTransactionId: null,
        givingImportRowId: 'giving-row-1',
        source: 'gocardless',
        importedDonorName: 'Jane Smith',
        importedReference: null,
        importedRaw: {
          Donor: 'Jane Smith',
          Email: 'jane@example.com',
        },
      }),
      donors: DONORS,
    });

    expect(attempts[0]).toMatchObject({
      donorId: 'donor-1',
      matchMethod: 'exact_import_metadata',
      reviewStatus: 'auto_confirmed',
    });
  });

  it('keeps ambiguous fuzzy matches as suggestions', () => {
    const attempts = buildDonationDonorMatchAttempts({
      donation: createDonation({
        importedDonorName: 'Jane Smithh',
      }),
      donors: DONORS,
    });

    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts[0].matchMethod).toBe('fuzzy_name_reference');
    expect(attempts[0].reviewStatus).toBe('suggested');
  });

  it('returns no attempts when no donor can be matched', () => {
    const attempts = buildDonationDonorMatchAttempts({
      donation: createDonation({
        bankReference: 'Church boiler reimbursement',
      }),
      donors: DONORS,
    });

    expect(attempts).toEqual([]);
  });
});
