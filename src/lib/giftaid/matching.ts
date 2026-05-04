import { createClient } from '@/lib/supabase/server';
import { getActiveOrg } from '@/lib/org';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { assertWriteAllowed } from '@/lib/demo';
import { invalidateOrgReportCache } from '@/lib/cache';
import type {
  GiftAidMatchMethod,
  GiftAidMatchReviewStatus,
} from '@/lib/giftaid/model';
import { syncDonationGiftAidValidation } from '@/lib/giftaid/validation';

const AUTO_CONFIRM_THRESHOLD = 0.95;
const REVIEW_THRESHOLD = 0.6;
const DECISIVE_GAP = 0.08;
const MAX_ATTEMPTS_PER_DONATION = 5;

export interface MatchableGiftAidDonor {
  id: string;
  fullName: string;
  email: string | null;
  referenceCode: string | null;
}

export interface MatchableGiftAidDonation {
  id: string;
  donorId: string | null;
  bankTransactionId: string | null;
  givingImportRowId: string | null;
  source: string;
  providerReference: string | null;
  bankReference: string | null;
  bankDescription: string | null;
  importedDonorName: string | null;
  importedReference: string | null;
  importedRaw: Record<string, unknown> | null;
}

export interface GiftAidDonorMatchAttempt {
  donorId: string;
  donorName: string;
  matchMethod: GiftAidMatchMethod;
  confidenceScore: number;
  reviewStatus: GiftAidMatchReviewStatus;
  notes: string;
  matchMetadata: Record<string, unknown>;
}

