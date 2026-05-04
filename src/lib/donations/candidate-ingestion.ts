import { createClient } from '@/lib/supabase/server';
import { getActiveOrg } from '@/lib/org';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { assertWriteAllowed } from '@/lib/demo';
import type { DonationChannel } from './types';
import type { GiftAidDonationStatus } from '@/lib/giftaid/model';
import { invalidateOrgReportCache } from '@/lib/cache';
import { logAuditEvent } from '@/lib/audit';

const DONATION_KEYWORDS = [
  'donation',
  'giving',
  'tithe',
  'offering',
  'gift',
  'church giving',
  'standing order',
  'direct debit',
];

const STRONG_DONATION_KEYWORDS = [
  'tithe',
  'offering',
  'donation',
  'church giving',
];

type CandidateConfidence = 'low' | 'medium' | 'high';

export interface DonationCandidateBankLine {
  id: string;
  bank_account_id: string;
  txn_date: string;
  description: string | null;
  reference: string | null;
  amount_pence: number;
  allocated: boolean;
}

export interface DonationCandidateDonor {
  id: string;
  full_name: string;
  email: string | null;
}

export interface ExistingDonationCandidate {
  id: string;
  bank_transaction_id: string | null;
  donor_id: string | null;
  gift_aid_status: GiftAidDonationStatus;
  review_reason: string | null;
}

export interface DonationCandidateDecision {
  isCandidate: boolean;
  confidence: CandidateConfidence;
  score: number;
  donorId: string | null;
  donationChannel: DonationChannel;
  giftAidStatus: GiftAidDonationStatus;
  reason: string;
}

