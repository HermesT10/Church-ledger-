import {
  calculateClaimablePence,
  evaluateGiftAidEligibility,
  type EligibilityDeclaration,
  type EligibilityDonation,
  type EligibilityDonor,
} from './eligibility';

export const GIFT_AID_DECLARATION_MISSING_ALERT =
  'Gift Aid declaration missing. Add declaration before this donation can be claimed.';

export const RECONCILIATION_GIFT_AID_DONATION_STATUSES = [
  'not_assessed',
  'eligible',
  'missing_declaration',
  'invalid_donor_details',
  'already_claimed',
  'included_in_draft_claim',
  'exported',
  'submitted',
  'paid',
  'rejected',
] as const;

export type ReconciliationGiftAidDonationStatus =
  (typeof RECONCILIATION_GIFT_AID_DONATION_STATUSES)[number];

export interface DonationGiftAidAssessmentInput {
  giftAidEligible: boolean;
  donation: EligibilityDonation;
  donor: EligibilityDonor | null;
  declarations: EligibilityDeclaration[];
}

export interface DonationGiftAidAssessment {
  status: ReconciliationGiftAidDonationStatus;
  giftAidEligible: boolean;
  matchedDeclarationId: string | null;
  estimatedClaimPence: number | null;
  warning: string | null;
  reason: string | null;
}

export function assessDonationGiftAidForReconciliation(
  input: DonationGiftAidAssessmentInput
): DonationGiftAidAssessment {
  if (!input.giftAidEligible) {
    return {
      status: 'not_assessed',
      giftAidEligible: false,
      matchedDeclarationId: null,
      estimatedClaimPence: null,
      warning: null,
      reason: null,
    };
  }

  const eligibility = evaluateGiftAidEligibility({
    donation: input.donation,
    donor: input.donor,
    declarations: input.declarations,
  });

  if (eligibility.eligible) {
    return {
      status: 'eligible',
      giftAidEligible: true,
      matchedDeclarationId: eligibility.matchedDeclarationId,
      estimatedClaimPence:
        input.donation.amount_pence == null
          ? null
          : calculateClaimablePence(input.donation.amount_pence),
      warning: null,
      reason: null,
    };
  }

  const codes = new Set(eligibility.issues.map((issue) => issue.code));
  if (codes.has('already_claimed')) {
    return {
      status: 'already_claimed',
      giftAidEligible: false,
      matchedDeclarationId: null,
      estimatedClaimPence: null,
      warning: eligibility.summary,
      reason: eligibility.summary,
    };
  }

  if (
    codes.has('missing_declaration') ||
    codes.has('declaration_not_active_for_donation_date')
  ) {
    return {
      status: 'missing_declaration',
      giftAidEligible: false,
      matchedDeclarationId: null,
      estimatedClaimPence: null,
      warning: GIFT_AID_DECLARATION_MISSING_ALERT,
      reason: eligibility.summary ?? GIFT_AID_DECLARATION_MISSING_ALERT,
    };
  }

  if (
    codes.has('missing_first_name_or_initial') ||
    codes.has('missing_last_name') ||
    codes.has('missing_house_name_or_number') ||
    codes.has('missing_postcode')
  ) {
    return {
      status: 'invalid_donor_details',
      giftAidEligible: false,
      matchedDeclarationId: null,
      estimatedClaimPence: null,
      warning: eligibility.summary,
      reason: eligibility.summary,
    };
  }

  return {
    status: 'not_assessed',
    giftAidEligible: false,
    matchedDeclarationId: null,
    estimatedClaimPence: null,
    warning: eligibility.summary,
    reason: eligibility.summary,
  };
}

export function canAddDonationToGiftAidClaim(params: {
  giftAidClaimId?: string | null;
  giftAidClaimBatchId?: string | null;
  giftAidStatus?: string | null;
  existingActiveClaimLineBatchId?: string | null;
}) {
  const blockingClaimId =
    params.giftAidClaimBatchId ??
    params.giftAidClaimId ??
    params.existingActiveClaimLineBatchId ??
    null;

  if (blockingClaimId) {
    return {
      allowed: false,
      reason: `Donation is already included in Gift Aid claim ${blockingClaimId}.`,
    };
  }

  if (
    params.giftAidStatus &&
    ['already_claimed', 'included_in_draft_claim', 'exported', 'submitted', 'paid'].includes(
      params.giftAidStatus
    )
  ) {
    return {
      allowed: false,
      reason: `Donation cannot be claimed because its Gift Aid status is ${params.giftAidStatus}.`,
    };
  }

  return { allowed: true, reason: null };
}