export interface GiftAidDonorMatchingResult {
  processed: number;
  autoConfirmed: number;
  suggested: number;
  unmatched: number;
  errors: string[];
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeCompact(value: string | null | undefined): string {
  return normalizeText(value).replace(/\s+/g, '');
}

function normalizeReferenceCode(value: string | null | undefined): string {
  return normalizeCompact(value);
}

function tokenize(value: string | null | undefined): string[] {
  return normalizeText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function bigrams(value: string): string[] {
  if (value.length < 2) {
    return value ? [value] : [];
  }

  const result: string[] = [];
  for (let index = 0; index < value.length - 1; index += 1) {
    result.push(value.slice(index, index + 2));
  }
  return result;
}

function diceCoefficient(left: string, right: string): number {
  if (!left || !right) {
    return 0;
  }
  if (left === right) {
    return 1;
  }

  const leftBigrams = bigrams(left);
  const rightBigrams = bigrams(right);
  if (leftBigrams.length === 0 || rightBigrams.length === 0) {
    return 0;
  }

  const rightCounts = new Map<string, number>();
  for (const token of rightBigrams) {
    rightCounts.set(token, (rightCounts.get(token) ?? 0) + 1);
  }

  let overlap = 0;
  for (const token of leftBigrams) {
    const count = rightCounts.get(token) ?? 0;
    if (count > 0) {
      overlap += 1;
      rightCounts.set(token, count - 1);
    }
  }

  return (2 * overlap) / (leftBigrams.length + rightBigrams.length);
}

function tokenOverlapScore(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let overlap = 0;

  for (const token of leftSet) {
    if (rightSet.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(leftSet.size, rightSet.size);
}

function buildRawSearchText(raw: Record<string, unknown> | null): string {
  if (!raw) {
    return '';
  }

  return Object.values(raw)
    .map((value) => String(value ?? ''))
    .join(' ');
}

function addBestAttempt(
  attempts: Map<string, GiftAidDonorMatchAttempt>,
  candidate: GiftAidDonorMatchAttempt
) {
  const existing = attempts.get(candidate.donorId);
  if (!existing || candidate.confidenceScore > existing.confidenceScore) {
    attempts.set(candidate.donorId, candidate);
  }
}

function buildExactReferenceAttempt(
  donation: MatchableGiftAidDonation,
  donor: MatchableGiftAidDonor
): GiftAidDonorMatchAttempt | null {
  const referenceCode = normalizeReferenceCode(donor.referenceCode);
  if (!referenceCode) {
    return null;
  }

  const references = [
    donation.providerReference,
    donation.bankReference,
    donation.importedReference,
    buildRawSearchText(donation.importedRaw),
  ]
    .map(normalizeReferenceCode)
    .filter(Boolean);

  const matched = references.find(
    (reference) =>
      reference === referenceCode ||
      reference.includes(referenceCode) ||
      referenceCode.includes(reference)
  );

  if (!matched) {
    return null;
  }

  return {
    donorId: donor.id,
    donorName: donor.fullName,
    matchMethod: 'exact_reference_code',
    confidenceScore: 0.99,
    reviewStatus: 'suggested',
    notes: `Reference code ${donor.referenceCode} matched exactly.`,
    matchMetadata: {
      matchedReferenceCode: donor.referenceCode,
      matchedText: matched,
    },
  };
}

function buildExactImportMetadataAttempt(
  donation: MatchableGiftAidDonation,
  donor: MatchableGiftAidDonor
): GiftAidDonorMatchAttempt | null {
  if (!donation.givingImportRowId) {
    return null;
  }

  const importedName = normalizeCompact(donation.importedDonorName);
  const importedReference = normalizeReferenceCode(donation.importedReference);
  const donorName = normalizeCompact(donor.fullName);
  const donorReferenceCode = normalizeReferenceCode(donor.referenceCode);
  const donorEmailLocalPart = normalizeReferenceCode(
    donor.email?.split('@')[0] ?? null
  );
  const rawText = normalizeReferenceCode(buildRawSearchText(donation.importedRaw));

  const exactName = importedName && donorName && importedName === donorName;
  const exactReference =
    donorReferenceCode &&
    importedReference &&
    importedReference === donorReferenceCode;
  const exactRawEmail =
    donorEmailLocalPart &&
    rawText &&
    rawText.includes(donorEmailLocalPart);

  if (!exactName && !exactReference && !exactRawEmail) {
    return null;
  }

  return {
    donorId: donor.id,
    donorName: donor.fullName,
    matchMethod: 'exact_import_metadata',
    confidenceScore: exactReference ? 0.98 : 0.96,
    reviewStatus: 'suggested',
    notes: 'Imported giving metadata matched this donor exactly.',
    matchMetadata: {
      importedDonorName: donation.importedDonorName,
      importedReference: donation.importedReference,
      importedEmailMatch: exactRawEmail,
    },
  };
}

function buildExactFullNameAttempt(
  donation: MatchableGiftAidDonation,
  donor: MatchableGiftAidDonor
): GiftAidDonorMatchAttempt | null {
  const donorName = normalizeCompact(donor.fullName);
  if (!donorName) {
    return null;
  }

  const exactCandidates = [
    donation.importedDonorName,
    donation.providerReference,
    donation.bankReference,
  ]
    .map(normalizeCompact)
    .filter(Boolean);

  const matched = exactCandidates.find((candidate) => candidate === donorName);
  if (!matched) {
    return null;
  }

  return {
    donorId: donor.id,
    donorName: donor.fullName,
    matchMethod: 'exact_normalized_full_name',
    confidenceScore: 0.91,
    reviewStatus: 'suggested',
    notes: 'Normalized donor name matched exactly.',
    matchMetadata: {
      matchedName: donor.fullName,
    },
  };
}

function buildFuzzyAttempt(
  donation: MatchableGiftAidDonation,
  donor: MatchableGiftAidDonor
): GiftAidDonorMatchAttempt | null {
  const donorName = normalizeCompact(donor.fullName);
  const donorTokens = tokenize(donor.fullName);

  const candidates = [
    donation.importedDonorName,
    donation.bankReference,
    donation.providerReference,
    donation.bankDescription,
  ].filter(Boolean) as string[];

  let bestScore = 0;
  let bestText = '';

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeCompact(candidate);
    const candidateTokens = tokenize(candidate);
    const score = Math.max(
      diceCoefficient(donorName, normalizedCandidate),
      tokenOverlapScore(donorTokens, candidateTokens)
    );

    if (score > bestScore) {
      bestScore = score;
      bestText = candidate;
    }
  }

  if (bestScore < 0.65) {
    return null;
  }

  const confidenceScore = Math.min(0.89, 0.55 + bestScore * 0.35);

  return {
    donorId: donor.id,
    donorName: donor.fullName,
    matchMethod: 'fuzzy_name_reference',
    confidenceScore,
    reviewStatus: 'suggested',
    notes: 'Fuzzy donor name/reference match.',
    matchMetadata: {
      matchedText: bestText,
      rawScore: Number(bestScore.toFixed(4)),
    },
  };
}

export function buildDonationDonorMatchAttempts(params: {
  donation: MatchableGiftAidDonation;
  donors: MatchableGiftAidDonor[];
}): GiftAidDonorMatchAttempt[] {
  const attempts = new Map<string, GiftAidDonorMatchAttempt>();

  for (const donor of params.donors) {
    const exactReference = buildExactReferenceAttempt(params.donation, donor);
    if (exactReference) addBestAttempt(attempts, exactReference);

    const exactImportMetadata = buildExactImportMetadataAttempt(
      params.donation,
      donor
    );
    if (exactImportMetadata) addBestAttempt(attempts, exactImportMetadata);

    const exactFullName = buildExactFullNameAttempt(params.donation, donor);
    if (exactFullName) addBestAttempt(attempts, exactFullName);

    const fuzzyAttempt = buildFuzzyAttempt(params.donation, donor);
    if (fuzzyAttempt) addBestAttempt(attempts, fuzzyAttempt);
  }

  const sorted = Array.from(attempts.values())
    .filter((attempt) => attempt.confidenceScore >= REVIEW_THRESHOLD)
    .sort((left, right) => right.confidenceScore - left.confidenceScore)
    .slice(0, MAX_ATTEMPTS_PER_DONATION);

  const top = sorted[0];
  const runnerUp = sorted[1];
  const shouldAutoConfirm =
    !!top &&
    top.confidenceScore >= AUTO_CONFIRM_THRESHOLD &&
    (!runnerUp || top.confidenceScore - runnerUp.confidenceScore >= DECISIVE_GAP);

  return sorted.map((attempt, index) => {
    if (!top) {
      return attempt;
    }

    if (shouldAutoConfirm && index === 0) {
      return { ...attempt, reviewStatus: 'auto_confirmed' };
    }

    if (shouldAutoConfirm && index > 0) {
      return { ...attempt, reviewStatus: 'superseded' };
    }

    return { ...attempt, reviewStatus: 'suggested' };
  });
}

function matchKey(attempt: {
  bankTransactionId: string | null;
  donationId: string | null;
  donorId: string;
  matchMethod: GiftAidMatchMethod;
}) {
  return [
    attempt.bankTransactionId ?? 'no-bank-transaction',
    attempt.donationId ?? 'no-donation',
    attempt.donorId,
    attempt.matchMethod,
  ].join('|');
}

type ExistingMatchRecord = {
  id: string;
  bank_transaction_id: string | null;
  donation_id: string | null;
  donor_id: string;
  match_method: GiftAidMatchMethod;
  review_status: GiftAidMatchReviewStatus;
};

async function persistDonationAttempts(params: {
  orgId: string;
  userId: string;
  donation: MatchableGiftAidDonation;
  attempts: GiftAidDonorMatchAttempt[];
  existingMatches: Map<string, ExistingMatchRecord>;
}) {
  const supabase = await createClient();

  if (params.donation.bankTransactionId) {
    const { error } = await supabase
      .from('bank_transaction_donor_matches')
      .update({
        review_status: 'superseded',
        updated_by: params.userId,
      })
      .eq('workspace_id', params.orgId)
      .eq('bank_transaction_id', params.donation.bankTransactionId)
      .in('review_status', ['suggested', 'auto_confirmed', 'superseded']);
    if (error) {
      throw new Error(error.message);
    }
  } else {
    const { error } = await supabase
      .from('bank_transaction_donor_matches')
      .update({
        review_status: 'superseded',
        updated_by: params.userId,
      })
      .eq('workspace_id', params.orgId)
      .eq('donation_id', params.donation.id)
      .in('review_status', ['suggested', 'auto_confirmed', 'superseded']);
    if (error) {
      throw new Error(error.message);
    }
  }

  for (const attempt of params.attempts) {
    const key = matchKey({
      bankTransactionId: params.donation.bankTransactionId,
      donationId: params.donation.id,
      donorId: attempt.donorId,
      matchMethod: attempt.matchMethod,
    });
    const existing = params.existingMatches.get(key);

    const payload = {
      workspace_id: params.orgId,
      bank_transaction_id: params.donation.bankTransactionId,
      donation_id: params.donation.id,
      donor_id: attempt.donorId,
      match_method: attempt.matchMethod,
      confidence_score: Number(attempt.confidenceScore.toFixed(4)),
      review_status: attempt.reviewStatus,
      notes: attempt.notes,
      match_metadata: attempt.matchMetadata,
      updated_by: params.userId,
    };

    if (existing) {
      const { error } = await supabase
        .from('bank_transaction_donor_matches')
        .update(payload)
        .eq('id', existing.id);
      if (error) {
        throw new Error(error.message);
      }
    } else {
      const { error } = await supabase.from('bank_transaction_donor_matches').insert({
        ...payload,
        created_by: params.userId,
      });
      if (error) {
        throw new Error(error.message);
      }
    }
  }
}

async function loadMatchingContext(params: {
  orgId: string;
  donationIds?: string[];
  bankTransactionIds?: string[];
  limit?: number;
}) {
  const supabase = await createClient();

  let donationQuery = supabase
    .from('donations')
    .select(
      'id, donor_id, bank_transaction_id, giving_import_row_id, source, provider_reference, gift_aid_claim_id'
    )
    .eq('organisation_id', params.orgId)
    .eq('status', 'posted')
    .is('gift_aid_claim_id', null)
    .order('donation_date', { ascending: false });

  if (params.donationIds && params.donationIds.length > 0) {
    donationQuery = donationQuery.in('id', params.donationIds);
  } else if (params.bankTransactionIds && params.bankTransactionIds.length > 0) {
    donationQuery = donationQuery.in('bank_transaction_id', params.bankTransactionIds);
  } else if (params.limit) {
    donationQuery = donationQuery.limit(params.limit);
  }

  const [{ data: donations, error: donationsError }, { data: donors, error: donorsError }] =
    await Promise.all([
      donationQuery,
      supabase
        .from('donors')
        .select('id, full_name, email, reference_code')
        .eq('organisation_id', params.orgId)
        .eq('is_active', true),
    ]);

  if (donationsError) {
    throw new Error(donationsError.message);
  }
  if (donorsError) {
    throw new Error(donorsError.message);
  }

  const bankTransactionIds = Array.from(
    new Set(
      (donations ?? [])
        .map((donation) => donation.bank_transaction_id)
        .filter((value): value is string => Boolean(value))
    )
  );
  const givingImportRowIds = Array.from(
    new Set(
      (donations ?? [])
        .map((donation) => donation.giving_import_row_id)
        .filter((value): value is string => Boolean(value))
    )
  );
  const donationIds = (donations ?? []).map((donation) => donation.id);

  const bankLinesPromise =
    bankTransactionIds.length > 0
      ? supabase
          .from('bank_lines')
          .select('id, description, reference')
          .in('id', bankTransactionIds)
      : Promise.resolve({ data: [], error: null });

  const givingRowsPromise =
    givingImportRowIds.length > 0
      ? supabase
          .from('giving_import_rows')
          .select('id, donor_name, reference, raw')
          .in('id', givingImportRowIds)
      : Promise.resolve({ data: [], error: null });

  const bankMatchesPromise =
    bankTransactionIds.length > 0
      ? supabase
          .from('bank_transaction_donor_matches')
          .select('id, bank_transaction_id, donation_id, donor_id, match_method, review_status')
          .eq('workspace_id', params.orgId)
          .in('bank_transaction_id', bankTransactionIds)
      : Promise.resolve({ data: [], error: null });

  const donationMatchesPromise =
    donationIds.length > 0
      ? supabase
          .from('bank_transaction_donor_matches')
          .select('id, bank_transaction_id, donation_id, donor_id, match_method, review_status')
          .eq('workspace_id', params.orgId)
          .in('donation_id', donationIds)
      : Promise.resolve({ data: [], error: null });

  const [
    { data: bankLines, error: bankLinesError },
    { data: givingRows, error: givingRowsError },
    { data: bankMatches, error: bankMatchesError },
    { data: donationMatches, error: donationMatchesError },
  ] = await Promise.all([
    bankLinesPromise,
    givingRowsPromise,
    bankMatchesPromise,
    donationMatchesPromise,
  ]);

  if (bankLinesError) throw new Error(bankLinesError.message);
  if (givingRowsError) throw new Error(givingRowsError.message);
  if (bankMatchesError) throw new Error(bankMatchesError.message);
  if (donationMatchesError) throw new Error(donationMatchesError.message);

  const bankLineMap = new Map((bankLines ?? []).map((bankLine) => [bankLine.id, bankLine]));
  const givingRowMap = new Map((givingRows ?? []).map((row) => [row.id, row]));

  return {
    donations: (donations ?? []).map((donation) => ({
      id: donation.id,
      donorId: donation.donor_id ?? null,
      bankTransactionId: donation.bank_transaction_id ?? null,
      givingImportRowId: donation.giving_import_row_id ?? null,
      source: donation.source,
      providerReference: donation.provider_reference ?? null,
      bankReference: bankLineMap.get(donation.bank_transaction_id ?? '')?.reference ?? null,
      bankDescription: bankLineMap.get(donation.bank_transaction_id ?? '')?.description ?? null,
      importedDonorName: givingRowMap.get(donation.giving_import_row_id ?? '')?.donor_name ?? null,
      importedReference: givingRowMap.get(donation.giving_import_row_id ?? '')?.reference ?? null,
      importedRaw:
        (givingRowMap.get(donation.giving_import_row_id ?? '')?.raw as
          | Record<string, unknown>
          | null
          | undefined) ?? null,
    })),
    donors: (donors ?? []).map((donor) => ({
      id: donor.id,
      fullName: donor.full_name,
      email: donor.email ?? null,
      referenceCode: donor.reference_code ?? null,
    })),
    existingMatches: new Map(
      [...(bankMatches ?? []), ...(donationMatches ?? [])].map((match) => [
        matchKey({
          bankTransactionId: match.bank_transaction_id ?? null,
          donationId: match.donation_id ?? null,
          donorId: match.donor_id,
          matchMethod: match.match_method as GiftAidMatchMethod,
        }),
        {
          id: match.id,
          bank_transaction_id: match.bank_transaction_id ?? null,
          donation_id: match.donation_id ?? null,
          donor_id: match.donor_id,
          match_method: match.match_method as GiftAidMatchMethod,
          review_status: match.review_status as GiftAidMatchReviewStatus,
        },
      ])
    ),
  };
}

export async function runGiftAidDonorMatching(params?: {
  donationIds?: string[];
  bankTransactionIds?: string[];
  limit?: number;
}): Promise<GiftAidDonorMatchingResult> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'update', 'gift_aid');
  } catch (error) {
    throw new PermissionError(
      error instanceof PermissionError ? error.message : 'Permission denied.'
    );
  }

