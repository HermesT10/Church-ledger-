import { createHash } from 'node:crypto';

export interface GiftAidDuplicateCandidate {
  id: string;
  workspaceId: string;
  donorId: string | null;
  donationDate: string | null;
  amountPence: number | null;
  reference: string | null;
  claimId: string | null;
}

export interface GiftAidDuplicateAnalysis {
  fingerprint: string | null;
  duplicateDonationIds: string[];
  unclaimedDuplicateDonationIds: string[];
  claimedDuplicateDonationIds: string[];
  hasPossibleDuplicate: boolean;
  hasClaimConflict: boolean;
  warning: string | null;
  blockingError: string | null;
}

export interface GiftAidClaimSelectionGuardResult {
  blockingErrors: string[];
  warnings: string[];
  analysisByDonationId: Map<string, GiftAidDuplicateAnalysis>;
}

export function normalizeGiftAidReference(
  value: string | null | undefined
): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function buildGiftAidDuplicateFingerprint(params: {
  workspaceId: string;
  donorId: string | null;
  donationDate: string | null;
  amountPence: number | null;
  reference: string | null;
}): string | null {
  if (!params.workspaceId || !params.donorId || !params.donationDate) {
    return null;
  }
  if (params.amountPence == null || params.amountPence <= 0) {
    return null;
  }

  const parts = [
    params.workspaceId,
    params.donorId,
    params.donationDate,
    String(params.amountPence),
    normalizeGiftAidReference(params.reference),
  ].join('|');

  return createHash('sha256').update(parts).digest('hex');
}

export function analyzeGiftAidDuplicateCandidates(
  candidates: GiftAidDuplicateCandidate[]
): Map<string, GiftAidDuplicateAnalysis> {
  const fingerprints = new Map<string, GiftAidDuplicateCandidate[]>();
  const result = new Map<string, GiftAidDuplicateAnalysis>();

  for (const candidate of candidates) {
    const fingerprint = buildGiftAidDuplicateFingerprint({
      workspaceId: candidate.workspaceId,
      donorId: candidate.donorId,
      donationDate: candidate.donationDate,
      amountPence: candidate.amountPence,
      reference: candidate.reference,
    });

    result.set(candidate.id, {
      fingerprint,
      duplicateDonationIds: [],
      unclaimedDuplicateDonationIds: [],
      claimedDuplicateDonationIds: [],
      hasPossibleDuplicate: false,
      hasClaimConflict: false,
      warning: null,
      blockingError: null,
    });

    if (!fingerprint) continue;
    const existing = fingerprints.get(fingerprint) ?? [];
    existing.push(candidate);
    fingerprints.set(fingerprint, existing);
  }

  for (const [fingerprint, grouped] of fingerprints.entries()) {
    if (grouped.length < 2) continue;

    for (const candidate of grouped) {
      const others = grouped.filter((other) => other.id !== candidate.id);
      const claimed = others.filter((other) => Boolean(other.claimId));
      const unclaimed = others.filter((other) => !other.claimId);

      result.set(candidate.id, {
        fingerprint,
        duplicateDonationIds: others.map((other) => other.id),
        unclaimedDuplicateDonationIds: unclaimed.map((other) => other.id),
        claimedDuplicateDonationIds: claimed.map((other) => other.id),
        hasPossibleDuplicate: others.length > 0,
        hasClaimConflict: claimed.length > 0,
        warning:
          others.length > 0
            ? `Possible duplicate donation detected (${others.length} matching donation${others.length === 1 ? '' : 's'}).`
            : null,
        blockingError:
          claimed.length > 0
            ? `Possible duplicate matches donation${claimed.length === 1 ? '' : 's'} already included in another Gift Aid claim.`
            : null,
      });
    }
  }

  return result;
}

export function evaluateGiftAidClaimSelectionGuardrails(params: {
  selectedDonationIds: string[];
  candidates: GiftAidDuplicateCandidate[];
}): GiftAidClaimSelectionGuardResult {
  const analysisByDonationId = analyzeGiftAidDuplicateCandidates(params.candidates);
  const selectedIdSet = new Set(params.selectedDonationIds);
  const blockingErrors = new Set<string>();
  const warnings = new Set<string>();

  for (const candidate of params.candidates) {
    if (!selectedIdSet.has(candidate.id)) continue;

    if (candidate.claimId) {
      blockingErrors.add(
        `Donation ${candidate.id} is already included in Gift Aid claim ${candidate.claimId}.`
      );
    }

    const analysis = analysisByDonationId.get(candidate.id);
    if (!analysis || !analysis.fingerprint) continue;

    const selectedPeerDuplicates = analysis.unclaimedDuplicateDonationIds.filter((id) =>
      selectedIdSet.has(id)
    );

    if (selectedPeerDuplicates.length > 0) {
      const relatedIds = [candidate.id, ...selectedPeerDuplicates]
        .sort()
        .join(', ');
      blockingErrors.add(
        `Possible duplicate donations selected for this claim: ${relatedIds}.`
      );
    }

    if (analysis.claimedDuplicateDonationIds.length > 0) {
      blockingErrors.add(
        `${analysis.blockingError} Donation ${candidate.id} matches ${analysis.claimedDuplicateDonationIds.join(', ')}.`
      );
    } else if (analysis.warning) {
      warnings.add(`${analysis.warning} Donation ${candidate.id}.`);
    }
  }

  return {
    blockingErrors: Array.from(blockingErrors),
    warnings: Array.from(warnings),
    analysisByDonationId,
  };
}
