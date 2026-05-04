import { invalidateOrgReportCache } from '@/lib/cache';
import { createClient } from '@/lib/supabase/server';
import {
  buildManualGiftAidIneligibleResult,
  evaluateGiftAidEligibility,
  type EligibilityDeclaration,
  type EligibilityDonor,
  type EligibilityResult,
} from './eligibility';

type DonationValidationContext = {
  id: string;
  organisation_id: string;
  donor_id: string | null;
  donation_date: string | null;
  amount_pence: number | null;
  gift_aid_claim_id: string | null;
  gift_aid_status: string;
};

function buildDonationValidationUpdate(params: {
  result: EligibilityResult;
  currentStatus?: string | null;
  currentClaimId?: string | null;
  updatedBy: string | null;
}) {
  const issueCodes = new Set(params.result.issues.map((issue) => issue.code));
  const mappedResultStatus = params.result.eligible
    ? 'eligible'
    : issueCodes.has('already_claimed')
      ? 'already_claimed'
      : issueCodes.has('missing_declaration') ||
          issueCodes.has('declaration_not_active_for_donation_date')
        ? 'missing_declaration'
        : issueCodes.has('missing_first_name_or_initial') ||
            issueCodes.has('missing_last_name') ||
            issueCodes.has('missing_house_name_or_number') ||
            issueCodes.has('missing_postcode')
          ? 'invalid_donor_details'
          : 'not_assessed';
  const isSubmitted =
    params.currentClaimId && params.currentStatus === 'submitted';
  const finalStatus: string = isSubmitted
    ? 'submitted'
    : params.currentClaimId
      ? 'included_in_draft_claim'
      : mappedResultStatus;

  return {
    matched_declaration_id: params.result.matchedDeclarationId,
    gift_aid_status: finalStatus,
    gift_aid_eligible:
      finalStatus === 'eligible' ||
      finalStatus === 'included_in_claim' ||
      finalStatus === 'included_in_draft_claim' ||
      finalStatus === 'exported' ||
      finalStatus === 'submitted',
    gift_aid_ineligible_reason:
      finalStatus === 'invalid_donor_details' ? params.result.summary : null,
    gift_aid_validation_result: {
      eligible: params.result.eligible,
      status: params.result.status,
      matchedDeclarationId: params.result.matchedDeclarationId,
      summary: params.result.summary,
      issues: params.result.issues,
    },
    review_reason:
      finalStatus === 'eligible' ||
      finalStatus === 'included_in_claim' ||
      finalStatus === 'included_in_draft_claim' ||
      finalStatus === 'exported' ||
      finalStatus === 'submitted'
        ? null
        : params.result.summary,
    updated_by: params.updatedBy,
  };
}

async function loadDonationValidationContext(params: {
  orgId: string;
  donationId: string;
}) {
  const supabase = await createClient();
  const { data: donation, error: donationError } = await supabase
    .from('donations')
    .select(
      'id, organisation_id, donor_id, donation_date, amount_pence, gift_aid_claim_id, gift_aid_status'
    )
    .eq('organisation_id', params.orgId)
    .eq('id', params.donationId)
    .single();

  if (donationError || !donation) {
    throw new Error(donationError?.message ?? 'Donation not found.');
  }

  let donor: EligibilityDonor | null = null;
  let declarations: EligibilityDeclaration[] = [];

  if (donation.donor_id) {
    const [{ data: donorRow, error: donorError }, { data: declarationRows, error: declarationError }] =
      await Promise.all([
        supabase
          .from('donors')
          .select(
            'id, full_name, first_name, last_name, house_name_or_number, address, postcode'
          )
          .eq('organisation_id', params.orgId)
          .eq('id', donation.donor_id)
          .single(),
        supabase
          .from('gift_aid_declarations')
          .select('id, status, start_date, end_date, is_active')
          .eq('organisation_id', params.orgId)
          .eq('donor_id', donation.donor_id),
      ]);

    if (donorError || !donorRow) {
      throw new Error(donorError?.message ?? 'Donor not found.');
    }
    if (declarationError) {
      throw new Error(declarationError.message);
    }

    donor = {
      id: donorRow.id,
      full_name: donorRow.full_name ?? null,
      first_name: donorRow.first_name ?? null,
      last_name: donorRow.last_name ?? null,
      house_name_or_number:
        donorRow.house_name_or_number ?? donorRow.address ?? null,
      address: donorRow.address ?? null,
      postcode: donorRow.postcode ?? null,
    };

    declarations = (declarationRows ?? []).map((declaration) => ({
      id: declaration.id,
      status: declaration.status,
      start_date: declaration.start_date,
      end_date: declaration.end_date,
      is_active: declaration.is_active,
    }));
  }

  return {
    donation: donation as DonationValidationContext,
    donor,
    declarations,
  };
}

