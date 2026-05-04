import { describe, expect, it } from 'vitest';
import {
  analyzeGiftAidDuplicateCandidates,
  buildGiftAidDuplicateFingerprint,
  evaluateGiftAidClaimSelectionGuardrails,
  normalizeGiftAidReference,
} from '@/lib/giftaid/duplicates';

describe('normalizeGiftAidReference', () => {
  it('normalizes spacing, punctuation, and case', () => {
    expect(normalizeGiftAidReference(' Ref-001 / Sunday Gift ')).toBe(
      'ref 001 sunday gift'
    );
  });
});

describe('buildGiftAidDuplicateFingerprint', () => {
  it('builds the same fingerprint for normalized references', () => {
    const left = buildGiftAidDuplicateFingerprint({
      workspaceId: 'org-1',
      donorId: 'donor-1',
      donationDate: '2025-06-15',
      amountPence: 2500,
      reference: 'Ref-001',
    });
    const right = buildGiftAidDuplicateFingerprint({
      workspaceId: 'org-1',
      donorId: 'donor-1',
      donationDate: '2025-06-15',
      amountPence: 2500,
      reference: ' ref 001 ',
    });

    expect(left).toBeTruthy();
    expect(left).toBe(right);
  });

  it('returns null when donor is missing', () => {
    expect(
      buildGiftAidDuplicateFingerprint({
        workspaceId: 'org-1',
        donorId: null,
        donationDate: '2025-06-15',
        amountPence: 2500,
        reference: 'Ref-001',
      })
    ).toBeNull();
  });
});

describe('analyzeGiftAidDuplicateCandidates', () => {
  it('flags peer duplicates as warnings', () => {
    const analysis = analyzeGiftAidDuplicateCandidates([
      {
        id: 'don-1',
        workspaceId: 'org-1',
        donorId: 'donor-1',
        donationDate: '2025-06-15',
        amountPence: 2500,
        reference: 'Ref-001',
        claimId: null,
      },
      {
        id: 'don-2',
        workspaceId: 'org-1',
        donorId: 'donor-1',
        donationDate: '2025-06-15',
        amountPence: 2500,
        reference: 'ref 001',
        claimId: null,
      },
    ]);

    expect(analysis.get('don-1')?.hasPossibleDuplicate).toBe(true);
    expect(analysis.get('don-1')?.hasClaimConflict).toBe(false);
    expect(analysis.get('don-1')?.duplicateDonationIds).toContain('don-2');
  });

  it('flags already-claimed duplicates as blocking', () => {
    const analysis = analyzeGiftAidDuplicateCandidates([
      {
        id: 'don-1',
        workspaceId: 'org-1',
        donorId: 'donor-1',
        donationDate: '2025-06-15',
        amountPence: 2500,
        reference: 'Ref-001',
        claimId: null,
      },
      {
        id: 'don-2',
        workspaceId: 'org-1',
        donorId: 'donor-1',
        donationDate: '2025-06-15',
        amountPence: 2500,
        reference: 'ref 001',
        claimId: 'claim-1',
      },
    ]);

    expect(analysis.get('don-1')?.hasClaimConflict).toBe(true);
    expect(analysis.get('don-1')?.blockingError).toContain(
      'already included in another Gift Aid claim'
    );
  });
});

describe('evaluateGiftAidClaimSelectionGuardrails', () => {
  it('blocks already-claimed donations selected for a new claim', () => {
    const result = evaluateGiftAidClaimSelectionGuardrails({
      selectedDonationIds: ['don-1'],
      candidates: [
        {
          id: 'don-1',
          workspaceId: 'org-1',
          donorId: 'donor-1',
          donationDate: '2025-06-15',
          amountPence: 2500,
          reference: 'Ref-001',
          claimId: 'claim-1',
        },
      ],
    });

    expect(result.blockingErrors.join(' ')).toContain(
      'already included in Gift Aid claim'
    );
  });

  it('blocks duplicate donations selected together', () => {
    const result = evaluateGiftAidClaimSelectionGuardrails({
      selectedDonationIds: ['don-1', 'don-2'],
      candidates: [
        {
          id: 'don-1',
          workspaceId: 'org-1',
          donorId: 'donor-1',
          donationDate: '2025-06-15',
          amountPence: 2500,
          reference: 'Ref-001',
          claimId: null,
        },
        {
          id: 'don-2',
          workspaceId: 'org-1',
          donorId: 'donor-1',
          donationDate: '2025-06-15',
          amountPence: 2500,
          reference: 'ref 001',
          claimId: null,
        },
      ],
    });

    expect(result.blockingErrors.join(' ')).toContain(
      'Possible duplicate donations selected for this claim'
    );
  });
});