  const result: GiftAidDonorMatchingResult = {
    processed: 0,
    autoConfirmed: 0,
    suggested: 0,
    unmatched: 0,
    errors: [],
  };

  const context = await loadMatchingContext({
    orgId,
    donationIds: params?.donationIds,
    bankTransactionIds: params?.bankTransactionIds,
    limit: params?.limit,
  });

  const supabase = await createClient();

  for (const donation of context.donations) {
    result.processed += 1;

    try {
      const attempts = buildDonationDonorMatchAttempts({
        donation,
        donors: context.donors,
      });

      await persistDonationAttempts({
        orgId,
        userId: user.id,
        donation,
        attempts,
        existingMatches: context.existingMatches,
      });

      const topAttempt = attempts[0] ?? null;

      if (topAttempt?.reviewStatus === 'auto_confirmed' && (!donation.donorId || donation.donorId === topAttempt.donorId)) {
        const { error } = await supabase
          .from('donations')
          .update({
            donor_id: topAttempt.donorId,
            review_reason: topAttempt.notes,
            updated_by: user.id,
          })
          .eq('organisation_id', orgId)
          .eq('id', donation.id);

        if (error) {
          throw new Error(error.message);
        }

        await syncDonationGiftAidValidation({
          orgId,
          donationId: donation.id,
          userId: user.id,
        });

        result.autoConfirmed += 1;
      } else if (topAttempt) {
        const { error } = await supabase
          .from('donations')
          .update({
            review_reason: topAttempt.notes,
            updated_by: user.id,
          })
          .eq('organisation_id', orgId)
          .eq('id', donation.id);

        if (error) {
          throw new Error(error.message);
        }

        await syncDonationGiftAidValidation({
          orgId,
          donationId: donation.id,
          userId: user.id,
        });

        result.suggested += 1;
      } else {
        const { error } = await supabase
          .from('donations')
          .update({
            review_reason: 'No confident donor match found. Manual review required.',
            updated_by: user.id,
          })
          .eq('organisation_id', orgId)
          .eq('id', donation.id);

        if (error) {
          throw new Error(error.message);
        }

        await syncDonationGiftAidValidation({
          orgId,
          donationId: donation.id,
          userId: user.id,
        });

        result.unmatched += 1;
      }
    } catch (error) {
      result.errors.push(
        error instanceof Error
          ? error.message
          : `Failed to match donation ${donation.id}.`
      );
    }
  }

  if (result.processed > 0) {
    invalidateOrgReportCache(orgId);
  }

  return result;
}