export async function syncDonationGiftAidValidation(params: {
  orgId: string;
  donationId: string;
  userId: string | null;
}): Promise<EligibilityResult> {
  const context = await loadDonationValidationContext({
    orgId: params.orgId,
    donationId: params.donationId,
  });
  const result = evaluateGiftAidEligibility({
    donation: {
      id: context.donation.id,
      donor_id: context.donation.donor_id,
      donation_date: context.donation.donation_date,
      amount_pence:
        context.donation.amount_pence == null
          ? null
          : Number(context.donation.amount_pence),
      gift_aid_claim_id: context.donation.gift_aid_claim_id,
    },
    donor: context.donor,
    declarations: context.declarations,
  });

  const supabase = await createClient();
  const { error } = await supabase
    .from('donations')
    .update(
      buildDonationValidationUpdate({
        result,
        currentStatus: context.donation.gift_aid_status,
        currentClaimId: context.donation.gift_aid_claim_id,
        updatedBy: params.userId,
      })
    )
    .eq('organisation_id', params.orgId)
    .eq('id', params.donationId);

  if (error) {
    throw new Error(error.message);
  }

  invalidateOrgReportCache(params.orgId);
  return result;
}

export async function syncDonorGiftAidValidations(params: {
  orgId: string;
  donorId: string;
  userId: string | null;
}) {
  const supabase = await createClient();
  const { data: donations, error } = await supabase
    .from('donations')
    .select('id')
    .eq('organisation_id', params.orgId)
    .eq('donor_id', params.donorId)
    .eq('status', 'posted')
    .is('gift_aid_claim_id', null);

  if (error) {
    throw new Error(error.message);
  }

  for (const donation of donations ?? []) {
    await syncDonationGiftAidValidation({
      orgId: params.orgId,
      donationId: donation.id,
      userId: params.userId,
    });
  }
}

export async function setDonationGiftAidManualIneligible(params: {
  orgId: string;
  donationId: string;
  userId: string;
  reason?: string;
}) {
  const supabase = await createClient();
  const { data: donation, error: donationError } = await supabase
    .from('donations')
    .select('gift_aid_status, gift_aid_claim_id')
    .eq('organisation_id', params.orgId)
    .eq('id', params.donationId)
    .single();

  if (donationError || !donation) {
    throw new Error(donationError?.message ?? 'Donation not found.');
  }

  const validation = buildManualGiftAidIneligibleResult(
    params.reason?.trim() || 'Excluded from Gift Aid claim.'
  );

  const { error } = await supabase
    .from('donations')
    .update(
      buildDonationValidationUpdate({
        result: validation,
        currentStatus: donation.gift_aid_status,
        currentClaimId: donation.gift_aid_claim_id,
        updatedBy: params.userId,
      })
    )
    .eq('organisation_id', params.orgId)
    .eq('id', params.donationId);

  if (error) {
    throw new Error(error.message);
  }

  invalidateOrgReportCache(params.orgId);
  return validation;
}
