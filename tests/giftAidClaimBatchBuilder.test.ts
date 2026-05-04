import { describe, expect, it } from 'vitest';
import {
  buildManualClaimLineEdit,
  groupClaimBatchExceptions,
  validateDonationForClaimBatch,
} from '@/lib/giftaid/claim-batch-builder';

const VALID_DONATION = {
  id: 'don-1',
  donorId: 'donor-1',
  donorFullName: 'Jane Smith',
  donorAddress: '10 Church Road',
  donorPostcode: 'AB1 2CD',
  donationDate: '2025-06-15',
  amountPence: 4000,
  giftAidClaimId: null,
  giftAidClaimBatchId: null,
  status: 'posted',
  bankTransactionId: 'bank-1',
  bankTransactionReconciled: true,
};

const ACTIVE_DECLARATION = {
  id: 'decl-1',
  donorId: 'donor-1',
  status: 'active',
  startDate: '2024-01-01',
  endDate: null,
};

describe('validateDonationForClaimBatch', () => {
  it('accepts valid, posted, declaration-covered donations', () => {
    const result = validateDonationForClaimBatch({
      donation: VALID_DONATION,
      declarations: [ACTIVE_DECLARATION],
      requireBankTransactionLink: true,
    });

    expect(result.valid).toBe(true);
    expect(result.declarationId).toBe('decl-1');
    expect(result.claimAmountPence).toBe(1000);
    expect(result.issues).toHaveLength(0);
  });

  it('returns a missing declaration exception', () => {
    const result = validateDonationForClaimBatch({
      donation: VALID_DONATION,
      declarations: [],
      requireBankTransactionLink: false,
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('missing_declaration');
  });

  it('detects invalid donor details and missing postcode', () => {
    const result = validateDonationForClaimBatch({
      donation: {
        ...VALID_DONATION,
        donorFullName: '',
        donorAddress: '',
        donorPostcode: '',
      },
      declarations: [ACTIVE_DECLARATION],
      requireBankTransactionLink: false,
    });

    expect(result.issues.map((issue) => issue.code)).toContain(
      'invalid_donor_details'
    );
    expect(result.issues.map((issue) => issue.code)).toContain('missing_postcode');
  });

  it('blocks already claimed donations', () => {
    const result = validateDonationForClaimBatch({
      donation: {
        ...VALID_DONATION,
        giftAidClaimBatchId: 'batch-1',
      },
      declarations: [ACTIVE_DECLARATION],
      requireBankTransactionLink: false,
    });

    expect(result.issues.map((issue) => issue.code)).toContain('already_claimed');
  });

  it('groups outside declaration period and unreconciled donation exceptions', () => {
    const result = validateDonationForClaimBatch({
      donation: {
        ...VALID_DONATION,
        status: 'draft',
        donationDate: '2023-06-15',
      },
      declarations: [ACTIVE_DECLARATION],
      requireBankTransactionLink: false,
    });

    const grouped = groupClaimBatchExceptions([
      { donationId: VALID_DONATION.id, result },
    ]);

    expect(grouped.get('donation_outside_declaration_period')).toContain('don-1');
    expect(grouped.get('unreconciled_donation')).toContain('don-1');
  });

  it('requires a bank transaction link when settings require it', () => {
    const result = validateDonationForClaimBatch({
      donation: {
        ...VALID_DONATION,
        bankTransactionId: null,
      },
      declarations: [ACTIVE_DECLARATION],
      requireBankTransactionLink: true,
    });

    expect(result.issues.map((issue) => issue.code)).toContain(
      'missing_bank_transaction'
    );
  });
});

describe('buildManualClaimLineEdit', () => {
  it('requires a reason for manual edits', () => {
    expect(
      buildManualClaimLineEdit({
        fieldName: 'donor_postcode_snapshot',
        originalValue: 'AB1 2CD',
        editedValue: 'AB1 3CD',
        reason: '',
      }).valid
    ).toBe(false);
  });

  it('captures original value, edited value, and reason', () => {
    const result = buildManualClaimLineEdit({
      fieldName: 'donor_postcode_snapshot',
      originalValue: 'AB1 2CD',
      editedValue: 'AB1 3CD',
      reason: 'Corrected typo from signed declaration.',
    });

    expect(result.valid).toBe(true);
    expect(result.edit?.originalValue).toBe('AB1 2CD');
    expect(result.edit?.editedValue).toBe('AB1 3CD');
  });
});