export interface DonationCandidateIngestionResult {
  scanned: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface DonationCandidateRepository {
  getDefaultDonationsBankAccountId(
    orgId: string
  ): Promise<string | null>;
  listCandidateBankLines(params: {
    orgId: string;
    bankAccountId?: string;
    bankTransactionIds?: string[];
    limit?: number;
  }): Promise<DonationCandidateBankLine[]>;
  listActiveDonors(orgId: string): Promise<DonationCandidateDonor[]>;
  listExistingDonationsByBankTransactionIds(
    orgId: string,
    bankTransactionIds: string[]
  ): Promise<ExistingDonationCandidate[]>;
  createDonationCandidate(params: {
    orgId: string;
    userId: string;
    bankLine: DonationCandidateBankLine;
    donorId: string | null;
    giftAidStatus: GiftAidDonationStatus;
    reviewReason: string;
    donationChannel: DonationChannel;
  }): Promise<void>;
  updateDonationCandidate(params: {
    orgId: string;
    userId: string;
    donationId: string;
    donorId: string | null;
    giftAidStatus: GiftAidDonationStatus;
    reviewReason: string;
    donationChannel: DonationChannel;
    bankLine: DonationCandidateBankLine;
  }): Promise<void>;
}

type DonorPattern = {
  donorId: string;
  normalizedPattern: string;
  weight: number;
};

function normalizeCandidateText(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function normalizeCompact(value: string | null | undefined): string {
  return normalizeCandidateText(value).replace(/\s+/g, '');
}

function uniquePatternsForDonor(donor: DonationCandidateDonor): DonorPattern[] {
  const patterns = new Map<string, DonorPattern>();

  const pushPattern = (raw: string | null | undefined, weight: number) => {
    const normalized = normalizeCompact(raw);
    if (!normalized || normalized.length < 4) return;
    if (!patterns.has(normalized)) {
      patterns.set(normalized, {
        donorId: donor.id,
        normalizedPattern: normalized,
        weight,
      });
    }
  };

  pushPattern(donor.full_name, 25);

  const nameParts = normalizeCandidateText(donor.full_name)
    .split(/\s+/)
    .filter((part) => part.length >= 4);
  for (const part of nameParts) {
    pushPattern(part, 12);
  }

  const emailLocalPart = donor.email?.split('@')[0] ?? null;
  pushPattern(emailLocalPart, 18);

  return Array.from(patterns.values());
}

export function buildDonorReferencePatterns(
  donors: DonationCandidateDonor[]
): DonorPattern[] {
  return donors.flatMap(uniquePatternsForDonor);
}

function inferDonationChannel(text: string): DonationChannel {
  if (text.includes('standingorder') || text.includes('standing order')) {
    return 'standing_order';
  }
  if (text.includes('directdebit') || text.includes('direct debit')) {
    return 'direct_debit';
  }
  return 'bank_transfer';
}

function findDonorMatch(
  normalizedReference: string,
  patterns: DonorPattern[]
): { donorId: string; weight: number } | null {
  let bestMatch: { donorId: string; weight: number } | null = null;

  for (const pattern of patterns) {
    if (!normalizedReference.includes(pattern.normalizedPattern)) {
      continue;
    }
    if (!bestMatch || pattern.weight > bestMatch.weight) {
      bestMatch = {
        donorId: pattern.donorId,
        weight: pattern.weight,
      };
    }
  }

  return bestMatch;
}

export function classifyDonationCandidate(params: {
  bankLine: DonationCandidateBankLine;
  defaultDonationsBankAccountId: string | null;
  donorPatterns: DonorPattern[];
}): DonationCandidateDecision {
  const { bankLine, defaultDonationsBankAccountId, donorPatterns } = params;

  if (bankLine.amount_pence <= 0) {
    return {
      isCandidate: false,
      confidence: 'low',
      score: 0,
      donorId: null,
      donationChannel: 'bank_transfer',
      giftAidStatus: 'unmatched',
      reason: 'Outgoing or zero-value bank transaction.',
    };
  }

  const normalizedText = normalizeCandidateText(
    [bankLine.description, bankLine.reference].filter(Boolean).join(' ')
  );
  const normalizedCompact = normalizeCompact(normalizedText);
  const isKnownGivingBankAccount =
    !!defaultDonationsBankAccountId &&
    bankLine.bank_account_id === defaultDonationsBankAccountId;

  const hasDonationKeyword = DONATION_KEYWORDS.some((keyword) =>
    normalizedText.includes(keyword)
  );
  const hasStrongKeyword = STRONG_DONATION_KEYWORDS.some((keyword) =>
    normalizedText.includes(keyword)
  );
  const donorMatch = findDonorMatch(normalizedCompact, donorPatterns);

  const isCandidate =
    isKnownGivingBankAccount || hasDonationKeyword || donorMatch !== null;

  if (!isCandidate) {
    return {
      isCandidate: false,
      confidence: 'low',
      score: 50,
      donorId: null,
      donationChannel: inferDonationChannel(normalizedCompact),
      giftAidStatus: 'unmatched',
      reason: 'Incoming transaction did not meet donation candidate rules.',
    };
  }

  let score = 50;
  const reasons: string[] = ['Incoming transaction'];

  if (isKnownGivingBankAccount) {
    score += 20;
    reasons.push('Known giving bank account');
  }
  if (hasDonationKeyword) {
    score += hasStrongKeyword ? 25 : 15;
    reasons.push('Donation/giving classification');
  }
  if (donorMatch) {
    score += donorMatch.weight;
    reasons.push('Known donor reference pattern');
  }

  let confidence: CandidateConfidence = 'low';
  if (score >= 90) confidence = 'high';
  else if (score >= 70) confidence = 'medium';

  const giftAidStatus: GiftAidDonationStatus =
    confidence === 'low' ? 'unmatched' : 'needs_review';

  return {
    isCandidate: true,
    confidence,
    score,
    donorId: donorMatch?.donorId ?? null,
    donationChannel: inferDonationChannel(normalizedCompact),
    giftAidStatus,
    reason: reasons.join('; '),
  };
}

function mergeCandidateStatus(
  existingStatus: GiftAidDonationStatus,
  candidateStatus: GiftAidDonationStatus
): GiftAidDonationStatus {
  const rank: Record<GiftAidDonationStatus, number> = {
    not_assessed: 0,
    unmatched: 1,
    needs_review: 2,
    matched_no_declaration: 3,
    missing_declaration: 3,
    invalid_donor_details: 3,
    eligible: 4,
    already_claimed: 5,
    ineligible: 4,
    included_in_claim: 5,
    included_in_draft_claim: 5,
    exported: 6,
    submitted: 6,
    paid: 7,
    rejected: 7,
  };

  return rank[candidateStatus] > rank[existingStatus]
    ? candidateStatus
    : existingStatus;
}

export async function ingestDonationCandidatesWithRepository(
  repository: DonationCandidateRepository,
  params: {
    orgId: string;
    userId: string;
    bankAccountId?: string;
    bankTransactionIds?: string[];
    limit?: number;
  }
): Promise<DonationCandidateIngestionResult> {
  const result: DonationCandidateIngestionResult = {
    scanned: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  const [defaultDonationsBankAccountId, donors, bankLines] = await Promise.all([
    repository.getDefaultDonationsBankAccountId(params.orgId),
    repository.listActiveDonors(params.orgId),
    repository.listCandidateBankLines({
      orgId: params.orgId,
      bankAccountId: params.bankAccountId,
      bankTransactionIds: params.bankTransactionIds,
      limit: params.limit,
    }),
  ]);

  const donorPatterns = buildDonorReferencePatterns(donors);
  const existingDonations = await repository.listExistingDonationsByBankTransactionIds(
    params.orgId,
    bankLines.map((line) => line.id)
  );

  const existingByBankTransactionId = new Map(
    existingDonations
      .filter((donation) => donation.bank_transaction_id)
      .map((donation) => [donation.bank_transaction_id as string, donation])
  );

  for (const bankLine of bankLines) {
    result.scanned += 1;

    const decision = classifyDonationCandidate({
      bankLine,
      defaultDonationsBankAccountId,
      donorPatterns,
    });

    if (!decision.isCandidate) {
      result.skipped += 1;
      continue;
    }

    const existing = existingByBankTransactionId.get(bankLine.id);

    try {
      if (existing) {
        await repository.updateDonationCandidate({
          orgId: params.orgId,
          userId: params.userId,
          donationId: existing.id,
          donorId: existing.donor_id ?? decision.donorId,
          giftAidStatus: mergeCandidateStatus(
            existing.gift_aid_status,
            decision.giftAidStatus
          ),
          reviewReason: existing.review_reason ?? decision.reason,
          donationChannel: decision.donationChannel,
          bankLine,
        });
        result.updated += 1;
      } else {
        await repository.createDonationCandidate({
          orgId: params.orgId,
          userId: params.userId,
          bankLine,
          donorId: decision.donorId,
          giftAidStatus: decision.giftAidStatus,
          reviewReason: decision.reason,
          donationChannel: decision.donationChannel,
        });
        result.created += 1;
      }
    } catch (error) {
      result.errors.push(
        error instanceof Error ? error.message : 'Failed to ingest donation candidate.'
      );
    }
  }

  return result;
}

function createSupabaseDonationCandidateRepository() {
  return {
    async getDefaultDonationsBankAccountId(orgId: string) {
      const supabase = await createClient();
      const { data } = await supabase
        .from('organisation_settings')
        .select('default_donations_bank_account_id')
        .eq('organisation_id', orgId)
        .single();
      return data?.default_donations_bank_account_id ?? null;
    },

    async listCandidateBankLines(params: {
      orgId: string;
      bankAccountId?: string;
      bankTransactionIds?: string[];
      limit?: number;
    }) {
      const supabase = await createClient();
      let query = supabase
        .from('bank_lines')
        .select(
          'id, bank_account_id, txn_date, description, reference, amount_pence, allocated'
        )
        .eq('organisation_id', params.orgId)
        .gt('amount_pence', 0)
        .eq('allocated', false)
        .order('txn_date', { ascending: false });

      if (params.bankAccountId) {
        query = query.eq('bank_account_id', params.bankAccountId);
      }
      if (params.bankTransactionIds && params.bankTransactionIds.length > 0) {
        query = query.in('id', params.bankTransactionIds);
      } else if (params.limit) {
        query = query.limit(params.limit);
      }

      const { data, error } = await query;
      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []).map((line) => ({
        id: line.id,
        bank_account_id: line.bank_account_id,
        txn_date: line.txn_date,
        description: line.description,
        reference: line.reference,
        amount_pence: Number(line.amount_pence),
        allocated: line.allocated ?? false,
      })) satisfies DonationCandidateBankLine[];
    },

    async listActiveDonors(orgId: string) {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('donors')
        .select('id, full_name, email')
        .eq('organisation_id', orgId)
        .eq('is_active', true);

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []).map((donor) => ({
        id: donor.id,
        full_name: donor.full_name,
        email: donor.email,
      })) satisfies DonationCandidateDonor[];
    },

    async listExistingDonationsByBankTransactionIds(
      orgId: string,
      bankTransactionIds: string[]
    ) {
      if (bankTransactionIds.length === 0) {
        return [];
      }

      const supabase = await createClient();
      const { data, error } = await supabase
        .from('donations')
        .select(
          'id, bank_transaction_id, donor_id, gift_aid_status, review_reason'
        )
        .eq('organisation_id', orgId)
        .in('bank_transaction_id', bankTransactionIds);

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []).map((donation) => ({
        id: donation.id,
        bank_transaction_id: donation.bank_transaction_id ?? null,
        donor_id: donation.donor_id ?? null,
        gift_aid_status:
          (donation.gift_aid_status as GiftAidDonationStatus) ?? 'unmatched',
        review_reason: donation.review_reason ?? null,
      })) satisfies ExistingDonationCandidate[];
    },

    async createDonationCandidate(params: {
      orgId: string;
      userId: string;
      bankLine: DonationCandidateBankLine;
      donorId: string | null;
      giftAidStatus: GiftAidDonationStatus;
      reviewReason: string;
      donationChannel: DonationChannel;
    }) {
      const supabase = await createClient();
      const amountPence = Math.abs(params.bankLine.amount_pence);
      const payload = {
        organisation_id: params.orgId,
        donor_id: params.donorId,
        bank_transaction_id: params.bankLine.id,
        donation_date: params.bankLine.txn_date,
        amount_pence: amountPence,
        gross_amount_pence: amountPence,
        fee_amount_pence: 0,
        net_amount_pence: amountPence,
        channel: params.donationChannel,
        source: 'other',
        status: 'posted',
        provider_reference: params.bankLine.reference ?? null,
        gift_aid_status: params.giftAidStatus,
        review_reason: params.reviewReason,
        fingerprint: `bank-line|${params.bankLine.id}`,
        created_by: params.userId,
      };

      const { data, error } = await supabase
        .from('donations')
        .insert(payload)
        .select('id')
        .single();

      if (error && error.code === '23505') {
        return;
      }
      if (error) {
        throw new Error(error.message);
      }

      await logAuditEvent({
        orgId: params.orgId,
        userId: params.userId,
        action: 'create_gift_aid_donation_candidate',
        entityType: 'donation',
        entityId: data.id,
        metadata: {
          bankTransactionId: params.bankLine.id,
          donorId: params.donorId,
          giftAidStatus: params.giftAidStatus,
          confidenceReason: params.reviewReason,
          donationChannel: params.donationChannel,
        },
      });
    },

    async updateDonationCandidate(params: {
      orgId: string;
      userId: string;
      donationId: string;
      donorId: string | null;
      giftAidStatus: GiftAidDonationStatus;
      reviewReason: string;
      donationChannel: DonationChannel;
      bankLine: DonationCandidateBankLine;
    }) {
      const supabase = await createClient();
      const amountPence = Math.abs(params.bankLine.amount_pence);
      const { error } = await supabase
        .from('donations')
        .update({
          donor_id: params.donorId,
          donation_date: params.bankLine.txn_date,
          amount_pence: amountPence,
          gross_amount_pence: amountPence,
          fee_amount_pence: 0,
          net_amount_pence: amountPence,
          channel: params.donationChannel,
          provider_reference: params.bankLine.reference ?? null,
          gift_aid_status: params.giftAidStatus,
          review_reason: params.reviewReason,
          fingerprint: `bank-line|${params.bankLine.id}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.donationId);

      if (error) {
        throw new Error(error.message);
      }

      await logAuditEvent({
        orgId: params.orgId,
        userId: params.userId,
        action: 'update_gift_aid_donation_candidate',
        entityType: 'donation',
        entityId: params.donationId,
        metadata: {
          bankTransactionId: params.bankLine.id,
          donorId: params.donorId,
          giftAidStatus: params.giftAidStatus,
          confidenceReason: params.reviewReason,
          donationChannel: params.donationChannel,
        },
      });
    },
  } satisfies DonationCandidateRepository;
}

export async function runDonationCandidateIngestion(params?: {
  bankAccountId?: string;
  bankTransactionIds?: string[];
  limit?: number;
}): Promise<DonationCandidateIngestionResult> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'create', 'donations');
  } catch (error) {
    throw new PermissionError(
      error instanceof PermissionError ? error.message : 'Permission denied.'
    );
  }

  const result = await ingestDonationCandidatesWithRepository(
    createSupabaseDonationCandidateRepository(),
    {
      orgId,
      userId: user.id,
      bankAccountId: params?.bankAccountId,
      bankTransactionIds: params?.bankTransactionIds,
      limit: params?.limit,
    }
  );

  if (result.created > 0 || result.updated > 0) {
    invalidateOrgReportCache(orgId);
  }

  return result;
}
