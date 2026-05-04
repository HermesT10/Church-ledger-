'use server';

import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertWriteAllowed } from '@/lib/demo';
import { getActiveOrg } from '@/lib/org';
import {
  assertCanExportGiftAid,
  assertCanPerform,
  PermissionError,
} from '@/lib/permissions';
import { logAuditEvent } from '@/lib/audit';
import { invalidateOrgReportCache } from '@/lib/cache';
import { isDateInLockedPeriod } from '@/lib/periods/actions';
import type {
  GiftAidClaimRow,
  GiftAidClaimDetail,
  ClaimDonationRow,
  GiftAidDashboard,
  GiftAidDeclarationRow,
  GiftAidWorkflowDashboard,
  GiftAidReviewQueueRow,
  GiftAidDonorRow,
  GiftAidDonorDetail,
  GiftAidDonorDonationHistoryRow,
  GiftAidClaimBuilderData,
  GiftAidClaimBuilderExceptionRow,
  GiftAidClaimBuilderRow,
  GiftAidSchedulePreviewData,
  GiftAidControlCentreData,
  GiftAidControlGasdsBatchRow,
  GiftAidDeclarationLinkAdminData,
  GiftAidDeclarationLinkPreview,
  GiftAidGasdsSummary,
  GiftAidScheduleGasdsPreviewRow,
  GiftAidWorkflowStage,
  GiftAidClaimBuilderGasdsOption,
  GiftAidRecurringPatternRow,
  GiftAidClaimBatchPaymentSnapshot,
  GiftAidReminderRow,
  GiftAidReminderSettings,
} from './types';
import {
  evaluateGiftAidEligibility,
  type EligibilityResult,
  buildClaimPreview,
  buildGiftAidHmrcRow,
  calculateClaimablePence,
  type ClaimPreviewDonation,
  type ClaimPreviewResult,
  type EligibilityDeclaration,
  type GiftAidValidationIssue,
} from './eligibility';
import {
  buildClaimLineSnapshot,
  declarationCoversDonation,
  resolveDeclarationStatus,
} from './helpers';
import {
  buildGiftAidScheduleCsv,
  buildGiftAidScheduleFileName,
  buildGiftAidSchedulePdfFileName,
  buildGiftAidSchedulePreview,
  buildGiftAidScheduleWorkbookBuffer,
  buildGiftAidScheduleWorkbookFileName,
  buildGiftAidScheduleRows,
  calculateGiftAidScheduleChecksum,
  HMRC_GIFT_AID_ODS_MIME_TYPE,
  readGiftAidScheduleOdsTemplateBuffer,
} from './export-schedule';
import type { GiftAidScheduleSnapshotLine } from './export-schedule';
import {
  CLAIM_ITEM_GASDS,
  gasdsClaimAmountPence,
  gasdsClaimLineSnapshots,
  plainGasdsBatchStatusLabel,
  ukTaxYearStartDate,
} from './gasds';
import { renderGiftAidScheduleReviewPdf } from './schedule-pdf';
import { createPostedGiftAidReclaimJournal } from './post-gift-aid-reclaim-journal';
import {
  allocationIsValid,
  computeGiftAidPaymentStatus,
  scoreHmrcReceiptMatch,
} from './payment-reconciliation';
import {
  buildGiftAidClaimBuilderWarnings,
  isGiftAidClaimDateRangeInvalid,
  isDonationOutsideHmrcClaimTimeLimit,
} from './claim-range';
import { runGiftAidDonorMatching } from './matching';
import {
  setDonationGiftAidManualIneligible,
  syncDonationGiftAidValidation,
  syncDonorGiftAidValidations,
} from './validation';
import {
  analyzeGiftAidDuplicateCandidates,
  evaluateGiftAidClaimSelectionGuardrails,
  type GiftAidDuplicateCandidate,
} from './duplicates';
import {
  buildManualClaimLineEdit,
  validateDonationForClaimBatch,
  type ClaimBatchBuilderDeclaration,
  type ClaimBatchBuilderDonation,
  type ClaimBatchValidationResult,
} from './claim-batch-builder';
import {
  GIFT_AID_DECLARATION_WORDING,
  GIFT_AID_DONOR_NOTIFICATION_NOTES,
  giftAidDeclarationFormSchema,
  formatDeclarationValidationError,
  poundsToPence,
  type GiftAidDeclarationFormData,
  type GiftAidDeclarationStatus,
} from './declaration-form';
import { renderGiftAidDeclarationPdf } from './declaration-pdf';
import { buildGiftAidControlCentreData } from './control-centre';
import {
  computeGiftAidHealthScore,
  countUnreconciledHmrcPaymentBatches,
  deriveTaxYearPrimaryAndComparisonPeriods,
} from './health-score';
import { syncGiftAidDeclarationReminders } from './declaration-reminders';
import { buildGiftAidRecurringControlInsights } from './recurring-insights';
import { runRecurringDonorPatternSync } from './recurring-sync';
import {
  DEFAULT_DECLARATION_LINK_EXPIRY_DAYS,
  SELF_SERVICE_DECLARATION_TEXT_VERSION,
  buildDeclarationLinkExpiry,
  buildSelfServiceDeclarationWording,
  formatSelfServiceDeclarationError,
  generateDeclarationLinkToken,
  getDeclarationLinkStatus,
  hashDeclarationLinkToken,
  parseSelfServiceDeclarationSubmission,
  scopeToDeclarationFields,
  type SelfServiceDeclarationSubmissionInput,
} from './self-service-declarations';

/* ------------------------------------------------------------------ */
/*  Approval event helper                                              */
/* ------------------------------------------------------------------ */

async function logGiftAidApprovalEvent(params: {
  orgId: string;
  entityId: string;
  action: string;
  performedBy: string;
  notes?: string;
}) {
  const supabase = await createClient();
  await supabase.from('approval_events').insert({
    organisation_id: params.orgId,
    entity_type: 'gift_aid_claim',
    entity_id: params.entityId,
    action: params.action,
    performed_by: params.performedBy,
    notes: params.notes ?? null,
  });
}

type QueueDonor = {
  id: string;
  full_name: string;
  reference_code?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  house_name_or_number?: string | null;
  email: string | null;
  address: string | null;
  postcode: string | null;
} | null;

type QueueDeclaration = {
  id: string;
  donor_id: string;
  declaration_type?: string | null;
  status?: 'active' | 'cancelled' | 'expired';
  declaration_date: string | null;
  start_date: string;
  end_date: string | null;
  covers_past_donations?: boolean;
  is_active: boolean;
  attachment_url?: string | null;
  notes?: string | null;
  hmrc_version?: string | null;
  template_version?: string | null;
};

type QueueMatchSuggestion = {
  id: string;
  donor_id: string;
  donor_name: string;
  donor_email: string | null;
  donor_address: string | null;
  donor_postcode: string | null;
  match_method: string;
  review_status: string;
  confidence_score: number | null;
  notes: string | null;
} | null;

function normalizeOptionalText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildDonorFullName(params: {
  fullName?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
}) {
  const fullName = normalizeOptionalText(params.fullName);
  if (fullName) return fullName;

  const displayName = normalizeOptionalText(params.displayName);
  if (displayName) return displayName;

  const parts = [
    normalizeOptionalText(params.firstName),
    normalizeOptionalText(params.lastName),
  ].filter(Boolean);

  return parts.join(' ') || null;
}

function buildDonorWriteFields(params: {
  fullName?: string;
  title?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  houseNameOrNumber?: string;
  postcode?: string;
  email?: string;
  phone?: string;
  donorReferenceCode?: string;
  referenceCode?: string;
  notes?: string;
}) {
  const donorReferenceCode =
    normalizeOptionalText(params.donorReferenceCode) ??
    normalizeOptionalText(params.referenceCode);
  const firstName = normalizeOptionalText(params.firstName);
  const lastName = normalizeOptionalText(params.lastName);
  const displayName = normalizeOptionalText(params.displayName);
  const houseNameOrNumber = normalizeOptionalText(params.houseNameOrNumber);
  const postcode = normalizeOptionalText(params.postcode);
  const fullName = buildDonorFullName({
    fullName: params.fullName,
    displayName: displayName ?? undefined,
    firstName: firstName ?? undefined,
    lastName: lastName ?? undefined,
  });

  return {
    full_name: fullName,
    title: normalizeOptionalText(params.title),
    first_name: firstName,
    last_name: lastName,
    display_name: displayName ?? fullName,
    house_name_or_number: houseNameOrNumber,
    postcode,
    email: normalizeOptionalText(params.email),
    phone: normalizeOptionalText(params.phone),
    donor_reference_code: donorReferenceCode,
    reference_code: donorReferenceCode,
    notes: normalizeOptionalText(params.notes),
    address: houseNameOrNumber,
  };
}

function buildGiftAidDuplicateCandidate(params: {
  donationId: string;
  workspaceId: string;
  donorId: string | null;
  donationDate: string | null;
  amountPence: number | null;
  reference: string | null;
  claimId: string | null;
}): GiftAidDuplicateCandidate {
  return {
    id: params.donationId,
    workspaceId: params.workspaceId,
    donorId: params.donorId,
    donationDate: params.donationDate,
    amountPence: params.amountPence,
    reference: params.reference,
    claimId: params.claimId,
  };
}

async function loadGiftAidClaimGuardCandidates(params: {
  orgId: string;
  donationIds: string[];
  currentClaimId?: string | null;
}): Promise<{ selected: GiftAidDuplicateCandidate[]; candidates: GiftAidDuplicateCandidate[] }> {
  const supabase = await createClient();
  const selectedIds = new Set(params.donationIds);

  const { data, error } = await supabase
    .from('donations')
    .select(
      'id, organisation_id, donor_id, donation_date, amount_pence, provider_reference, gift_aid_claim_id, gift_aid_claim_batch_id, bank_transaction_id, bank_lines(reference, description)'
    )
    .eq('organisation_id', params.orgId)
    .not('donor_id', 'is', null)
    .eq('status', 'posted');

  if (error) {
    throw new Error(error.message);
  }

  const candidates = (data ?? []).map((row) => {
    const bankLine = Array.isArray(row.bank_lines)
      ? row.bank_lines[0] ?? null
      : row.bank_lines;
    const reference =
      bankLine?.reference ?? row.provider_reference ?? bankLine?.description ?? null;

    return buildGiftAidDuplicateCandidate({
      donationId: row.id,
      workspaceId: row.organisation_id,
      donorId: row.donor_id ?? null,
      donationDate: row.donation_date,
      amountPence: row.amount_pence == null ? null : Number(row.amount_pence),
      reference,
      claimId:
        (row.gift_aid_claim_batch_id || row.gift_aid_claim_id) &&
        (row.gift_aid_claim_batch_id || row.gift_aid_claim_id) !== params.currentClaimId
          ? row.gift_aid_claim_batch_id || row.gift_aid_claim_id
          : null,
    });
  });

  return {
    selected: candidates.filter((candidate) => selectedIds.has(candidate.id)),
    candidates,
  };
}

type ClaimDonationDonorRecord = {
  id: string;
  title: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  house_name_or_number: string | null;
  address: string | null;
  postcode: string | null;
};

type ClaimDonationFundRecord = {
  id: string;
  name: string;
};

type ClaimDonationBankLineRecord = {
  reference: string | null;
  description: string | null;
};

type ClaimDonationRawRow = {
  id: string;
  organisation_id: string;
  donor_id: string | null;
  fund_id: string | null;
  source: string;
  donation_date: string;
  amount_pence: number | string | null;
  gift_aid_status: string;
  gift_aid_eligible: boolean;
  gift_aid_claim_id: string | null;
  gift_aid_claim_batch_id?: string | null;
  matched_declaration_id: string | null;
  provider_reference: string | null;
  bank_transaction_id: string | null;
  status?: string | null;
  income_stream_id?: string | null;
  donors: ClaimDonationDonorRecord | ClaimDonationDonorRecord[] | null;
  funds: ClaimDonationFundRecord | ClaimDonationFundRecord[] | null;
  income_streams?: { code: string | null; name: string | null } | { code: string | null; name: string | null }[] | null;
  bank_lines?: (ClaimDonationBankLineRecord & { reconciled?: boolean | null }) | Array<ClaimDonationBankLineRecord & { reconciled?: boolean | null }> | null;
};

function getSingleRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

async function loadDeclarationsByDonor(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  organisationId: string;
  donorIds: string[];
}): Promise<Map<string, QueueDeclaration[]>> {
  if (params.donorIds.length === 0) {
    return new Map<string, QueueDeclaration[]>();
  }

  const { data: declarations, error } = await params.supabase
    .from('gift_aid_declarations')
    .select('id, donor_id, declaration_date, start_date, end_date, is_active, status')
    .eq('organisation_id', params.organisationId)
    .in('donor_id', params.donorIds);

  if (error) {
    throw new Error(error.message);
  }

  return (declarations ?? []).reduce((map, declaration) => {
    const existing = map.get(declaration.donor_id) ?? [];
    existing.push({
      id: declaration.id,
      donor_id: declaration.donor_id,
      status: declaration.status,
      declaration_date: declaration.declaration_date,
      start_date: declaration.start_date,
      end_date: declaration.end_date,
      is_active: declaration.is_active,
    });
    map.set(declaration.donor_id, existing);
    return map;
  }, new Map<string, QueueDeclaration[]>());
}

function buildClaimQueueDonor(
  donorRecord: ClaimDonationDonorRecord | null
): QueueDonor {
  if (!donorRecord) {
    return null;
  }

  return {
    id: donorRecord.id,
    full_name: donorRecord.full_name,
    first_name: donorRecord.first_name,
    last_name: donorRecord.last_name,
    house_name_or_number:
      donorRecord.house_name_or_number ?? donorRecord.address ?? null,
    email: null,
    address: donorRecord.address,
    postcode: donorRecord.postcode,
  };
}

function buildGiftAidHmrcPreview(
  donorRecord: ClaimDonationDonorRecord,
  donationDate: string,
  amountPence: number
) {
  return buildGiftAidHmrcRow({
    donor: {
      title: donorRecord.title,
      full_name: donorRecord.full_name,
      first_name: donorRecord.first_name,
      last_name: donorRecord.last_name,
      house_name_or_number:
        donorRecord.house_name_or_number ?? donorRecord.address ?? null,
      address: donorRecord.address,
      postcode: donorRecord.postcode,
    },
    donationDate,
    amountPence,
  });
}

function evaluateClaimDonation(params: {
  row: ClaimDonationRawRow;
  declarationsByDonor: Map<string, QueueDeclaration[]>;
}) {
  const donorRecord = getSingleRelation(params.row.donors);
  const fund = getSingleRelation(params.row.funds);
  const donor = buildClaimQueueDonor(donorRecord);
  const declarations = donor ? params.declarationsByDonor.get(donor.id) ?? [] : [];
  const amountPence = Number(params.row.amount_pence ?? 0);
  const validation = evaluateGiftAidEligibility({
    donation: {
      id: params.row.id,
      donor_id: params.row.donor_id,
      donation_date: params.row.donation_date,
      amount_pence: amountPence,
      gift_aid_claim_id: params.row.gift_aid_claim_id,
    },
    donor: donor
      ? {
          id: donor.id,
          full_name: donor.full_name,
          first_name: donor.first_name ?? null,
          last_name: donor.last_name ?? null,
          house_name_or_number: donor.house_name_or_number ?? donor.address ?? null,
          address: donor.address,
          postcode: donor.postcode,
        }
      : null,
    declarations: declarations.map((declaration) => ({
      id: declaration.id,
      status:
        declaration.status ??
        (declaration.is_active ? 'active' : 'cancelled'),
      start_date: declaration.start_date,
      end_date: declaration.end_date,
      is_active: declaration.is_active,
    })),
  });

  const matchedDeclaration =
    declarations.find(
      (declaration) => declaration.id === validation.matchedDeclarationId
    ) ?? null;

  const status = getQueueStatus({
    giftAidClaimId: params.row.gift_aid_claim_id,
    giftAidEligible: params.row.gift_aid_eligible,
    storedGiftAidStatus: params.row.gift_aid_status,
    donor,
    suggestedMatch: null,
    validation,
    matchedDeclaration,
  });

  return {
    amountPence,
    donorRecord,
    donor,
    fund,
    declarations,
    validation,
    matchedDeclaration,
    status,
    hmrcPreview:
      donorRecord != null
        ? buildGiftAidHmrcPreview(
            donorRecord,
            params.row.donation_date,
            amountPence
          )
        : null,
  };
}

type LegacyGiftAidClaimRecord = {
  id: string;
  organisation_id: string;
  claim_start: string;
  claim_end: string;
  status: 'draft' | 'submitted' | 'paid';
  reference: string | null;
  created_by: string | null;
  created_at: string;
  total_donations_pence: number | string | null;
  total_gift_aid_pence: number | string | null;
};

function mapLegacyClaimToBatchStatus(
  status: LegacyGiftAidClaimRecord['status']
): 'draft' | 'exported' | 'submitted' {
  if (status === 'submitted' || status === 'paid') {
    return 'submitted';
  }
  return 'draft';
}

async function syncGiftAidClaimBatchMirror(params: {
  claimId: string;
  userId: string;
}) {
  const supabase = await createClient();

  const { data: claim, error: claimError } = await supabase
    .from('gift_aid_claims')
    .select(
      'id, organisation_id, claim_start, claim_end, status, reference, created_by, created_at, total_donations_pence, total_gift_aid_pence'
    )
    .eq('id', params.claimId)
    .single();

  if (claimError || !claim) {
    throw new Error(claimError?.message ?? 'Claim not found.');
  }

  const legacyClaim = claim as LegacyGiftAidClaimRecord;

  const { data: existingBatch, error: batchFetchError } = await supabase
    .from('gift_aid_claim_batches')
    .select(
      'id, status, latest_exported_at, submitted_at, hmrc_submission_reference'
    )
    .eq('id', params.claimId)
    .maybeSingle();

  if (batchFetchError) {
    throw new Error(batchFetchError.message);
  }

  const { data: donations, error: donationsError } = await supabase
    .from('donations')
    .select(
      'id, organisation_id, donor_id, fund_id, source, donation_date, gross_amount_pence, amount_pence, provider_reference, gift_aid_status, gift_aid_eligible, gift_aid_claim_id, matched_declaration_id, bank_transaction_id, donors(id, title, first_name, last_name, full_name, house_name_or_number, address, postcode), funds(id, name), bank_lines(reference, description)'
    )
    .eq('gift_aid_claim_id', params.claimId)
    .order('donation_date', { ascending: true });

  if (donationsError) {
    throw new Error(donationsError.message);
  }

  const normalizedDonations: ClaimDonationRawRow[] = (donations ?? []).map(
    (donation) => ({
      ...donation,
      amount_pence:
        donation.gross_amount_pence ?? donation.amount_pence ?? null,
    })
  );

  const donorIds = Array.from(
    new Set(
      normalizedDonations
        .map((row) => row.donor_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  const declarationsByDonor = await loadDeclarationsByDonor({
    supabase,
    organisationId: legacyClaim.organisation_id,
    donorIds,
  });

  const lineRows: Array<{
    claim_item_type: 'standard_gift_aid';
    gasds_batch_id: null;
    donation_id: string;
    workspace_id: string;
    claim_batch_id: string;
    donor_id: string;
    declaration_id: string | null;
    donation_date: string;
    donation_amount_pence: number;
    claim_rate: number;
    claim_amount_pence: number;
    donor_name_snapshot: string;
    donor_address_snapshot: string | null;
    donor_postcode_snapshot: string | null;
    donor_title_snapshot: string | null;
    donor_first_name_or_initial_snapshot: string | null;
    donor_last_name_snapshot: string | null;
    donor_house_name_or_number_snapshot: string | null;
  }> = [];
  const invalidRows: string[] = [];

  for (const donation of normalizedDonations) {
    const evaluated = evaluateClaimDonation({
      row: donation,
      declarationsByDonor,
    });
    const outsideHmrcClaimTimeLimit = isDonationOutsideHmrcClaimTimeLimit({
      donationDate: donation.donation_date,
    });

    if (
      outsideHmrcClaimTimeLimit ||
      !evaluated.validation.eligible ||
      !evaluated.donorRecord ||
      !evaluated.hmrcPreview
    ) {
      invalidRows.push(
        outsideHmrcClaimTimeLimit
          ? `Donation ${donation.id.slice(0, 8)} falls outside the HMRC Gift Aid claim time limit.`
          : evaluated.validation.summary ??
            `Donation ${donation.id.slice(0, 8)} is not eligible for HMRC export.`
      );
      continue;
    }

    const amountPence = Number(donation.amount_pence ?? 0);
    const line = buildClaimLineSnapshot({
      workspaceId: legacyClaim.organisation_id,
      claimBatchId: legacyClaim.id,
      donation: {
        id: donation.id,
        donationDate: donation.donation_date,
        grossAmountPence: amountPence,
      },
      donor: {
        id: evaluated.donorRecord.id,
        fullName: evaluated.donorRecord.full_name,
        title: evaluated.hmrcPreview.title,
        firstNameOrInitial: evaluated.hmrcPreview.firstNameOrInitial,
        lastName: evaluated.hmrcPreview.lastName,
        houseNameOrNumber: evaluated.hmrcPreview.houseNameOrNumber,
        address: evaluated.donorRecord.address,
        postcode: evaluated.donorRecord.postcode,
      },
      declarationId: donation.matched_declaration_id ?? null,
    });

    lineRows.push({
      claim_item_type: 'standard_gift_aid' as const,
      gasds_batch_id: null,
      donation_id: donation.id,
      workspace_id: line.workspaceId,
      claim_batch_id: line.claimBatchId,
      donor_id: line.donorId as string,
      declaration_id: line.declarationId,
      donation_date: line.donationDate,
      donation_amount_pence: line.donationAmountPence,
      claim_rate: line.claimRate,
      claim_amount_pence: line.claimAmountPence,
      donor_name_snapshot: line.donorNameSnapshot,
      donor_address_snapshot: line.donorAddressSnapshot,
      donor_postcode_snapshot: line.donorPostcodeSnapshot,
      donor_title_snapshot: line.donorTitleSnapshot,
      donor_first_name_or_initial_snapshot:
        line.donorFirstNameOrInitialSnapshot,
      donor_last_name_snapshot: line.donorLastNameSnapshot,
      donor_house_name_or_number_snapshot:
        line.donorHouseNameOrNumberSnapshot,
    });
  }

  const batchStatus =
    existingBatch?.status === 'exported' || existingBatch?.status === 'submitted'
      ? existingBatch.status
      : mapLegacyClaimToBatchStatus(legacyClaim.status);

  const totalDonationPence = lineRows.reduce(
    (sum, row) => sum + Number(row.donation_amount_pence),
    0
  );
  const totalClaimPence = lineRows.reduce(
    (sum, row) => sum + Number(row.claim_amount_pence),
    0
  );

  const { error: batchUpsertError } = await supabase
    .from('gift_aid_claim_batches')
    .upsert(
      {
        id: legacyClaim.id,
        workspace_id: legacyClaim.organisation_id,
        claim_start: legacyClaim.claim_start,
        claim_end: legacyClaim.claim_end,
        status: batchStatus,
        batch_reference: legacyClaim.reference,
        hmrc_submission_reference:
          existingBatch?.hmrc_submission_reference ?? legacyClaim.reference,
        donation_count: lineRows.length,
        donation_total_pence:
          legacyClaim.total_donations_pence == null
            ? totalDonationPence
            : Number(legacyClaim.total_donations_pence),
        claim_total_pence:
          legacyClaim.total_gift_aid_pence == null
            ? totalClaimPence
            : Number(legacyClaim.total_gift_aid_pence),
        latest_exported_at: existingBatch?.latest_exported_at ?? null,
        submitted_at: existingBatch?.submitted_at ?? null,
        created_by: legacyClaim.created_by,
        updated_by: params.userId,
        created_at: legacyClaim.created_at,
      },
      { onConflict: 'id' }
    );

  if (batchUpsertError) {
    throw new Error(batchUpsertError.message);
  }

  if (lineRows.length > 0) {
    const { error: linesUpsertError } = await supabase
      .from('gift_aid_claim_lines')
      .upsert(lineRows, { onConflict: 'donation_id' });

    if (linesUpsertError) {
      throw new Error(linesUpsertError.message);
    }
  }

  return {
    batchId: legacyClaim.id,
    workspaceId: legacyClaim.organisation_id,
    invalidRows,
  };
}

function getDeclarationStatusForDonation(params: {
  donationDate: string;
  declarations: QueueDeclaration[];
}): {
  matchedDeclaration: QueueDeclaration | null;
  declarationStatus: 'active' | 'cancelled' | 'expired' | 'missing';
} {
  const matchedDeclaration =
    params.declarations.find((declaration) =>
      declarationCoversDonation({
        donationDate: params.donationDate,
        declaration: {
          status:
            declaration.status ?? (declaration.is_active ? 'active' : 'cancelled'),
          startDate: declaration.start_date,
          endDate: declaration.end_date,
        },
        asOf: new Date(params.donationDate),
      })
    ) ?? null;

  if (matchedDeclaration) {
    return { matchedDeclaration, declarationStatus: 'active' };
  }

  const latestDeclaration = params.declarations[0] ?? null;
  if (!latestDeclaration) {
    return { matchedDeclaration: null, declarationStatus: 'missing' };
  }

  return {
    matchedDeclaration: null,
    declarationStatus: resolveDeclarationStatus(
      {
        status:
          latestDeclaration.status ??
          (latestDeclaration.is_active ? 'active' : 'cancelled'),
        endDate: latestDeclaration.end_date,
      },
      new Date(params.donationDate)
    ),
  };
}

function getQueueStatus(params: {
  giftAidClaimId: string | null;
  giftAidEligible: boolean;
  storedGiftAidStatus: string;
  donor: QueueDonor;
  suggestedMatch: QueueMatchSuggestion;
  validation: EligibilityResult;
  matchedDeclaration: QueueDeclaration | null;
}): {
  workflow_stage: GiftAidWorkflowStage;
  queue_reason: string;
  validation_reason: string | null;
  validation_issues: GiftAidValidationIssue[];
} {
  const {
    giftAidClaimId,
    giftAidEligible,
    storedGiftAidStatus,
    donor,
    suggestedMatch,
    validation,
    matchedDeclaration,
  } = params;

  if (!donor) {
    return {
      workflow_stage: 'match',
      queue_reason: suggestedMatch
        ? 'Review suggested donor match'
        : 'Donation needs donor matching',
      validation_reason: suggestedMatch
        ? `${suggestedMatch.donor_name} suggested at ${Math.round(
            (suggestedMatch.confidence_score ?? 0) * 100
          )}% confidence.`
        : validation.summary ?? 'No donor linked to this donation.',
      validation_issues: validation.issues,
    };
  }

  if (giftAidClaimId) {
    return {
      workflow_stage: 'track_audit',
      queue_reason: 'Already included in a Gift Aid claim',
      validation_reason: validation.summary ?? null,
      validation_issues: validation.issues,
    };
  }

  if (storedGiftAidStatus === 'eligible' || giftAidEligible || validation.status === 'eligible') {
    return {
      workflow_stage: 'prepare_claim',
      queue_reason: 'Validated and ready for claim preparation',
      validation_reason: null,
      validation_issues: [],
    };
  }

  if (validation.status === 'matched_no_declaration') {
    return {
      workflow_stage: 'validate',
      queue_reason: 'Declaration coverage needs review',
      validation_reason:
        validation.summary ??
        'No active Gift Aid declaration covers this donation date.',
      validation_issues: validation.issues,
    };
  }

  if (validation.status === 'ineligible') {
    return {
      workflow_stage: 'validate',
      queue_reason: 'Donation is not eligible for Gift Aid',
      validation_reason: validation.summary ?? 'Validation rules failed.',
      validation_issues: validation.issues,
    };
  }

  if (validation.status === 'needs_review' || !matchedDeclaration) {
    return {
      workflow_stage: 'validate',
      queue_reason: 'Donor record or declaration needs review',
      validation_reason:
        validation.summary ??
        'Declaration or donor details are incomplete.',
      validation_issues: validation.issues,
    };
  }

  return {
    workflow_stage: 'validate',
    queue_reason: 'Ready for validation',
    validation_reason: null,
    validation_issues: validation.issues,
  };
}

/* ================================================================== */
/*  CLAIM PREVIEW                                                      */
/* ================================================================== */

export async function getGiftAidClaimPreview(params: {
  organisationId: string;
  startDate: string;
  endDate: string;
}): Promise<{ data: ClaimPreviewResult | null; error: string | null }> {
  const { organisationId, startDate, endDate } = params;

  if (!organisationId || !startDate || !endDate) {
    return { data: null, error: 'Organisation ID, start date, and end date are required.' };
  }

  const supabase = await createClient();

  const { data: donations, error: donationsErr } = await supabase
    .from('donations')
    .select('id, donation_date, amount_pence, gift_aid_claim_id, donor_id, fund_id, donors(full_name, first_name, last_name, house_name_or_number, address, postcode)')
    .eq('organisation_id', organisationId)
    .eq('status', 'posted')
    .gte('donation_date', startDate)
    .lte('donation_date', endDate)
    .order('donation_date', { ascending: true });

  if (donationsErr) {
    return { data: null, error: donationsErr.message };
  }

  if (!donations || donations.length === 0) {
    return {
      data: buildClaimPreview([], startDate, endDate),
      error: null,
    };
  }

  const donorIds = new Set<string>();
  for (const d of donations) {
    if (d.donor_id) donorIds.add(d.donor_id);
  }

  const declarationsByDonor: Record<string, EligibilityDeclaration[]> = {};

  if (donorIds.size > 0) {
    const { data: declarations, error: declErr } = await supabase
      .from('gift_aid_declarations')
      .select('donor_id, start_date, end_date, is_active')
      .in('donor_id', Array.from(donorIds));

    if (declErr) {
      return { data: null, error: declErr.message };
    }

    for (const decl of declarations ?? []) {
      const did = decl.donor_id as string;
      if (!declarationsByDonor[did]) declarationsByDonor[did] = [];
      declarationsByDonor[did].push({
        start_date: decl.start_date,
        end_date: decl.end_date,
        is_active: decl.is_active,
      });
    }
  }

  const previewDonations: ClaimPreviewDonation[] = donations.map((d) => {
    const donor = d.donors as
      | {
          full_name: string;
          first_name: string | null;
          last_name: string | null;
          house_name_or_number: string | null;
          address: string | null;
          postcode: string | null;
        }
      | {
          full_name: string;
          first_name: string | null;
          last_name: string | null;
          house_name_or_number: string | null;
          address: string | null;
          postcode: string | null;
        }[]
      | null;

    const donorObj = Array.isArray(donor) ? donor[0] ?? null : donor;

    return {
      id: d.id,
      donation_date: d.donation_date,
      amount_pence: Number(d.amount_pence),
      gift_aid_claim_id: d.gift_aid_claim_id,
      donor: donorObj
        ? {
            full_name: donorObj.full_name,
            first_name: donorObj.first_name,
            last_name: donorObj.last_name,
            house_name_or_number:
              donorObj.house_name_or_number ?? donorObj.address,
            address: donorObj.address,
            postcode: donorObj.postcode,
          }
        : null,
      declarations: d.donor_id ? (declarationsByDonor[d.donor_id] ?? []) : [],
    };
  });

  const result = buildClaimPreview(previewDonations, startDate, endDate);

  return { data: result, error: null };
}

/* ================================================================== */
/*  CREATE CLAIM (atomic)                                              */
/* ================================================================== */

export async function createGiftAidClaim(params: {
  organisationId: string;
  startDate: string;
  endDate: string;
  donationIds: string[];
}): Promise<{ data: { claimId: string } | null; error: string | null }> {
  await assertWriteAllowed();
  const { organisationId, startDate, endDate, donationIds } = params;

  const { role, user } = await getActiveOrg();
  try { assertCanExportGiftAid(role); }
  catch (e) { return { data: null, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  if (!donationIds || donationIds.length === 0) {
    return { data: null, error: 'No donations selected for the claim.' };
  }

  if (isGiftAidClaimDateRangeInvalid({ startDate, endDate })) {
    return {
      data: null,
      error: 'Enter a valid claim date range before creating the claim batch.',
    };
  }

  const supabase = await createClient();
  let guardCandidates: Awaited<ReturnType<typeof loadGiftAidClaimGuardCandidates>>;
  try {
    guardCandidates = await loadGiftAidClaimGuardCandidates({
      orgId: organisationId,
      donationIds,
    });
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to load claim guardrails.',
    };
  }

  if (guardCandidates.selected.length !== donationIds.length) {
    return {
      data: null,
      error:
        'One or more selected donations could not be loaded for claim validation.',
    };
  }

  const outOfTimeLimitDonations = guardCandidates.selected.filter((candidate) =>
    isDonationOutsideHmrcClaimTimeLimit({
      donationDate: candidate.donationDate,
    })
  );

  if (outOfTimeLimitDonations.length > 0) {
    return {
      data: null,
      error:
        'One or more selected donations fall outside the HMRC Gift Aid claim time limit.',
    };
  }

  const guardrails = evaluateGiftAidClaimSelectionGuardrails({
    selectedDonationIds: donationIds,
    candidates: guardCandidates.candidates,
  });

  if (guardrails.blockingErrors.length > 0) {
    return {
      data: null,
      error: guardrails.blockingErrors.join(' '),
    };
  }

  const { data: claimId, error: rpcErr } = await supabase.rpc(
    'create_gift_aid_claim',
    {
      p_organisation_id: organisationId,
      p_claim_start: startDate,
      p_claim_end: endDate,
      p_donation_ids: donationIds,
      p_created_by: user.id,
    }
  );

  if (rpcErr) {
    return { data: null, error: rpcErr.message };
  }

  const claimIdStr = claimId as string;

  // Compute and store totals + status
  const admin = createAdminClient();
  const { data: claimDonations } = await admin
    .from('donations')
    .select('amount_pence')
    .eq('gift_aid_claim_id', claimIdStr);

  const totalDonationsPence = (claimDonations ?? []).reduce(
    (s, d) => s + Number(d.amount_pence),
    0
  );
  const totalGiftAidPence = Math.round(totalDonationsPence * 0.25);

  await admin
    .from('gift_aid_claims')
    .update({
      status: 'draft',
      total_donations_pence: totalDonationsPence,
      total_gift_aid_pence: totalGiftAidPence,
    })
    .eq('id', claimIdStr);

  await admin.from('gift_aid_claim_batches').upsert(
    {
      id: claimIdStr,
      workspace_id: organisationId,
      claim_start: startDate,
      claim_end: endDate,
      status: 'draft',
      donation_count: donationIds.length,
      donation_total_pence: totalDonationsPence,
      claim_total_pence: totalGiftAidPence,
      created_by: user.id,
      updated_by: user.id,
    },
    { onConflict: 'id' }
  );

  await admin
    .from('donations')
    .update({
      gift_aid_claim_batch_id: claimIdStr,
      gift_aid_status: 'included_in_draft_claim',
      updated_by: user.id,
    })
    .in('id', donationIds)
    .eq('organisation_id', organisationId);

  // Audit trail
  await logGiftAidApprovalEvent({
    orgId: organisationId,
    entityId: claimIdStr,
    action: 'created',
    performedBy: user.id,
    notes: `Period: ${startDate} to ${endDate}, ${donationIds.length} donation(s)`,
  });

  await logAuditEvent({
    orgId: organisationId,
    userId: user.id,
    action: 'create_gift_aid_claim',
    entityType: 'gift_aid_claim',
    entityId: claimIdStr,
    metadata: {
      startDate,
      endDate,
      donationCount: donationIds.length,
      totalDonationsPence,
      totalGiftAidPence,
    },
  });

  return { data: { claimId: claimIdStr }, error: null };
}

/* ================================================================== */
/*  EXPORT CSV                                                         */
/* ================================================================== */

export async function exportGiftAidClaimCsv(params: {
  claimId: string;
}): Promise<{
  data: { exportId: string; fileName: string } | null;
  error: string | null;
}> {
  await assertWriteAllowed();
  const { claimId } = params;

  const { role, user } = await getActiveOrg();
  try {
    assertCanExportGiftAid(role);
  } catch (e) {
    return {
      data: null,
      error:
        e instanceof PermissionError ? e.message : 'Permission denied.',
    };
  }

  if (!claimId) {
    return { data: null, error: 'Claim ID is required.' };
  }

  try {
    const syncResult = await syncGiftAidClaimBatchMirror({
      claimId,
      userId: user.id,
    });

    if (syncResult.invalidRows.length > 0) {
      return {
        data: null,
        error: Array.from(new Set(syncResult.invalidRows)).join(' '),
      };
    }

    const supabase = await createClient();
    const { data: batch, error: batchError } = await supabase
      .from('gift_aid_claim_batches')
      .select('id, status')
      .eq('id', syncResult.batchId)
      .single();

    if (batchError || !batch) {
      return {
        data: null,
        error: batchError?.message ?? 'Claim batch not found.',
      };
    }

    if (batch.status !== 'draft') {
      return {
        data: null,
        error: 'Only draft claim batches can be exported to the HMRC schedule.',
      };
    }

    const { data: claimLinesRaw, error: linesError } = await supabase
      .from('gift_aid_claim_lines')
      .select(
        'donation_id, claim_item_type, donation_date, donation_amount_pence, donor_title_snapshot, donor_first_name_or_initial_snapshot, donor_last_name_snapshot, donor_house_name_or_number_snapshot, donor_postcode_snapshot'
      )
      .eq('claim_batch_id', syncResult.batchId)
      .order('donation_date', { ascending: true });

    if (linesError) {
      return { data: null, error: linesError.message };
    }

    const claimLines = (claimLinesRaw ?? []).filter(
      (line) =>
        line.donation_id &&
        ((line as { claim_item_type?: string | null }).claim_item_type ?? 'standard_gift_aid') !== CLAIM_ITEM_GASDS
    );

    if (!claimLines || claimLines.length === 0) {
      return {
        data: null,
        error:
          'No validated eligible donations are available in this draft claim batch. (GASDS batches are excluded from HMRC CSV mirror — use workbook export.)',
      };
    }

    const schedule = buildGiftAidScheduleRows(
      claimLines.map((line) => ({
        donationId: line.donation_id as string,
        title: line.donor_title_snapshot,
        firstNameOrInitial: line.donor_first_name_or_initial_snapshot,
        lastName: line.donor_last_name_snapshot,
        houseNameOrNumber: line.donor_house_name_or_number_snapshot,
        postcode: line.donor_postcode_snapshot,
        donationDate: line.donation_date,
        donationAmountPence: Number(line.donation_amount_pence),
      }))
    );

    if (schedule.issues.length > 0) {
      return {
        data: null,
        error: Array.from(
          new Set(schedule.issues.map((issue) => issue.message))
        ).join(' '),
      };
    }

    const csv = buildGiftAidScheduleCsv(schedule.rows);
    const fileName = buildGiftAidScheduleFileName({ claimId: syncResult.batchId });
    const storagePath = `${syncResult.workspaceId}/exports/${syncResult.batchId}/${Date.now()}-${fileName}`;
    const checksum = calculateGiftAidScheduleChecksum(csv);
    const fileBuffer = Buffer.from(csv, 'utf8');

    const { error: uploadError } = await supabase.storage
      .from('gift-aid')
      .upload(storagePath, fileBuffer, {
        contentType: 'text/csv;charset=utf-8',
        upsert: false,
      });

    if (uploadError) {
      return { data: null, error: uploadError.message };
    }

    const { data: exportRecord, error: exportInsertError } = await supabase
      .from('gift_aid_exports')
      .insert({
        workspace_id: syncResult.workspaceId,
        claim_batch_id: syncResult.batchId,
        export_format: 'hmrc_csv',
        file_name: fileName,
        storage_path: storagePath,
        checksum_sha256: checksum,
        row_count: schedule.rows.length,
        exported_by: user.id,
      })
      .select('id, file_name')
      .single();

    if (exportInsertError || !exportRecord) {
      await createAdminClient().storage.from('gift-aid').remove([storagePath]);
      return {
        data: null,
        error: exportInsertError?.message ?? 'Unable to save export record.',
      };
    }

    const now = new Date().toISOString();
    const donationIds = claimLines.map((line) => line.donation_id);

    const { error: batchUpdateError } = await supabase
      .from('gift_aid_claim_batches')
      .update({
        status: 'exported',
        latest_exported_at: now,
        updated_by: user.id,
      })
      .eq('id', syncResult.batchId);

    if (batchUpdateError) {
      return { data: null, error: batchUpdateError.message };
    }

    const { error: donationUpdateError } = await supabase
      .from('donations')
      .update({
        gift_aid_status: 'exported',
        updated_by: user.id,
      })
      .in('id', donationIds);

    if (donationUpdateError) {
      return { data: null, error: donationUpdateError.message };
    }

    await logGiftAidApprovalEvent({
      orgId: syncResult.workspaceId,
      entityId: claimId,
      action: 'exported',
      performedBy: user.id,
      notes: `HMRC schedule exported as ${fileName}`,
    });

    await logAuditEvent({
      orgId: syncResult.workspaceId,
      userId: user.id,
      action: 'export_gift_aid_schedule',
      entityType: 'gift_aid_claim',
      entityId: claimId,
      metadata: {
        claimBatchId: syncResult.batchId,
        exportId: exportRecord.id,
        fileName: exportRecord.file_name ?? fileName,
        rowCount: schedule.rows.length,
        checksum,
      },
    });

    await invalidateOrgReportCache(syncResult.workspaceId);

    return {
      data: {
        exportId: exportRecord.id,
        fileName: exportRecord.file_name ?? fileName,
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to prepare the HMRC Gift Aid schedule export.',
    };
  }
}

export async function getGiftAidExportDownloadUrl(params: {
  exportId: string;
}): Promise<{
  data: { url: string; fileName: string } | null;
  error: string | null;
}> {
  const { exportId } = params;

  if (!exportId) {
    return { data: null, error: 'Export ID is required.' };
  }

  const { orgId } = await getActiveOrg();
  const supabase = await createClient();
  const { data: exportRow, error } = await supabase
    .from('gift_aid_exports')
    .select('id, workspace_id, file_name, storage_path')
    .eq('id', exportId)
    .single();

  if (error || !exportRow) {
    return {
      data: null,
      error: error?.message ?? 'Gift Aid export not found.',
    };
  }

  if (exportRow.workspace_id !== orgId) {
    return { data: null, error: 'You do not have access to this export.' };
  }

  if (!exportRow.storage_path) {
    return { data: null, error: 'This export file is no longer available.' };
  }

  const admin = createAdminClient();
  const { data: signedUrl, error: signedUrlError } = await admin.storage
    .from('gift-aid')
    .createSignedUrl(exportRow.storage_path, 300, {
      download: exportRow.file_name ?? undefined,
    });

  if (signedUrlError || !signedUrl?.signedUrl) {
    return {
      data: null,
      error:
        signedUrlError?.message ?? 'Unable to generate a secure download link.',
    };
  }

  return {
    data: {
      url: signedUrl.signedUrl,
      fileName: exportRow.file_name ?? 'gift-aid-schedule.csv',
    },
    error: null,
  };
}

async function loadSchedulePreviewLines(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  batchId: string;
  orgId: string;
}) {
  const { data: batch, error: batchError } = await params.supabase
    .from('gift_aid_claim_batches')
    .select(
      'id, workspace_id, status, claim_start, claim_end, donation_count, donation_total_pence, claim_total_pence'
    )
    .eq('id', params.batchId)
    .eq('workspace_id', params.orgId)
    .single();

  if (batchError || !batch) {
    throw new Error(batchError?.message ?? 'Claim batch not found.');
  }

  const { data: lines, error: linesError } = await params.supabase
    .from('gift_aid_claim_lines')
    .select(
      `id, donation_id, claim_item_type, gasds_batch_id, declaration_id, donation_date, donation_amount_pence, claim_amount_pence,
      donor_title_snapshot, donor_first_name_or_initial_snapshot, donor_last_name_snapshot, donor_house_name_or_number_snapshot,
      donor_postcode_snapshot, status, validation_issues, export_locked_at,
      donations(gift_aid_claim_id, gift_aid_claim_batch_id),
      gift_aid_small_donation_batches!gasds_batch_id(
        id,
        batch_reference,
        collection_date,
        service_or_event_name,
        eligible_amount_pence,
        collection_method
      )`
    )
    .eq('workspace_id', params.orgId)
    .eq('claim_batch_id', params.batchId)
    .neq('status', 'removed')
    .order('donation_date', { ascending: true });

  if (linesError) {
    throw new Error(linesError.message);
  }

  const scheduleLines: GiftAidScheduleSnapshotLine[] = (lines ?? []).map((line) => {
    const raw = line as {
      id: string;
      donation_id: string | null;
      claim_item_type?: string | null;
      gasds_batch_id: string | null;
      declaration_id: string | null;
      donation_date: string;
      donation_amount_pence: number;
      claim_amount_pence: number;
      donor_title_snapshot: string | null;
      donor_first_name_or_initial_snapshot: string | null;
      donor_last_name_snapshot: string | null;
      donor_house_name_or_number_snapshot: string | null;
      donor_postcode_snapshot: string | null;
      validation_issues: unknown;
      export_locked_at: string | null;
      donations: unknown;
      gift_aid_small_donation_batches: unknown;
    };
    const itemType = raw.claim_item_type ?? 'standard_gift_aid';
    if (itemType === CLAIM_ITEM_GASDS && raw.gasds_batch_id) {
      const gb = Array.isArray(raw.gift_aid_small_donation_batches)
        ? raw.gift_aid_small_donation_batches[0]
        : raw.gift_aid_small_donation_batches;
      const g = gb as {
        batch_reference?: string;
        collection_date?: string;
        service_or_event_name?: string;
        eligible_amount_pence?: number;
        collection_method?: string;
      } | null;
      return {
        donationId: `gasds:${raw.gasds_batch_id}`,
        claimLineId: raw.id,
        claimItemType: CLAIM_ITEM_GASDS,
        gasds_batch_reference: g?.batch_reference ?? null,
        gasds_service_or_event: g?.service_or_event_name ?? null,
        gasds_collection_method: g?.collection_method ?? null,
        title: g?.service_or_event_name ?? raw.donor_title_snapshot,
        firstNameOrInitial: g?.collection_method ?? raw.donor_first_name_or_initial_snapshot,
        lastName: g?.batch_reference ?? raw.donor_last_name_snapshot,
        houseNameOrNumber: raw.donor_house_name_or_number_snapshot,
        postcode: raw.donor_postcode_snapshot,
        donationDate: String(g?.collection_date ?? raw.donation_date),
        donationAmountPence: Number(raw.donation_amount_pence),
        claimAmountPence: Number(raw.claim_amount_pence),
        declarationId: null,
        giftAidClaimId: null,
        giftAidClaimBatchId: null,
        exportLockedAt: raw.export_locked_at,
      };
    }

    const donation = Array.isArray(raw.donations)
      ? raw.donations[0] ?? null
      : raw.donations;
    const d = donation as {
      gift_aid_claim_id?: string | null;
      gift_aid_claim_batch_id?: string | null;
    } | null;
    const otherBatchId =
      d?.gift_aid_claim_batch_id && d.gift_aid_claim_batch_id !== params.batchId
        ? d.gift_aid_claim_batch_id
        : null;
    return {
      donationId: raw.donation_id ?? '',
      claimLineId: raw.id,
      claimItemType: 'standard_gift_aid',
      title: raw.donor_title_snapshot,
      firstNameOrInitial: raw.donor_first_name_or_initial_snapshot,
      lastName: raw.donor_last_name_snapshot,
      houseNameOrNumber: raw.donor_house_name_or_number_snapshot,
      postcode: raw.donor_postcode_snapshot,
      donationDate: raw.donation_date,
      donationAmountPence: Number(raw.donation_amount_pence),
      claimAmountPence: Number(raw.claim_amount_pence),
      declarationId: raw.declaration_id,
      giftAidClaimId: d?.gift_aid_claim_id ?? null,
      giftAidClaimBatchId: otherBatchId,
      exportLockedAt: raw.export_locked_at,
    };
  });

  return { batch, lines: lines ?? [], scheduleLines };
}

export async function getGiftAidSchedulePreview(params: {
  batchId: string;
}): Promise<{ data: GiftAidSchedulePreviewData | null; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  try {
    const { batch, lines, scheduleLines } = await loadSchedulePreviewLines({
      supabase,
      batchId: params.batchId,
      orgId,
    });
    const preview = buildGiftAidSchedulePreview({
      lines: scheduleLines,
      expectedDonationTotalPence: Number(batch.donation_total_pence),
      expectedGiftAidTotalPence: Number(batch.claim_total_pence),
    });
    try {
      await readGiftAidScheduleOdsTemplateBuffer();
    } catch (templateError) {
      preview.summary.issues.push({
        donationId: 'batch',
        field: 'rowCount',
        message:
          templateError instanceof Error
            ? templateError.message
            : 'HMRC Gift Aid ODS template is missing.',
      });
      preview.summary.readiness = 'blocked';
    }

    const { data: exports, error: exportsError } = await supabase
      .from('gift_aid_exports')
      .select(
        'id, version, generated_by, generated_at, file_name, storage_path, pdf_file_name, pdf_storage_path, row_count, donation_total_pence, gift_aid_total_pence, export_readiness'
      )
      .eq('workspace_id', orgId)
      .eq('claim_batch_id', params.batchId)
      .order('version', { ascending: false });

    if (exportsError) {
      return { data: null, error: exportsError.message };
    }

    const issuesByDonationId = new Map<string, string[]>();
    for (const issueItem of preview.summary.issues) {
      const current = issuesByDonationId.get(issueItem.donationId) ?? [];
      current.push(issueItem.message);
      issuesByDonationId.set(issueItem.donationId, current);
    }

    const lineById = new Map((lines ?? []).map((row) => [String((row as { id: string }).id), row]));
    const hmLineInputs = scheduleLines.filter(
      (s) => !s.claimItemType || s.claimItemType !== CLAIM_ITEM_GASDS
    );
    const gasdsLineInputs = scheduleLines.filter((s) => s.claimItemType === CLAIM_ITEM_GASDS);

    const hmrcRows = preview.rows.map((row, index) => {
      const snap = hmLineInputs[index];
      const line = snap?.claimLineId ? lineById.get(snap.claimLineId) : undefined;
      const donationKey = snap?.donationId ?? '';
      const lineData = line as {
        id: string;
        donation_id: string | null;
        donation_amount_pence: number;
        claim_amount_pence: number;
        export_locked_at: string | null;
      };
      return {
        claim_line_id: lineData.id,
        donation_id: lineData.donation_id ?? '',
        title: row.title,
        first_name_or_initial: row.firstNameOrInitial,
        last_name: row.lastName,
        house_name_or_number: row.houseNameOrNumber,
        postcode: row.postcode,
        aggregated_donations: row.aggregatedDonations,
        sponsored_event: row.sponsoredEvent,
        donation_date: row.donationDate,
        amount: row.amount,
        donation_amount_pence: Number(lineData.donation_amount_pence),
        claim_amount_pence: Number(lineData.claim_amount_pence),
        validation_warnings: issuesByDonationId.get(donationKey) ?? [],
        locked: Boolean(lineData.export_locked_at),
      };
    });

    const gasds_rows: GiftAidScheduleGasdsPreviewRow[] = gasdsLineInputs.map((snap) => {
      const line = lineById.get(snap.claimLineId ?? '');
      const ld = line as {
        id: string;
        gasds_batch_id: string | null;
        donation_amount_pence: number;
        claim_amount_pence: number;
        export_locked_at: string | null;
      };
      const batchId = ld.gasds_batch_id ?? '';
      return {
        claim_line_id: ld.id,
        donation_id: null,
        gasds_batch_id: batchId,
        batch_reference: snap.gasds_batch_reference ?? '—',
        collection_date: String(snap.donationDate),
        service_or_event_name: snap.gasds_service_or_event ?? snap.title ?? '—',
        collection_method: snap.gasds_collection_method ?? '—',
        eligible_amount_pence: Number(ld.donation_amount_pence),
        claim_amount_pence: Number(ld.claim_amount_pence),
        validation_warnings: issuesByDonationId.get(`gasds:${batchId}`) ?? [],
        locked: Boolean(ld.export_locked_at),
      };
    });

    return {
      data: {
        batch: {
          id: batch.id,
          status: batch.status,
          claim_start: batch.claim_start,
          claim_end: batch.claim_end,
          donation_count: Number(batch.donation_count),
          donation_total_pence: Number(batch.donation_total_pence),
          claim_total_pence: Number(batch.claim_total_pence),
        },
        rows: hmrcRows,
        gasds_rows,
        issues: preview.summary.issues.map((issueItem) => ({
          donationId: issueItem.donationId,
          field: issueItem.field,
          message: issueItem.message,
        })),
        readiness: preview.summary.readiness,
        row_count: preview.summary.rowCount,
        total_donation_amount_pence: preview.summary.totalDonationAmountPence,
        total_gift_aid_amount_pence: preview.summary.totalGiftAidAmountPence,
        export_history: (exports ?? []).map((exportRow) => ({
          id: exportRow.id,
          version: Number(exportRow.version),
          generated_by: exportRow.generated_by ?? null,
          generated_at: exportRow.generated_at,
          file_name: exportRow.file_name ?? null,
          storage_path: exportRow.storage_path ?? null,
          pdf_file_name: exportRow.pdf_file_name ?? null,
          pdf_storage_path: exportRow.pdf_storage_path ?? null,
          row_count: Number(exportRow.row_count),
          donation_total_pence: Number(exportRow.donation_total_pence),
          gift_aid_total_pence: Number(exportRow.gift_aid_total_pence),
          export_readiness: exportRow.export_readiness,
        })),
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to load Gift Aid schedule preview.',
    };
  }
}

export async function editGiftAidScheduleRow(params: {
  batchId: string;
  claimLineId: string;
  fieldName: string;
  editedValue: string | number | null;
  reason: string;
}): Promise<{ success: boolean; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();
  const { data: line, error } = await supabase
    .from('gift_aid_claim_lines')
    .select('id, export_locked_at')
    .eq('workspace_id', orgId)
    .eq('claim_batch_id', params.batchId)
    .eq('id', params.claimLineId)
    .maybeSingle();

  if (error || !line) {
    return { success: false, error: error?.message ?? 'Schedule row not found.' };
  }
  if (line.export_locked_at) {
    return {
      success: false,
      error: 'This schedule row has been exported and is locked. Re-export by creating a new version after unlocking through a controlled batch change.',
    };
  }

  return editGiftAidClaimBatchItem(params);
}

export async function exportGiftAidScheduleWorkbook(params: {
  batchId: string;
}): Promise<{
  data: { exportId: string; fileName: string; pdfFileName: string | null } | null;
  error: string | null;
}> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanExportGiftAid(role);
  } catch (e) {
    return {
      data: null,
      error: e instanceof PermissionError ? e.message : 'Permission denied.',
    };
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  try {
    const { batch, scheduleLines } = await loadSchedulePreviewLines({
      supabase,
      batchId: params.batchId,
      orgId,
    });
    const preview = buildGiftAidSchedulePreview({
      lines: scheduleLines,
      expectedDonationTotalPence: Number(batch.donation_total_pence),
      expectedGiftAidTotalPence: Number(batch.claim_total_pence),
    });

    if (preview.summary.readiness === 'blocked') {
      return {
        data: null,
        error: Array.from(new Set(preview.summary.issues.map((issueItem) => issueItem.message))).join(' '),
      };
    }

    const { data: latestExport } = await supabase
      .from('gift_aid_exports')
      .select('version')
      .eq('workspace_id', orgId)
      .eq('claim_batch_id', params.batchId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    const version = Number(latestExport?.version ?? 0) + 1;
    const exportedAt = new Date();
    const odsTemplateBuffer = await readGiftAidScheduleOdsTemplateBuffer();
    const workbookBuffer = await buildGiftAidScheduleWorkbookBuffer({
      hmrcScheduleRows: preview.rows,
      templateBuffer: odsTemplateBuffer,
    });
    const pdfBuffer = await renderGiftAidScheduleReviewPdf({
      rows: preview.rows,
      gasdsRows: preview.gasdsRows,
      summary: preview.summary,
      batchLabel: params.batchId.slice(0, 8),
    });
    const fileName = buildGiftAidScheduleWorkbookFileName({
      claimId: params.batchId,
      exportedAt,
    });
    const pdfFileName = buildGiftAidSchedulePdfFileName({
      claimId: params.batchId,
      exportedAt,
    });
    const storagePath = `${orgId}/exports/${params.batchId}/v${version}-${fileName}`;
    const pdfStoragePath = `${orgId}/exports/${params.batchId}/v${version}-${pdfFileName}`;
    const checksum = createHash('sha256').update(workbookBuffer).digest('hex');

    const [{ error: workbookUploadError }, { error: pdfUploadError }] =
      await Promise.all([
        admin.storage.from('gift-aid').upload(storagePath, workbookBuffer, {
          contentType: HMRC_GIFT_AID_ODS_MIME_TYPE,
          upsert: false,
        }),
        admin.storage.from('gift-aid').upload(pdfStoragePath, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: false,
        }),
      ]);

    if (workbookUploadError || pdfUploadError) {
      await admin.storage.from('gift-aid').remove([storagePath, pdfStoragePath]);
      return {
        data: null,
        error:
          workbookUploadError?.message ??
          pdfUploadError?.message ??
          'Unable to upload schedule files.',
      };
    }

    const { data: exportRecord, error: exportError } = await admin
      .from('gift_aid_exports')
      .insert({
        workspace_id: orgId,
        claim_batch_id: params.batchId,
        export_format: 'hmrc_ods',
        version,
        file_name: fileName,
        storage_path: storagePath,
        pdf_file_name: pdfFileName,
        pdf_storage_path: pdfStoragePath,
        checksum_sha256: checksum,
        row_count: preview.summary.rowCount,
        donation_total_pence: preview.summary.totalDonationAmountPence,
        gift_aid_total_pence: preview.summary.totalGiftAidAmountPence,
        validation_summary: preview.summary,
        export_readiness: preview.summary.readiness,
        exported_by: user.id,
        generated_by: user.id,
        generated_at: exportedAt.toISOString(),
      })
      .select('id, file_name, pdf_file_name')
      .single();

    if (exportError || !exportRecord) {
      await admin.storage.from('gift-aid').remove([storagePath, pdfStoragePath]);
      return {
        data: null,
        error: exportError?.message ?? 'Unable to save schedule export history.',
      };
    }

    await Promise.all([
      admin
        .from('gift_aid_claim_batches')
        .update({
          status: 'exported',
          latest_exported_at: exportedAt.toISOString(),
          validation_summary: preview.summary,
          validation_run_at: exportedAt.toISOString(),
          updated_by: user.id,
        })
        .eq('id', params.batchId)
        .eq('workspace_id', orgId),
      admin
        .from('gift_aid_claim_lines')
        .update({
          export_locked_at: exportedAt.toISOString(),
          export_locked_by: user.id,
          export_version: version,
        })
        .eq('claim_batch_id', params.batchId)
        .eq('workspace_id', orgId)
        .eq('status', 'included'),
      admin
        .from('donations')
        .update({
          gift_aid_status: 'exported',
          updated_by: user.id,
        })
        .eq('gift_aid_claim_batch_id', params.batchId)
        .eq('organisation_id', orgId),
    ]);

    await logGiftAidApprovalEvent({
      orgId,
      entityId: params.batchId,
      action: 'exported',
      performedBy: user.id,
      notes: `HMRC schedule v${version} exported as ${fileName}`,
    });

    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'export_gift_aid_schedule',
      entityType: 'gift_aid_claim_batch',
      entityId: params.batchId,
      metadata: {
        exportId: exportRecord.id,
        version,
        fileName,
        pdfFileName,
        rowCount: preview.summary.rowCount,
        donationTotalPence: preview.summary.totalDonationAmountPence,
        giftAidTotalPence: preview.summary.totalGiftAidAmountPence,
      },
    });

    invalidateOrgReportCache(orgId);
    return {
      data: {
        exportId: exportRecord.id,
        fileName: exportRecord.file_name ?? fileName,
        pdfFileName: exportRecord.pdf_file_name ?? pdfFileName,
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to export Gift Aid schedule.',
    };
  }
}

export async function getGiftAidScheduleExportDownloadUrl(params: {
  exportId: string;
  fileType: 'spreadsheet' | 'pdf';
}): Promise<{ data: { url: string; fileName: string } | null; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();
  const { data: exportRow, error } = await supabase
    .from('gift_aid_exports')
    .select('workspace_id, file_name, storage_path, pdf_file_name, pdf_storage_path')
    .eq('id', params.exportId)
    .single();

  if (error || !exportRow) {
    return { data: null, error: error?.message ?? 'Gift Aid export not found.' };
  }
  if (exportRow.workspace_id !== orgId) {
    return { data: null, error: 'You do not have access to this export.' };
  }

  const storagePath =
    params.fileType === 'pdf' ? exportRow.pdf_storage_path : exportRow.storage_path;
  const fileName =
    params.fileType === 'pdf'
      ? exportRow.pdf_file_name
      : exportRow.file_name;

  if (!storagePath) {
    return { data: null, error: 'This export file is no longer available.' };
  }

  const { data: signedUrl, error: signedUrlError } = await createAdminClient()
    .storage
    .from('gift-aid')
    .createSignedUrl(storagePath, 300, {
      download: fileName ?? undefined,
    });

  if (signedUrlError || !signedUrl?.signedUrl) {
    return {
      data: null,
      error: signedUrlError?.message ?? 'Unable to generate download link.',
    };
  }

  return {
    data: {
      url: signedUrl.signedUrl,
      fileName:
        fileName ??
        (params.fileType === 'pdf'
          ? 'gift-aid-schedule-review.pdf'
          : 'gift-aid-schedule.ods'),
    },
    error: null,
  };
}

/* ================================================================== */
/*  LIST CLAIMS                                                        */
/* ================================================================== */

export async function listGiftAidClaims(
  organisationId: string
): Promise<{ data: GiftAidClaimRow[] | null; error: string | null }> {
  const supabase = await createClient();

  const { data: claims, error: claimsErr } = await supabase
    .from('gift_aid_claims')
    .select('id, claim_start, claim_end, created_at, submitted_at, paid_at, reference, status, total_donations_pence, total_gift_aid_pence, journal_id')
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false });

  if (claimsErr) {
    return { data: null, error: claimsErr.message };
  }

  if (!claims || claims.length === 0) {
    return { data: [], error: null };
  }

  // For each claim, count donations and sum amounts
  const claimIds = claims.map((c) => c.id);
  const { data: donations, error: donErr } = await supabase
    .from('donations')
    .select('gift_aid_claim_id, amount_pence')
    .in('gift_aid_claim_id', claimIds);

  if (donErr) {
    return { data: null, error: donErr.message };
  }

  const agg: Record<string, { count: number; totalPence: number }> = {};
  for (const d of donations ?? []) {
    const cid = d.gift_aid_claim_id as string;
    if (!agg[cid]) agg[cid] = { count: 0, totalPence: 0 };
    agg[cid].count++;
    agg[cid].totalPence += Number(d.amount_pence);
  }

  const { data: exports, error: exportsErr } = await supabase
    .from('gift_aid_exports')
    .select('id, claim_batch_id, file_name, exported_at')
    .in('claim_batch_id', claimIds)
    .order('exported_at', { ascending: false });

  if (exportsErr) {
    return { data: null, error: exportsErr.message };
  }

  const latestExportByClaimId = new Map<
    string,
    { id: string; file_name: string | null; exported_at: string }
  >();
  for (const exportRow of exports ?? []) {
    if (!latestExportByClaimId.has(exportRow.claim_batch_id)) {
      latestExportByClaimId.set(exportRow.claim_batch_id, exportRow);
    }
  }

  const rows: GiftAidClaimRow[] = claims.map((c) => {
    const a = agg[c.id] ?? { count: 0, totalPence: 0 };
    const latestExport = latestExportByClaimId.get(c.id) ?? null;
    return {
      id: c.id,
      claim_start: c.claim_start,
      claim_end: c.claim_end,
      created_at: c.created_at,
      submitted_at: c.submitted_at,
      paid_at: c.paid_at ?? null,
      reference: c.reference,
      status: (c.status as 'draft' | 'submitted' | 'paid') ?? 'draft',
      donation_count: a.count,
      eligible_amount_pence: a.totalPence,
      claimable_total_pence: c.total_gift_aid_pence
        ? Number(c.total_gift_aid_pence)
        : Math.round(a.totalPence * 0.25),
      journal_id: c.journal_id ?? null,
      latest_export_id: latestExport?.id ?? null,
      latest_export_file_name: latestExport?.file_name ?? null,
      latest_exported_at: latestExport?.exported_at ?? null,
    };
  });

  return { data: rows, error: null };
}

/* ================================================================== */
/*  GET SINGLE CLAIM                                                   */
/* ================================================================== */

export async function getGiftAidClaim(claimId: string): Promise<{
  data: { claim: GiftAidClaimDetail; donations: ClaimDonationRow[] } | null;
  error: string | null;
}> {
  if (!claimId) {
    return { data: null, error: 'Claim ID is required.' };
  }

  const supabase = await createClient();

  const { data: claim, error: claimErr } = await supabase
    .from('gift_aid_claims')
    .select('id, organisation_id, claim_start, claim_end, created_at, submitted_at, paid_at, reference, created_by, status, journal_id, total_donations_pence, total_gift_aid_pence')
    .eq('id', claimId)
    .single();

  if (claimErr || !claim) {
    return { data: null, error: claimErr?.message ?? 'Claim not found.' };
  }

  const { data: donations, error: donErr } = await supabase
    .from('donations')
    .select(
      'id, organisation_id, donor_id, fund_id, source, donation_date, amount_pence, provider_reference, gift_aid_status, gift_aid_eligible, gift_aid_claim_id, matched_declaration_id, bank_transaction_id, donors(id, title, first_name, last_name, full_name, house_name_or_number, address, postcode), funds(id, name), bank_lines(reference, description)'
    )
    .eq('gift_aid_claim_id', claimId)
    .order('donation_date', { ascending: true });

  if (donErr) {
    return { data: null, error: donErr.message };
  }

  const donorIds = Array.from(
    new Set(
      (donations ?? [])
        .map((row) => row.donor_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  const exportBlockers: string[] = [];
  let donationRows: ClaimDonationRow[] = [];
  let latestExport:
    | { id: string; file_name: string | null; exported_at: string }
    | null = null;

  try {
    const declarationsByDonor = await loadDeclarationsByDonor({
      supabase,
      organisationId: claim.organisation_id,
      donorIds,
    });

    donationRows = (donations as ClaimDonationRawRow[]).map((donation) => {
      const evaluated = evaluateClaimDonation({
        row: donation,
        declarationsByDonor,
      });

      if (!evaluated.validation.eligible || !evaluated.hmrcPreview) {
        exportBlockers.push(
          evaluated.validation.summary ??
            `Donation ${donation.id.slice(0, 8)} is missing required HMRC export data.`
        );
      }

      return {
        id: donation.id,
        donation_date: donation.donation_date,
        amount_pence: evaluated.amountPence,
        donor_name: evaluated.donorRecord?.full_name ?? 'Anonymous',
        address: evaluated.donorRecord?.address ?? '',
        postcode: evaluated.donorRecord?.postcode ?? '',
        claimable_pence: calculateClaimablePence(evaluated.amountPence),
        fund_id: donation.fund_id ?? null,
      };
    });

    const { data: latestExportRow, error: latestExportError } = await supabase
      .from('gift_aid_exports')
      .select('id, file_name, exported_at')
      .eq('claim_batch_id', claimId)
      .order('exported_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestExportError) {
      return { data: null, error: latestExportError.message };
    }

    latestExport = latestExportRow ?? null;
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to load claim export validation.',
    };
  }

  let batch_payment: GiftAidClaimBatchPaymentSnapshot | null = null;
  try {
    const { data: batchRow, error: batchErr } = await supabase
      .from('gift_aid_claim_batches')
      .select(
        'id, claim_total_pence, expected_payment_amount_pence, expected_payment_date, payment_bank_account_id, received_payment_total_pence, received_bank_transaction_id, gift_aid_payment_status, payment_reconciled_at, payment_journal_id'
      )
      .eq('id', claimId)
      .eq('workspace_id', claim.organisation_id)
      .maybeSingle();

    if (!batchErr && batchRow) {
      const { data: allocRows } = await supabase
        .from('gift_aid_claim_payment_allocations')
        .select(
          'id, bank_line_id, allocated_amount_pence, journal_id, confirmed_at, bank_lines ( txn_date, reference, description, amount_pence )'
        )
        .eq('claim_batch_id', claimId)
        .order('confirmed_at', { ascending: false });

      const mapAlloc = (
        row: {
          id: string;
          bank_line_id: string;
          allocated_amount_pence: number;
          journal_id: string | null;
          confirmed_at: string;
          bank_lines:
            | { txn_date: string; reference: string | null; description: string | null; amount_pence: number }
            | { txn_date: string; reference: string | null; description: string | null; amount_pence: number }[]
            | null;
        }
      ) => {
        const bl = Array.isArray(row.bank_lines) ? row.bank_lines[0] : row.bank_lines;
        return {
          id: row.id,
          bank_line_id: row.bank_line_id,
          allocated_amount_pence: Number(row.allocated_amount_pence),
          journal_id: row.journal_id ?? null,
          confirmed_at: row.confirmed_at,
          txn_date: bl?.txn_date ?? null,
          reference: bl?.reference ?? null,
          description: bl?.description ?? null,
          amount_pence: bl?.amount_pence != null ? Number(bl.amount_pence) : null,
        };
      };

      batch_payment = {
        claim_batch_id: batchRow.id,
        expected_payment_amount_pence: batchRow.expected_payment_amount_pence != null
          ? Number(batchRow.expected_payment_amount_pence)
          : null,
        expected_payment_date: batchRow.expected_payment_date ?? null,
        payment_bank_account_id: batchRow.payment_bank_account_id ?? null,
        received_payment_total_pence: Number(batchRow.received_payment_total_pence ?? 0),
        received_bank_transaction_id: batchRow.received_bank_transaction_id ?? null,
        gift_aid_payment_status: (batchRow.gift_aid_payment_status as GiftAidClaimBatchPaymentSnapshot['gift_aid_payment_status']) ?? 'pending',
        payment_reconciled_at: batchRow.payment_reconciled_at ?? null,
        payment_journal_id: batchRow.payment_journal_id ?? null,
        claim_total_pence: Number(batchRow.claim_total_pence ?? 0),
        allocations: (allocRows ?? []).map(mapAlloc),
      };
    }
  } catch {
    batch_payment = null;
  }

  return {
    data: {
      claim: {
        id: claim.id,
        claim_start: claim.claim_start,
        claim_end: claim.claim_end,
        created_at: claim.created_at,
        submitted_at: claim.submitted_at,
        paid_at: claim.paid_at ?? null,
        reference: claim.reference,
        status: (claim.status as 'draft' | 'submitted' | 'paid') ?? 'draft',
        created_by: claim.created_by,
        journal_id: claim.journal_id ?? null,
        total_donations_pence: claim.total_donations_pence ? Number(claim.total_donations_pence) : null,
        total_gift_aid_pence: claim.total_gift_aid_pence ? Number(claim.total_gift_aid_pence) : null,
        export_ready: exportBlockers.length === 0 || Boolean(latestExport?.id),
        export_blockers: Array.from(new Set(exportBlockers)),
        latest_export_id: latestExport?.id ?? null,
        latest_export_file_name: latestExport?.file_name ?? null,
        latest_exported_at: latestExport?.exported_at ?? null,
        batch_payment,
      },
      donations: donationRows,
    },
    error: null,
  };
}

/* ================================================================== */
/*  MARK CLAIM SUBMITTED                                               */
/* ================================================================== */

export async function markClaimSubmitted(
  claimId: string,
  reference: string
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanExportGiftAid(role); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  if (!claimId) {
    return { success: false, error: 'Claim ID is required.' };
  }

  const supabase = await createClient();

  // Verify claim exists and is in draft status
  const { data: claim } = await supabase
    .from('gift_aid_claims')
    .select('id, status')
    .eq('id', claimId)
    .single();

  if (!claim) {
    return { success: false, error: 'Claim not found.' };
  }

  if (claim.status === 'paid') {
    return { success: false, error: 'Claim has already been paid. Cannot change status.' };
  }

  const { error } = await supabase
    .from('gift_aid_claims')
    .update({
      submitted_at: new Date().toISOString(),
      reference: reference.trim() || null,
      status: 'submitted',
    })
    .eq('id', claimId);

  if (error) {
    return { success: false, error: error.message };
  }

  await supabase
    .from('gift_aid_claim_batches')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      hmrc_submission_reference: reference.trim() || null,
      updated_by: user.id,
    })
    .eq('id', claimId);

  await supabase
    .from('gift_aid_small_donation_batches')
    .update({
      status: 'claimed',
      updated_by: user.id,
    })
    .eq('gift_aid_claim_batch_id', claimId)
    .eq('workspace_id', orgId);

  await supabase
    .from('donations')
    .update({
      gift_aid_status: 'submitted',
      updated_by: user.id,
    })
    .or(`gift_aid_claim_id.eq.${claimId},gift_aid_claim_batch_id.eq.${claimId}`)
    .eq('organisation_id', orgId);

  await logGiftAidApprovalEvent({
    orgId,
    entityId: claimId,
    action: 'submitted',
    performedBy: user.id,
    notes: reference.trim() ? `HMRC ref: ${reference.trim()}` : undefined,
  });

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'submit_gift_aid_claim',
    entityType: 'gift_aid_claim',
    entityId: claimId,
    metadata: {
      reference: reference.trim() || null,
      submittedAt: new Date().toISOString(),
      status: 'submitted',
    },
  });

  return { success: true, error: null };
}

/* ================================================================== */
/*  RECORD HMRC PAYMENT — GL POSTING                                   */
/*  Creates a GL transaction: Debit Bank, Credit Gift Aid Income.      */
/*  Supports proportional fund allocation by default.                  */
/* ================================================================== */

export async function recordGiftAidPayment(params: {
  claimId: string;
  paymentDate: string;
  amountPence?: number;
}): Promise<{ success: boolean; journalId: string | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanExportGiftAid(role); }
  catch (e) { return { success: false, journalId: null, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const { claimId, paymentDate } = params;

  if (!claimId || !paymentDate) {
    return { success: false, journalId: null, error: 'Claim ID and payment date are required.' };
  }

  // Period lock check
  const locked = await isDateInLockedPeriod(paymentDate);
  if (locked) {
    return { success: false, journalId: null, error: 'Payment date falls in a locked financial period.' };
  }

  const supabase = await createClient();

  // Fetch claim
  const { data: claim, error: claimErr } = await supabase
    .from('gift_aid_claims')
    .select('id, status, total_gift_aid_pence, organisation_id')
    .eq('id', claimId)
    .single();

  if (claimErr || !claim) {
    return { success: false, journalId: null, error: 'Claim not found.' };
  }

  if (claim.status === 'paid') {
    return { success: false, journalId: null, error: 'This claim has already been marked as paid.' };
  }

  if (claim.status !== 'submitted') {
    return { success: false, journalId: null, error: 'Claim must be submitted before recording payment.' };
  }

  const giftAidPence = params.amountPence
    ?? (claim.total_gift_aid_pence ? Number(claim.total_gift_aid_pence) : 0);

  if (giftAidPence <= 0) {
    return { success: false, journalId: null, error: 'Gift Aid amount must be positive.' };
  }

  const journalResult = await createPostedGiftAidReclaimJournal({
    orgId,
    claimOrBatchId: claimId,
    paymentDate,
    amountPence: giftAidPence,
    userId: user.id,
  });

  if ('error' in journalResult) {
    return { success: false, journalId: null, error: journalResult.error };
  }

  const { journalId: journalIdFromPost } = journalResult;
  const admin = createAdminClient();

  // Update claim status to paid
  const { error: claimUpdateErr } = await admin
    .from('gift_aid_claims')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      journal_id: journalIdFromPost,
    })
    .eq('id', claimId);

  if (claimUpdateErr) {
    return { success: false, journalId: journalIdFromPost, error: claimUpdateErr.message };
  }

  await admin
    .from('donations')
    .update({
      gift_aid_status: 'paid',
      updated_by: user.id,
    })
    .or(`gift_aid_claim_id.eq.${claimId},gift_aid_claim_batch_id.eq.${claimId}`)
    .eq('organisation_id', orgId);

  invalidateOrgReportCache(orgId);

  await logGiftAidApprovalEvent({
    orgId,
    entityId: claimId,
    action: 'paid',
    performedBy: user.id,
    notes: `Payment date: ${paymentDate}, amount: ${giftAidPence}p, journal: ${journalIdFromPost}`,
  });

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'record_gift_aid_payment',
    entityType: 'gift_aid_claim',
    entityId: claimId,
    metadata: {
      paymentDate,
      amountPence: giftAidPence,
      journalId: journalIdFromPost,
      status: 'paid',
    },
  });

  return { success: true, journalId: journalIdFromPost, error: null };
}

/* ================================================================== */
/*  GIFT AID CLAIM BATCH — BANK PAYMENT CONFIRMATION / RECONCILIATION   */
/* ================================================================== */

const GIFT_AID_PAYMENT_ELIGIBLE_BATCH = new Set([
  'exported',
  'submitted',
  'approved',
  'paid',
]);

export async function syncGiftAidBatchExpectedPaymentDefaults(params: {
  claimBatchId: string;
}): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanExportGiftAid(role);
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof PermissionError ? e.message : 'Permission denied.',
    };
  }

  const admin = createAdminClient();
  const { data: batch } = await admin
    .from('gift_aid_claim_batches')
    .select(
      'id, claim_total_pence, expected_payment_amount_pence, expected_payment_date, submitted_at'
    )
    .eq('id', params.claimBatchId)
    .eq('workspace_id', orgId)
    .maybeSingle();

  if (!batch) {
    return { success: false, error: 'Claim batch not found.' };
  }

  const updates: Record<string, unknown> = {};
  if (batch.expected_payment_amount_pence == null && batch.claim_total_pence != null) {
    updates.expected_payment_amount_pence = batch.claim_total_pence;
  }
  if (
    batch.expected_payment_date == null
    && batch.submitted_at
  ) {
    updates.expected_payment_date = String(batch.submitted_at).slice(0, 10);
  }

  if (Object.keys(updates).length === 0) {
    return { success: true, error: null };
  }

  const { error } = await admin
    .from('gift_aid_claim_batches')
    .update({ ...updates, updated_by: user.id })
    .eq('id', batch.id)
    .eq('workspace_id', orgId);

  return { success: !error, error: error?.message ?? null };
}

export async function suggestGiftAidBankReceiptMatchesForBatch(params: {
  claimBatchId: string;
  limit?: number;
}): Promise<{
  data: Array<{
    bank_line_id: string;
    txn_date: string;
    amount_pence: number;
    reference: string | null;
    description: string | null;
    score: number;
    hints: string[];
  }>;
  error: string | null;
}> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const { data: batch, error: batchErr } = await supabase
    .from('gift_aid_claim_batches')
    .select(
      'id, workspace_id, claim_start, claim_end, expected_payment_amount_pence, expected_payment_date, payment_bank_account_id, claim_total_pence'
    )
    .eq('id', params.claimBatchId)
    .maybeSingle();

  if (batchErr || !batch || batch.workspace_id !== orgId) {
    return { data: [], error: batchErr?.message ?? 'Claim batch not found.' };
  }

  const lim = Math.min(Math.max(params.limit ?? 24, 1), 100);
  let q = supabase
    .from('bank_lines')
    .select('id, txn_date, amount_pence, reference, description')
    .eq('organisation_id', orgId)
    .gt('amount_pence', 0)
    .order('txn_date', { ascending: false })
    .limit(500);

  if (batch.payment_bank_account_id) {
    q = q.eq('bank_account_id', batch.payment_bank_account_id);
  }

  const { data: lines, error: lineErr } = await q;

  if (lineErr) {
    return { data: [], error: lineErr.message };
  }

  const expectedAmount =
    batch.expected_payment_amount_pence != null
      ? Number(batch.expected_payment_amount_pence)
      : batch.claim_total_pence != null
        ? Number(batch.claim_total_pence)
        : null;
  const expectedDate = batch.expected_payment_date ?? null;

  const start = batch.claim_start;
  const end = batch.claim_end;

  const scored = (lines ?? []).map((line) => {
    const txnDateStr = typeof line.txn_date === 'string' ? line.txn_date : String(line.txn_date);
    const amt = Number(line.amount_pence);
    const scoreResult = scoreHmrcReceiptMatch({
      reference: line.reference ?? null,
      description: line.description ?? null,
      amountPence: amt,
      txnDate: txnDateStr,
      expectedAmountPence: expectedAmount,
      expectedDate,
    });
    let dateBoost = 0;
    try {
      if (start && txnDateStr) {
        const t = new Date(txnDateStr).getTime();
        const s = new Date(String(start)).getTime();
        const eDate = end ? new Date(String(end)).getTime() : s;
        if (!Number.isNaN(t)) {
          const lo = Math.min(s, eDate);
          const hi = Math.max(s, eDate);
          if (t >= lo && t <= hi + 180 * 86400000) {
            dateBoost = 12;
          }
        }
      }
    } catch {
      /* noop */
    }
    return {
      bank_line_id: line.id as string,
      txn_date: txnDateStr,
      amount_pence: amt,
      reference: line.reference ?? null,
      description: line.description ?? null,
      score: Math.min(100, scoreResult.score + dateBoost),
      hints: [...scoreResult.hints, ...(dateBoost > 0 ? ['Near claim window'] : [])],
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return { data: scored.slice(0, lim), error: null };
}

export async function confirmGiftAidClaimBatchPayment(params: {
  claimBatchId: string;
  bankLineId: string;
  allocatedAmountPence: number;
}): Promise<{ success: boolean; journalId: string | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanExportGiftAid(role);
  } catch (e) {
    return {
      success: false,
      journalId: null,
      error:
        e instanceof PermissionError ? e.message : 'Permission denied.',
    };
  }

  const admin = createAdminClient();
  const { claimBatchId, bankLineId, allocatedAmountPence } = params;

  if (!claimBatchId || !bankLineId || allocatedAmountPence <= 0) {
    return {
      success: false,
      journalId: null,
      error: 'Batch, bank line and a positive allocation are required.',
    };
  }

  const { data: batch, error: batchErr } = await admin
    .from('gift_aid_claim_batches')
    .select(
      `
      id, workspace_id, status, gift_aid_payment_status, claim_total_pence,
      expected_payment_amount_pence, expected_payment_date,
      payment_bank_account_id, received_payment_total_pence, received_bank_transaction_id,
      submitted_at, claim_start, claim_end
    `
    )
    .eq('id', claimBatchId)
    .eq('workspace_id', orgId)
    .maybeSingle();

  if (batchErr || !batch) {
    return { success: false, journalId: null, error: 'Claim batch not found.' };
  }

  const batchStatusStr = batch.status as string;
  if (!GIFT_AID_PAYMENT_ELIGIBLE_BATCH.has(batchStatusStr)) {
    return {
      success: false,
      journalId: null,
      error: 'This batch must be exported or submitted before recording a bank receipt.',
    };
  }

  const { data: bankLine, error: blErr } = await admin
    .from('bank_lines')
    .select('id, organisation_id, bank_account_id, amount_pence, txn_date, reference, description')
    .eq('id', bankLineId)
    .maybeSingle();

  if (blErr || !bankLine || bankLine.organisation_id !== orgId) {
    return { success: false, journalId: null, error: 'Bank line not found.' };
  }

  if (Number(bankLine.amount_pence) <= 0) {
    return {
      success: false,
      journalId: null,
      error: 'Only incoming (credit) bank lines can be allocated to Gift Aid receipts.',
    };
  }

  if (
    batch.payment_bank_account_id
    && bankLine.bank_account_id !== batch.payment_bank_account_id
  ) {
    return {
      success: false,
      journalId: null,
      error: 'This bank line is not on the expected Gift Aid bank account for this batch.',
    };
  }

  const { data: existingAllocs } = await admin
    .from('gift_aid_claim_payment_allocations')
    .select('allocated_amount_pence, claim_batch_id')
    .eq('workspace_id', orgId)
    .eq('bank_line_id', bankLineId);

  const sumThisBatch = (existingAllocs ?? [])
    .filter((r) => r.claim_batch_id === claimBatchId)
    .reduce((s, r) => s + Number(r.allocated_amount_pence), 0);

  if (sumThisBatch > 0) {
    return {
      success: false,
      journalId: null,
      error: 'This batch already has an allocation against this bank line. Remove or adjust imports first.',
    };
  }

  const lineAmt = Number(bankLine.amount_pence);

  const sumAllocAcross = (existingAllocs ?? []).reduce(
    (s, r) => s + Number(r.allocated_amount_pence),
    0
  );

  if (
    !allocationIsValid({
      lineAmountPence: lineAmt,
      existingAllocationsSumPence: sumAllocAcross,
      newAllocationPence: allocatedAmountPence,
    })
  ) {
    return {
      success: false,
      journalId: null,
      error: 'Allocated amount exceeds the remaining balance on this bank line.',
    };
  }

  const paymentDate =
    typeof bankLine.txn_date === 'string'
      ? bankLine.txn_date.slice(0, 10)
      : new Date(String(bankLine.txn_date)).toISOString().slice(0, 10);

  const locked = await isDateInLockedPeriod(paymentDate);
  if (locked) {
    return {
      success: false,
      journalId: null,
      error: 'Payment date falls in a locked financial period.',
    };
  }

  const journalResult = await createPostedGiftAidReclaimJournal({
    orgId,
    claimOrBatchId: claimBatchId,
    paymentDate,
    amountPence: allocatedAmountPence,
    userId: user.id,
  });

  if ('error' in journalResult) {
    return { success: false, journalId: null, error: journalResult.error };
  }

  const { journalId: postedJournalId } = journalResult;

  const prevStatus = batch.gift_aid_payment_status as GiftAidClaimBatchPaymentSnapshot['gift_aid_payment_status'];
  const receivedWas = Number(batch.received_payment_total_pence ?? 0);
  const newReceived = receivedWas + allocatedAmountPence;
  const expectedPenceRaw =
    batch.expected_payment_amount_pence != null
      ? Number(batch.expected_payment_amount_pence)
      : batch.claim_total_pence != null
        ? Number(batch.claim_total_pence)
        : null;

  const nextStatus = computeGiftAidPaymentStatus({
    expectedPence: expectedPenceRaw,
    receivedPence: newReceived,
    previousStatus: prevStatus,
  });

  const { error: insertErr } = await admin
    .from('gift_aid_claim_payment_allocations')
    .insert({
      workspace_id: orgId,
      claim_batch_id: claimBatchId,
      bank_line_id: bankLineId,
      allocated_amount_pence: allocatedAmountPence,
      journal_id: postedJournalId,
      confirmed_at: new Date().toISOString(),
      confirmed_by: user.id,
    });

  if (insertErr) {
    await admin.from('journals').delete().eq('id', postedJournalId);
    return { success: false, journalId: null, error: insertErr.message };
  }

  const anchorLineId = batch.received_bank_transaction_id ?? bankLineId;

  const batchUpdate: Record<string, unknown> = {
    received_payment_total_pence: newReceived,
    received_bank_transaction_id: anchorLineId,
    gift_aid_payment_status: nextStatus,
    payment_journal_id: postedJournalId,
    updated_by: user.id,
  };

  const { error: upBatchErr } = await admin
    .from('gift_aid_claim_batches')
    .update(batchUpdate)
    .eq('id', claimBatchId)
    .eq('workspace_id', orgId);

  if (upBatchErr) {
    return {
      success: false,
      journalId: postedJournalId,
      error: upBatchErr.message,
    };
  }

  const settled =
    expectedPenceRaw != null && newReceived >= expectedPenceRaw;

  if (settled) {
    const paidDate = paymentDate;

    await admin
      .from('gift_aid_claim_batches')
      .update({ status: 'paid', updated_by: user.id })
      .eq('id', claimBatchId)
      .eq('workspace_id', orgId);

    await admin
      .from('gift_aid_claims')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        journal_id: postedJournalId,
      })
      .eq('id', claimBatchId)
      .eq('organisation_id', orgId);

    await admin
      .from('donations')
      .update({ gift_aid_status: 'paid', updated_by: user.id })
      .or(`gift_aid_claim_id.eq.${claimBatchId},gift_aid_claim_batch_id.eq.${claimBatchId}`)
      .eq('organisation_id', orgId);

    await logGiftAidApprovalEvent({
      orgId,
      entityId: claimBatchId,
      action: 'paid',
      performedBy: user.id,
      notes: `Gift Aid bank reconciliation: ${allocatedAmountPence}p allocated, journal ${postedJournalId}, date ${paidDate}`,
    });
  }

  invalidateOrgReportCache(orgId);

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'confirm_gift_aid_claim_batch_allocation',
    entityType: 'gift_aid_claim_batch',
    entityId: claimBatchId,
    metadata: {
      bankLineId,
      allocatedAmountPence,
      journalId: postedJournalId,
      batchPaymentStatus: nextStatus,
      receivedPaymentTotalPence: newReceived,
    },
  });

  return {
    success: true,
    journalId: postedJournalId,
    error: null,
  };
}

export async function markGiftAidClaimBatchPaymentReconciled(params: {
  claimBatchId: string;
  notes?: string;
}): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanExportGiftAid(role);
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof PermissionError ? e.message : 'Permission denied.',
    };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('gift_aid_claim_batches')
    .update({
      gift_aid_payment_status: 'reconciled',
      payment_reconciled_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq('id', params.claimBatchId)
    .eq('workspace_id', orgId);

  if (!error) {
    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'mark_gift_aid_claim_batch_payment_reconciled',
      entityType: 'gift_aid_claim_batch',
      entityId: params.claimBatchId,
      metadata: { notes: params.notes?.trim() ?? null },
    });
  }

  return { success: !error, error: error?.message ?? null };
}

export async function listGiftAidPaymentReconciliationCandidates(
  workspaceId?: string | null,
): Promise<{
  data: Array<{
    id: string;
    batch_reference: string | null;
    hmrc_submission_reference: string | null;
    claim_total_pence: number;
    received_payment_total_pence: number;
    gift_aid_payment_status: string;
    claim_start: string;
    claim_end: string;
    status: string;
  }>;
  error: string | null;
}> {
  const { orgId } = await getActiveOrg();
  const oid = workspaceId ?? orgId;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('gift_aid_claim_batches')
    .select(
      'id, batch_reference, hmrc_submission_reference, claim_total_pence, received_payment_total_pence, gift_aid_payment_status, claim_start, claim_end, status'
    )
    .eq('workspace_id', oid)
    .order('updated_at', { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  const rows =
    (data ?? [])
      .filter(
        (row) =>
          row.gift_aid_payment_status !== 'reconciled'
          && GIFT_AID_PAYMENT_ELIGIBLE_BATCH.has(String(row.status))
          && String(row.status) !== 'paid',
      )
      .map((row) => ({
      id: row.id,
      batch_reference: row.batch_reference ?? null,
      hmrc_submission_reference: row.hmrc_submission_reference ?? null,
      claim_total_pence: Number(row.claim_total_pence ?? 0),
      received_payment_total_pence: Number(row.received_payment_total_pence ?? 0),
      gift_aid_payment_status: String(row.gift_aid_payment_status ?? 'pending'),
      claim_start: String(row.claim_start),
      claim_end: String(row.claim_end),
      status: String(row.status ?? ''),
      }));

  return { data: rows, error: null };
}

/* ================================================================== */
/*  DASHBOARD METRICS                                                  */
/* ================================================================== */

export async function getGiftAidDashboard(
  organisationId: string
): Promise<{ data: GiftAidDashboard | null; error: string | null }> {
  const supabase = await createClient();

  // Current fiscal year (default: Jan–Dec)
  const { data: settings } = await supabase
    .from('organisation_settings')
    .select('fiscal_year_start_month')
    .eq('organisation_id', organisationId)
    .single();

  const startMonth = settings?.fiscal_year_start_month ?? 1;
  const now = new Date();
  let yearStart: Date;
  if (now.getMonth() + 1 >= startMonth) {
    yearStart = new Date(now.getFullYear(), startMonth - 1, 1);
  } else {
    yearStart = new Date(now.getFullYear() - 1, startMonth - 1, 1);
  }
  const yearStartStr = yearStart.toISOString().slice(0, 10);

  // 1. Estimated reclaim this year: 25% of all eligible posted donations in current year
  const { data: eligibleDonations } = await supabase
    .from('donations')
    .select('amount_pence')
    .eq('organisation_id', organisationId)
    .eq('status', 'posted')
    .gte('donation_date', yearStartStr)
    .is('gift_aid_claim_id', null);

  // Filter: only donations where gift_aid_eligible might be true
  // For simplicity, count all unclaimed posted donations in the year
  const estimatedPence = (eligibleDonations ?? []).reduce(
    (s, d) => s + Math.round(Number(d.amount_pence) * 0.25),
    0
  );

  // 2. Claimed amount (total gift_aid_pence for all claims in the year)
  const { data: yearClaims } = await supabase
    .from('gift_aid_claims')
    .select('total_gift_aid_pence, status')
    .eq('organisation_id', organisationId)
    .gte('created_at', yearStart.toISOString());

  let claimedPence = 0;
  let paidPence = 0;
  for (const c of yearClaims ?? []) {
    const ga = c.total_gift_aid_pence ? Number(c.total_gift_aid_pence) : 0;
    claimedPence += ga;
    if (c.status === 'paid') paidPence += ga;
  }

  const outstandingPence = claimedPence - paidPence;

  // 3. Donors missing declarations
  const { data: allDonors } = await supabase
    .from('donors')
    .select('id')
    .eq('organisation_id', organisationId)
    .eq('is_active', true);

  const donorIds = (allDonors ?? []).map((d) => d.id);

  let donorsMissingDeclarations = 0;

  if (donorIds.length > 0) {
    const { data: declaredDonors } = await supabase
      .from('gift_aid_declarations')
      .select('donor_id')
      .in('donor_id', donorIds)
      .eq('is_active', true);

    const declaredSet = new Set((declaredDonors ?? []).map((d) => d.donor_id));
    donorsMissingDeclarations = donorIds.filter((id) => !declaredSet.has(id)).length;
  }

  // 4. Donations excluded (unclaimed + would-be-ineligible for current year)
  // We count unclaimed donations in the year that are NOT eligible
  // (For dashboard purposes: donations posted this year with no claim and no active declaration)
  const donationsExcluded = (eligibleDonations ?? []).length;
  // We already have the unclaimed count; the excluded = total unclaimed in year
  // This is a simplification; ideally we'd run full eligibility checks

  return {
    data: {
      estimatedReclaimThisYearPence: estimatedPence,
      claimedAmountPence: claimedPence,
      outstandingReclaimPence: outstandingPence,
      paidAmountPence: paidPence,
      donorsMissingDeclarations,
      donationsExcluded,
    },
    error: null,
  };
}

export async function getGiftAidControlCentreData(
  organisationId: string
): Promise<{ data: GiftAidControlCentreData | null; error: string | null }> {
  const syncResult = await runRecurringDonorPatternSync(organisationId);

  const supabase = await createClient();

  const [
    reviewResult,
    donorResult,
    claimResult,
    declarationResult,
    gasdsBatchesResult,
    orgSettingsResult,
    { data: donationTotals, error: donationTotalsError },
    unreconciledHmrcCount,
  ] = await Promise.all([
    listGiftAidReviewQueue(organisationId),
    listGiftAidDonors(organisationId),
    listGiftAidClaims(organisationId),
    listDeclarations(organisationId),
    supabase
      .from('gift_aid_small_donation_batches')
      .select(
        'id, batch_reference, collection_date, service_or_event_name, collection_method, eligible_amount_pence, total_collected_pence, status, gift_aid_claim_batch_id'
      )
      .eq('workspace_id', organisationId)
      .order('collection_date', { ascending: false })
      .limit(200),
    supabase
      .from('organisation_settings')
      .select(
        'gasds_annual_cap_pence, gift_aid_reminder_stale_declaration_days, gift_aid_reminder_no_donation_days, gift_aid_require_signed_declaration_copy'
      )
      .eq('organisation_id', organisationId)
      .maybeSingle(),
    supabase
      .from('donations')
      .select(
        'donor_id, amount_pence, gift_aid_eligible, gift_aid_status, gift_aid_claim_id, gift_aid_claim_batch_id'
      )
      .eq('organisation_id', organisationId)
      .eq('status', 'posted'),
    countUnreconciledHmrcPaymentBatches(supabase, organisationId),
  ]);

  if (reviewResult.error) return { data: null, error: reviewResult.error };
  if (donorResult.error) return { data: null, error: donorResult.error };
  if (claimResult.error) return { data: null, error: claimResult.error };
  if (declarationResult.error) return { data: null, error: declarationResult.error };
  if (gasdsBatchesResult.error) return { data: null, error: gasdsBatchesResult.error.message };
  if (orgSettingsResult.error) return { data: null, error: orgSettingsResult.error.message };
  if (donationTotalsError) return { data: null, error: donationTotalsError.message };

  const syncReminders = await syncGiftAidDeclarationReminders(supabase, organisationId);
  if (syncReminders.error) {
    console.warn('Gift Aid declaration reminders sync skipped:', syncReminders.error);
  }

  const { data: reminderRowsRaw, error: reminderFetchError } = await supabase
    .from('gift_aid_reminders')
    .select(
      'id, donor_id, declaration_id, reminder_type, severity, message, status, due_date'
    )
    .eq('workspace_id', organisationId)
    .eq('status', 'open')
    .order('severity', { ascending: false })
    .limit(50);

  if (reminderFetchError) {
    return { data: null, error: reminderFetchError.message };
  }

  const reminders: GiftAidReminderRow[] = (reminderRowsRaw ?? []).map((r) => ({
    id: r.id as string,
    donor_id: (r.donor_id as string | null) ?? null,
    declaration_id: (r.declaration_id as string | null) ?? null,
    reminder_type: String(r.reminder_type),
    severity: r.severity as GiftAidReminderRow['severity'],
    message: String(r.message),
    status: 'open',
    due_date: (r.due_date as string | null) ?? null,
  }));

  const reminderSettings: GiftAidReminderSettings = {
    stale_declaration_days: Number(
      orgSettingsResult.data?.gift_aid_reminder_stale_declaration_days ?? 365
    ),
    no_donation_days: Number(orgSettingsResult.data?.gift_aid_reminder_no_donation_days ?? 540),
    require_signed_copy: Boolean(
      orgSettingsResult.data?.gift_aid_require_signed_declaration_copy
    ),
  };

  let recurringInsights = null as Awaited<
    ReturnType<typeof buildGiftAidRecurringControlInsights>
  > | null;
  if (!syncResult.error) {
    recurringInsights = await buildGiftAidRecurringControlInsights(organisationId, supabase, {
      declarations: declarationResult.data ?? [],
      reviewRows: reviewResult.data ?? [],
    });
  }

  const { current: healthPrimaryPeriod, previous: healthComparisonPeriod } =
    deriveTaxYearPrimaryAndComparisonPeriods();

  const donorTotals = new Map<
    string,
    {
      totalGivingPence: number;
      eligibleGivingPence: number;
      giftAidClaimedPence: number;
    }
  >();

  const annualCapPence = Number(orgSettingsResult.data?.gasds_annual_cap_pence ?? 800_000);
  const tyStart = ukTaxYearStartDate();
  const tyLabel = `${tyStart.getUTCFullYear()}/${String((tyStart.getUTCFullYear() + 1) % 100).padStart(2, '0')}`;

  const { data: gasdsClaimedLines } = await supabase
    .from('gift_aid_claim_lines')
    .select('donation_amount_pence, gift_aid_claim_batches!claim_batch_id(status, submitted_at, claim_end)')
    .eq('workspace_id', organisationId)
    .eq('claim_item_type', 'gasds');

  let gasdsClaimedEligiblePence = 0;
  for (const row of gasdsClaimedLines ?? []) {
    const typed = row as unknown as {
      donation_amount_pence?: number;
      gift_aid_claim_batches?:
        | { status?: string | null; submitted_at?: string | null; claim_end?: string | null }
        | Array<{ status?: string | null; submitted_at?: string | null; claim_end?: string | null }>;
    };
    const rel = typed.gift_aid_claim_batches;
    const batch = Array.isArray(rel) ? rel[0] : rel;
    if (!batch) continue;
    const st = String(batch.status ?? '');
    if (!['exported', 'submitted', 'paid'].includes(st)) continue;
    const anchorRaw = batch.submitted_at ?? batch.claim_end;
    if (!anchorRaw) continue;
    if (new Date(String(anchorRaw)) < tyStart) continue;
    gasdsClaimedEligiblePence += Number(typed.donation_amount_pence ?? 0);
  }

  const gasdsSummary: GiftAidGasdsSummary = {
    tax_year_label: tyLabel,
    claimed_eligible_pence: gasdsClaimedEligiblePence,
    annual_cap_pence: annualCapPence,
    remaining_eligible_pence: Math.max(0, annualCapPence - gasdsClaimedEligiblePence),
    ready_batch_count: (gasdsBatchesResult.data ?? []).filter(
      (r) => r.status === 'ready' && !r.gift_aid_claim_batch_id
    ).length,
  };

  const gasds_batches: GiftAidControlGasdsBatchRow[] = (gasdsBatchesResult.data ?? []).map((row) => ({
    id: row.id,
    batch_reference: row.batch_reference,
    collection_date: row.collection_date,
    service_or_event_name: row.service_or_event_name,
    collection_method: row.collection_method,
    eligible_amount_pence: Number(row.eligible_amount_pence),
    total_collected_pence: Number(row.total_collected_pence),
    status: row.status,
    plain_status: plainGasdsBatchStatusLabel(row.status),
    gift_aid_claim_batch_id: row.gift_aid_claim_batch_id,
  }));

  for (const donation of donationTotals ?? []) {
    if (!donation.donor_id) continue;
    const current = donorTotals.get(donation.donor_id) ?? {
      totalGivingPence: 0,
      eligibleGivingPence: 0,
      giftAidClaimedPence: 0,
    };
    const amountPence = Number(donation.amount_pence ?? 0);
    current.totalGivingPence += amountPence;
    if (donation.gift_aid_eligible || donation.gift_aid_status === 'eligible') {
      current.eligibleGivingPence += amountPence;
    }
    if (
      donation.gift_aid_claim_id ||
      donation.gift_aid_claim_batch_id ||
      ['exported', 'submitted', 'paid', 'included_in_claim'].includes(
        String(donation.gift_aid_status)
      )
    ) {
      current.giftAidClaimedPence += Math.round(amountPence * 0.25);
    }
    donorTotals.set(donation.donor_id, current);
  }

  const health_score = computeGiftAidHealthScore({
    reviewRowsAll: reviewResult.data ?? [],
    claims: claimResult.data ?? [],
    gasds: gasdsSummary,
    recurringInsights,
    unreconciledHmrcPaymentsCount: unreconciledHmrcCount,
    primaryPeriod: healthPrimaryPeriod,
    comparisonPeriod: healthComparisonPeriod,
  });

  return {
    data: buildGiftAidControlCentreData({
      donors: donorResult.data,
      declarations: declarationResult.data,
      reviewRows: reviewResult.data,
      claims: claimResult.data ?? [],
      donorTotals,
      recurringInsights,
      gasds: gasdsSummary,
      gasds_batches,
      reminders,
      reminder_settings: reminderSettings,
      health_score,
    }),
    error: null,
  };
}

export async function syncGiftAidRecurringDonorPatterns(): Promise<{
  success: boolean;
  error: string | null;
  insertedCount?: number;
}> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanPerform(role, 'update', 'gift_aid');
  } catch (error) {
    return {
      success: false,
      error: error instanceof PermissionError ? error.message : 'Permission denied.',
    };
  }

  const result = await runRecurringDonorPatternSync(orgId);
  if (result.error) {
    return { success: false, error: result.error };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'sync_recurring_donor_patterns',
    entityType: 'organisation',
    entityId: orgId,
    metadata: { insertedCount: result.insertedCount },
  });
  invalidateOrgReportCache(orgId);
  return { success: true, error: null, insertedCount: result.insertedCount };
}

export async function refreshGiftAidDeclarationReminders(): Promise<{
  success: boolean;
  error: string | null;
}> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanPerform(role, 'update', 'gift_aid');
  } catch (error) {
    return {
      success: false,
      error: error instanceof PermissionError ? error.message : 'Permission denied.',
    };
  }

  const supabase = await createClient();
  const syncResult = await syncGiftAidDeclarationReminders(supabase, orgId);
  if (syncResult.error) {
    return { success: false, error: syncResult.error };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'gift_aid_declaration_reminders_refreshed',
    entityType: 'organisation',
    entityId: orgId,
    metadata: {},
  });
  invalidateOrgReportCache(orgId);
  return { success: true, error: null };
}

export async function dismissGiftAidReminder(reminderId: string): Promise<{
  success: boolean;
  error: string | null;
}> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanPerform(role, 'update', 'gift_aid');
  } catch (error) {
    return {
      success: false,
      error: error instanceof PermissionError ? error.message : 'Permission denied.',
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('gift_aid_reminders')
    .update({
      status: 'dismissed',
      dismissed_at: new Date().toISOString(),
      dismissed_by: user.id,
      resolved_at: null,
    })
    .eq('id', reminderId)
    .eq('workspace_id', orgId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'gift_aid_declaration_reminder_dismissed',
    entityType: 'gift_aid_reminder',
    entityId: reminderId,
    metadata: {},
  });
  invalidateOrgReportCache(orgId);
  return { success: true, error: null };
}

export async function updateGiftAidReminderSettings(payload: {
  staleDeclarationDays: number;
  noDonationDays: number;
  requireSignedCopy: boolean;
}): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanPerform(role, 'update', 'gift_aid');
  } catch (error) {
    return {
      success: false,
      error: error instanceof PermissionError ? error.message : 'Permission denied.',
    };
  }

  const stale = Math.round(Number(payload.staleDeclarationDays));
  const none = Math.round(Number(payload.noDonationDays));
  if (stale < 30 || stale > 1825 || none < 30 || none > 2555) {
    return { success: false, error: 'Days must be within allowed ranges (30–1825 stale, 30–2555 inactivity).' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('organisation_settings')
    .update({
      gift_aid_reminder_stale_declaration_days: stale,
      gift_aid_reminder_no_donation_days: none,
      gift_aid_require_signed_declaration_copy: Boolean(payload.requireSignedCopy),
    })
    .eq('organisation_id', orgId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'gift_aid_reminder_settings_updated',
    entityType: 'organisation',
    entityId: orgId,
    metadata: {
      staleDeclarationDays: stale,
      noDonationDays: none,
      requireSignedCopy: Boolean(payload.requireSignedCopy),
    },
  });
  invalidateOrgReportCache(orgId);
  return { success: true, error: null };
}

export async function listGiftAidReviewQueue(
  organisationId: string
): Promise<{ data: GiftAidReviewQueueRow[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('donations')
    .select(`
      id,
      donation_date,
      amount_pence,
      source,
      provider_reference,
      bank_transaction_id,
      donor_id,
      gift_aid_status,
      gift_aid_eligible,
      gift_aid_validation_result,
      review_reason,
      gift_aid_claim_id,
      donors(id, full_name, first_name, last_name, house_name_or_number, email, address, postcode, reference_code),
      funds(name)
    `)
    .eq('organisation_id', organisationId)
    .eq('status', 'posted')
    .order('donation_date', { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  const bankTransactionIds = Array.from(
    new Set(
      (data ?? [])
        .map((row) => row.bank_transaction_id)
        .filter((value): value is string => Boolean(value))
    )
  );
  const donationIds = (data ?? []).map((row) => row.id);

  const [
    { data: bankLines, error: bankLineError },
    { data: bankMatches, error: bankMatchError },
    { data: donationMatches, error: donationMatchError },
  ] = await Promise.all([
    bankTransactionIds.length > 0
      ? supabase
          .from('bank_lines')
          .select('id, reference, description')
          .in('id', bankTransactionIds)
      : Promise.resolve({ data: [], error: null }),
    bankTransactionIds.length > 0
      ? supabase
          .from('bank_transaction_donor_matches')
          .select(`
            id,
            bank_transaction_id,
            donation_id,
            donor_id,
            match_method,
            review_status,
            confidence_score,
            notes,
            donors(id, full_name, email, address, postcode)
          `)
          .eq('workspace_id', organisationId)
          .in('bank_transaction_id', bankTransactionIds)
      : Promise.resolve({ data: [], error: null }),
    donationIds.length > 0
      ? supabase
          .from('bank_transaction_donor_matches')
          .select(`
            id,
            bank_transaction_id,
            donation_id,
            donor_id,
            match_method,
            review_status,
            confidence_score,
            notes,
            donors(id, full_name, email, address, postcode)
          `)
          .eq('workspace_id', organisationId)
          .in('donation_id', donationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (bankLineError) {
    return { data: [], error: bankLineError.message };
  }
  if (bankMatchError) {
    return { data: [], error: bankMatchError.message };
  }
  if (donationMatchError) {
    return { data: [], error: donationMatchError.message };
  }

  const bankLineMap = new Map((bankLines ?? []).map((line) => [line.id, line]));
  const duplicateAnalysis = analyzeGiftAidDuplicateCandidates(
    (data ?? []).map((row) => {
      const bankLine = bankLineMap.get(row.bank_transaction_id ?? '');
      return buildGiftAidDuplicateCandidate({
        donationId: row.id,
        workspaceId: organisationId,
        donorId: row.donor_id ?? null,
        donationDate: row.donation_date,
        amountPence: row.amount_pence == null ? null : Number(row.amount_pence),
        reference:
          bankLine?.reference ??
          row.provider_reference ??
          bankLine?.description ??
          null,
        claimId: row.gift_aid_claim_id,
      });
    })
  );
  const matchRows = Array.from(
    new Map(
      [...(bankMatches ?? []), ...(donationMatches ?? [])].map((match) => [
        match.id,
        match,
      ])
    ).values()
  );
  const matchPriority: Record<string, number> = {
    confirmed: 5,
    auto_confirmed: 4,
    suggested: 3,
    superseded: 2,
    rejected: 1,
  };

  const matchesByDonation = matchRows.reduce((map, match) => {
    const donationId = match.donation_id;
    if (!donationId) return map;

    const donorRecord = Array.isArray(match.donors) ? match.donors[0] ?? null : match.donors;
    const entry: QueueMatchSuggestion = donorRecord
      ? {
          id: match.id,
          donor_id: donorRecord.id,
          donor_name: donorRecord.full_name,
          donor_email: donorRecord.email,
          donor_address: donorRecord.address,
          donor_postcode: donorRecord.postcode,
          match_method: match.match_method,
          review_status: match.review_status,
          confidence_score:
            match.confidence_score == null ? null : Number(match.confidence_score),
          notes: match.notes ?? null,
        }
      : null;

    if (!entry) return map;
    const existing = map.get(donationId) ?? [];
    existing.push(entry);
    map.set(donationId, existing);
    return map;
  }, new Map<string, QueueMatchSuggestion[]>());

  const donorIds = Array.from(
    new Set(
      (data ?? [])
        .flatMap((row) => {
          const suggestions = matchesByDonation.get(row.id) ?? [];
          return [
            row.donor_id,
            ...suggestions.map((suggestion) => suggestion?.donor_id ?? null),
          ];
        })
        .filter((value): value is string => Boolean(value))
    )
  );

  let declarationsByDonor = new Map<string, QueueDeclaration[]>();
  if (donorIds.length > 0) {
    const { data: declarations, error: declarationError } = await supabase
      .from('gift_aid_declarations')
      .select('id, donor_id, declaration_type, status, declaration_date, start_date, end_date, covers_past_donations, is_active, attachment_url, notes, hmrc_version, template_version')
      .eq('organisation_id', organisationId)
      .in('donor_id', donorIds)
      .order('declaration_date', { ascending: false });

    if (declarationError) {
      return { data: [], error: declarationError.message };
    }

    declarationsByDonor = (declarations ?? []).reduce((map, declaration) => {
      const existing = map.get(declaration.donor_id) ?? [];
      existing.push({
        id: declaration.id,
        donor_id: declaration.donor_id,
        declaration_type: declaration.declaration_type,
        status: declaration.status,
        declaration_date: declaration.declaration_date,
        start_date: declaration.start_date,
        end_date: declaration.end_date,
        covers_past_donations: declaration.covers_past_donations ?? false,
        is_active: declaration.is_active,
        attachment_url: declaration.attachment_url ?? null,
        notes: declaration.notes ?? null,
        hmrc_version: declaration.hmrc_version ?? null,
        template_version: declaration.template_version ?? null,
      });
      map.set(declaration.donor_id, existing);
      return map;
    }, new Map<string, QueueDeclaration[]>());
  }

  const rows: GiftAidReviewQueueRow[] = (data ?? [])
    .filter((row) => !row.gift_aid_claim_id)
    .map((row) => {
      const donorRecord = Array.isArray(row.donors) ? row.donors[0] ?? null : row.donors;
      const donor: QueueDonor = donorRecord
        ? {
            id: donorRecord.id,
            full_name: donorRecord.full_name,
            reference_code: donorRecord.reference_code ?? null,
            first_name: donorRecord.first_name ?? null,
            last_name: donorRecord.last_name ?? null,
            house_name_or_number:
              donorRecord.house_name_or_number ?? donorRecord.address ?? null,
            email: donorRecord.email,
            address: donorRecord.address,
            postcode: donorRecord.postcode,
          }
        : null;

      const bestSuggestedMatch =
        (matchesByDonation.get(row.id) ?? [])
          .slice()
          .sort((left, right) => {
            const priorityDelta =
              (matchPriority[right?.review_status ?? 'rejected'] ?? 0) -
              (matchPriority[left?.review_status ?? 'rejected'] ?? 0);
            if (priorityDelta !== 0) return priorityDelta;
            return (right?.confidence_score ?? 0) - (left?.confidence_score ?? 0);
          })[0] ?? null;

      const declarations =
        declarationsByDonor.get(donor?.id ?? bestSuggestedMatch?.donor_id ?? '') ?? [];
      const validation = evaluateGiftAidEligibility({
        donation: {
          id: row.id,
          donor_id: row.donor_id ?? null,
          donation_date: row.donation_date,
          amount_pence: Number(row.amount_pence),
          gift_aid_claim_id: row.gift_aid_claim_id,
        },
        donor: donor
          ? {
              id: donor.id,
              full_name: donor.full_name,
              first_name: donor.first_name ?? null,
              last_name: donor.last_name ?? null,
              house_name_or_number:
                donor.house_name_or_number ?? donor.address ?? null,
              address: donor.address,
              postcode: donor.postcode,
            }
          : null,
        declarations: declarations.map((declaration) => ({
          id: declaration.id,
          status:
            declaration.status ??
            (declaration.is_active ? 'active' : 'cancelled'),
          start_date: declaration.start_date,
          end_date: declaration.end_date,
          is_active: declaration.is_active,
        })),
      });
      const matchedDeclaration =
        declarations.find(
          (declaration) => declaration.id === validation.matchedDeclarationId
        ) ?? null;
      const declarationInfo = matchedDeclaration
        ? { matchedDeclaration, declarationStatus: 'active' as const }
        : getDeclarationStatusForDonation({
            donationDate: row.donation_date,
            declarations,
          });
      const status = getQueueStatus({
        giftAidClaimId: row.gift_aid_claim_id,
        giftAidEligible: row.gift_aid_eligible,
        storedGiftAidStatus: row.gift_aid_status,
        donor,
        suggestedMatch: bestSuggestedMatch,
        validation,
        matchedDeclaration: declarationInfo.matchedDeclaration,
      });
      const fund = Array.isArray(row.funds) ? row.funds[0] ?? null : row.funds;
      const bankLine = bankLineMap.get(row.bank_transaction_id ?? '');
      const duplicate = duplicateAnalysis.get(row.id);
      const duplicateWarning = duplicate?.blockingError ?? duplicate?.warning ?? null;
      const workflowStage =
        duplicate?.hasPossibleDuplicate && status.workflow_stage === 'prepare_claim'
          ? 'validate'
          : status.workflow_stage;
      const queueReason =
        duplicate?.hasPossibleDuplicate && status.queue_reason === 'Validated and ready for claim preparation'
          ? 'Possible duplicate donation needs review'
          : status.queue_reason;

      return {
        donation_id: row.id,
        donation_date: row.donation_date,
        amount_pence: Number(row.amount_pence),
        source: row.source,
        bank_reference:
          bankLine?.reference ?? row.provider_reference ?? bankLine?.description ?? null,
        fund_name: fund?.name ?? null,
        donor_id: donor?.id ?? null,
        donor_name: donor?.full_name ?? null,
        donor_email: donor?.email ?? null,
        donor_address: donor?.address ?? null,
        donor_postcode: donor?.postcode ?? null,
        suggested_match_id: bestSuggestedMatch?.id ?? null,
        suggested_donor_id: bestSuggestedMatch?.donor_id ?? null,
        suggested_donor_name: bestSuggestedMatch?.donor_name ?? null,
        suggested_donor_email: bestSuggestedMatch?.donor_email ?? null,
        suggested_match_method: bestSuggestedMatch?.match_method ?? null,
        suggested_match_review_status: bestSuggestedMatch?.review_status ?? null,
        confidence_score: bestSuggestedMatch?.confidence_score ?? null,
        declaration_id: declarationInfo.matchedDeclaration?.id ?? null,
        declaration_date: declarationInfo.matchedDeclaration?.declaration_date ?? null,
        declaration_active: declarationInfo.declarationStatus === 'active',
        declaration_status: declarationInfo.declarationStatus,
        declaration_type: declarationInfo.matchedDeclaration?.declaration_type ?? null,
        declaration_start_date: declarationInfo.matchedDeclaration?.start_date ?? null,
        declaration_end_date: declarationInfo.matchedDeclaration?.end_date ?? null,
        declaration_covers_past_donations:
          declarationInfo.matchedDeclaration?.covers_past_donations ?? false,
        declaration_attachment_url:
          declarationInfo.matchedDeclaration?.attachment_url ?? null,
        declaration_notes: declarationInfo.matchedDeclaration?.notes ?? null,
        declaration_hmrc_version:
          declarationInfo.matchedDeclaration?.hmrc_version ?? null,
        declaration_template_version:
          declarationInfo.matchedDeclaration?.template_version ?? null,
        gift_aid_eligible: row.gift_aid_eligible,
        gift_aid_claim_id: row.gift_aid_claim_id,
        gift_aid_status: validation.status,
        eligibility_status: validation.eligible
          ? 'eligible'
          : validation.status === 'ineligible'
            ? 'ineligible'
            : validation.status.replace(/_/g, ' '),
        validation_issues: status.validation_issues,
        duplicate_fingerprint: duplicate?.fingerprint ?? null,
        duplicate_warning: duplicateWarning,
        duplicate_blocking: duplicate?.hasClaimConflict ?? false,
        duplicate_related_donation_ids: duplicate?.duplicateDonationIds ?? [],
        workflow_stage: workflowStage,
        queue_reason: queueReason,
        validation_reason:
          duplicateWarning ??
          status.validation_reason ??
          validation.summary ??
          row.review_reason ??
          bestSuggestedMatch?.notes ??
          null,
      };
    });

  return { data: rows, error: null };
}

export async function getGiftAidWorkflowDashboard(
  organisationId: string
): Promise<{ data: GiftAidWorkflowDashboard | null; error: string | null }> {
  const [{ data: queue, error: queueError }, { data: claims, error: claimsError }] =
    await Promise.all([
      listGiftAidReviewQueue(organisationId),
      listGiftAidClaims(organisationId),
    ]);

  if (queueError) {
    return { data: null, error: queueError };
  }
  if (claimsError) {
    return { data: null, error: claimsError };
  }

  const claimRows = claims ?? [];

  const stageCounts: Record<GiftAidWorkflowStage, number> = {
    ingest: queue.length,
    match: queue.filter((row) => row.workflow_stage === 'match').length,
    validate: queue.filter((row) => row.workflow_stage === 'validate').length,
    prepare_claim: queue.filter((row) => row.workflow_stage === 'prepare_claim').length,
    export: claimRows.filter((claim) => claim.status === 'draft').length,
    track_audit: claimRows.filter((claim) => claim.status === 'submitted' || claim.status === 'paid').length,
  };

  const data: GiftAidWorkflowDashboard = {
    kpis: [
      {
        id: 'eligible-donations',
        title: 'Eligible donations',
        value: queue.filter((row) => row.workflow_stage === 'prepare_claim').length,
        subtitle: 'Giving ready to be gathered into a claim batch',
        href: '/gift-aid/claim-builder',
      },
      {
        id: 'estimated-reclaim',
        title: 'Estimated reclaim value',
        value: queue
          .filter((row) => row.workflow_stage === 'prepare_claim')
          .reduce((sum, row) => sum + Math.round(row.amount_pence * 0.25), 0),
        subtitle: 'Expected Gift Aid value from eligible giving',
        href: '/gift-aid/claim-builder',
      },
      {
        id: 'needs-review',
        title: 'Needs review',
        value: queue.filter(
          (row) =>
            row.workflow_stage === 'match' || row.workflow_stage === 'validate'
        ).length,
        subtitle: 'Donations still waiting for donor or validation review',
        href: '/gift-aid?stage=needs_review',
      },
      {
        id: 'missing-declarations',
        title: 'Missing declarations',
        value: queue.filter(
          (row) =>
            row.declaration_status === 'missing' ||
            row.gift_aid_status === 'matched_no_declaration'
        ).length,
        subtitle: 'Donations that still need declaration coverage',
        href: '/gift-aid?stage=validate',
      },
      {
        id: 'draft-claim-batches',
        title: 'Draft claim batches',
        value: claimRows.filter((claim) => claim.status === 'draft').length,
        subtitle: 'Claim batches prepared but not yet submitted',
        href: '/gift-aid/claim-history?status=draft',
      },
      {
        id: 'submitted-claim-batches',
        title: 'Submitted claim batches',
        value: claimRows.filter((claim) => claim.status === 'submitted').length,
        subtitle: 'Batches already sent to HMRC and being tracked',
        href: '/gift-aid/claim-history?status=submitted',
      },
    ],
    stages: [
      { id: 'ingest', label: 'Ingest', description: 'Donations received into Church Ledger', count: stageCounts.ingest },
      { id: 'match', label: 'Match', description: 'Link donations to the right donor', count: stageCounts.match },
      { id: 'validate', label: 'Validate', description: 'Check declaration coverage and donor details', count: stageCounts.validate },
      { id: 'prepare_claim', label: 'Prepare claim', description: 'Validated donations ready for a claim pack', count: stageCounts.prepare_claim },
      { id: 'export', label: 'Export', description: 'Draft claims awaiting HMRC export/submission', count: stageCounts.export },
      { id: 'track_audit', label: 'Track & audit', description: 'Submitted and paid claims with audit history', count: stageCounts.track_audit },
    ],
  };

  return { data, error: null };
}

export async function listGiftAidDonors(
  organisationId: string
): Promise<{ data: GiftAidDonorRow[]; error: string | null }> {
  const supabase = await createClient();

  const [{ data: donors, error: donorError }, { data: declarations, error: declarationError }, { data: donations, error: donationError }] =
    await Promise.all([
      supabase
        .from('donors')
        .select('id, full_name, reference_code, donor_reference_code, title, first_name, last_name, display_name, house_name_or_number, email, phone, address, postcode, notes, is_active')
        .eq('organisation_id', organisationId)
        .order('full_name', { ascending: true }),
      supabase
        .from('gift_aid_declarations')
        .select('id, donor_id, is_active')
        .eq('organisation_id', organisationId),
      supabase
        .from('donations')
        .select('id, donor_id, donation_date, gift_aid_eligible')
        .eq('organisation_id', organisationId)
        .eq('status', 'posted'),
    ]);

  if (donorError) return { data: [], error: donorError.message };
  if (declarationError) return { data: [], error: declarationError.message };
  if (donationError) return { data: [], error: donationError.message };

  const declarationMap = new Map<string, { total: number; active: number }>();
  for (const declaration of declarations ?? []) {
    const current = declarationMap.get(declaration.donor_id) ?? { total: 0, active: 0 };
    current.total += 1;
    if (declaration.is_active) current.active += 1;
    declarationMap.set(declaration.donor_id, current);
  }

  const donationMap = new Map<string, { total: number; validated: number; latest: string | null }>();
  for (const donation of donations ?? []) {
    if (!donation.donor_id) continue;
    const current = donationMap.get(donation.donor_id) ?? { total: 0, validated: 0, latest: null };
    current.total += 1;
    if (donation.gift_aid_eligible) current.validated += 1;
    if (!current.latest || donation.donation_date > current.latest) {
      current.latest = donation.donation_date;
    }
    donationMap.set(donation.donor_id, current);
  }

  const rows: GiftAidDonorRow[] = (donors ?? []).map((donor) => {
    const declarationStats = declarationMap.get(donor.id) ?? { total: 0, active: 0 };
    const donationStats = donationMap.get(donor.id) ?? { total: 0, validated: 0, latest: null };

    return {
      id: donor.id,
      full_name: donor.full_name,
      reference_code: donor.reference_code ?? null,
      donor_reference_code: donor.donor_reference_code ?? donor.reference_code ?? null,
      title: donor.title ?? null,
      first_name: donor.first_name ?? null,
      last_name: donor.last_name ?? null,
      display_name: donor.display_name ?? donor.full_name,
      house_name_or_number: donor.house_name_or_number ?? donor.address ?? null,
      email: donor.email,
      phone: donor.phone ?? null,
      address: donor.address,
      postcode: donor.postcode,
      notes: donor.notes ?? null,
      is_active: donor.is_active,
      declaration_count: declarationStats.total,
      active_declaration_count: declarationStats.active,
      donation_count: donationStats.total,
      validated_donation_count: donationStats.validated,
      unlinked_donation_count: 0,
      latest_donation_date: donationStats.latest,
    };
  });

  return { data: rows, error: null };
}

export async function getGiftAidDonorDetail(
  organisationId: string,
  donorId: string
): Promise<{ data: GiftAidDonorDetail | null; error: string | null }> {
  const supabase = await createClient();

  const [
    { data: donor, error: donorError },
    { data: declarations, error: declarationError },
    { data: donations, error: donationError },
    { data: recurringPatterns, error: recurringError },
    { data: donorRemindersRaw, error: remindersError },
  ] = await Promise.all([
    supabase
      .from('donors')
      .select('id, full_name, reference_code, donor_reference_code, title, first_name, last_name, display_name, house_name_or_number, email, phone, address, postcode, notes, is_active')
      .eq('organisation_id', organisationId)
      .eq('id', donorId)
      .single(),
    supabase
      .from('gift_aid_declarations')
      .select('id, donor_id, declaration_type, status, start_date, end_date, is_active, declaration_date, covers_past_donations, hmrc_version, template_version, attachment_url, donation_amount_pence, charity_name, donor_title_snapshot, donor_first_name_or_initial_snapshot, donor_surname_snapshot, donor_full_home_address_snapshot, donor_postcode_snapshot, signed_date, taxpayer_confirmation, declaration_wording, donor_notification_notes, generated_pdf_storage_path, notes, created_at, cancelled_at, cancelled_by, cancellation_evidence_notes')
      .eq('organisation_id', organisationId)
      .eq('donor_id', donorId)
      .order('declaration_date', { ascending: false }),
    supabase
      .from('donations')
      .select('id, donation_date, amount_pence, source, gift_aid_status, gift_aid_eligible, gift_aid_claim_id, gift_aid_claim_batch_id, bank_transaction_id, funds(name), bank_lines(reference, description), gift_aid_claim_batches(batch_reference, hmrc_submission_reference, status)')
      .eq('organisation_id', organisationId)
      .eq('donor_id', donorId)
      .eq('status', 'posted')
      .order('donation_date', { ascending: false }),
    supabase
      .from('recurring_donor_patterns')
      .select(
        'id, pattern_type, expected_amount_pence, amount_tolerance_pence, expected_day_of_month, bank_reference_alias, confidence_score, status, grace_days, next_expected_date, last_occurrence_at, occurrence_count, updated_at'
      )
      .eq('workspace_id', organisationId)
      .eq('donor_id', donorId)
      .neq('status', 'dismissed')
      .order('updated_at', { ascending: false }),
    supabase
      .from('gift_aid_reminders')
      .select(
        'id, donor_id, declaration_id, reminder_type, severity, message, status, due_date'
      )
      .eq('workspace_id', organisationId)
      .eq('donor_id', donorId)
      .eq('status', 'open')
      .order('severity', { ascending: false }),
  ]);

  if (donorError || !donor) {
    return { data: null, error: donorError?.message ?? 'Donor not found.' };
  }
  if (declarationError) {
    return { data: null, error: declarationError.message };
  }
  if (donationError) {
    return { data: null, error: donationError.message };
  }
  if (recurringError) {
    return { data: null, error: recurringError.message };
  }
  if (remindersError) {
    return { data: null, error: remindersError.message };
  }

  const donorRow: GiftAidDonorRow = {
    id: donor.id,
    full_name: donor.full_name,
    reference_code: donor.reference_code ?? null,
    donor_reference_code: donor.donor_reference_code ?? donor.reference_code ?? null,
    title: donor.title ?? null,
    first_name: donor.first_name ?? null,
    last_name: donor.last_name ?? null,
    display_name: donor.display_name ?? donor.full_name,
    house_name_or_number: donor.house_name_or_number ?? donor.address ?? null,
    email: donor.email ?? null,
    phone: donor.phone ?? null,
    address: donor.address ?? null,
    postcode: donor.postcode ?? null,
    notes: donor.notes ?? null,
    is_active: donor.is_active,
    declaration_count: declarations?.length ?? 0,
    active_declaration_count: (declarations ?? []).filter((decl) => decl.is_active).length,
    donation_count: donations?.length ?? 0,
    validated_donation_count: (donations ?? []).filter((item) => item.gift_aid_eligible).length,
    unlinked_donation_count: 0,
    latest_donation_date: donations?.[0]?.donation_date ?? null,
  };

  const declarationRows: GiftAidDeclarationRow[] = await Promise.all((declarations ?? []).map(async (declaration) => ({
    id: declaration.id,
    donor_id: declaration.donor_id,
    donor_name: donor.full_name,
    declaration_type: declaration.declaration_type,
    status: declaration.status,
    start_date: declaration.start_date,
    end_date: declaration.end_date,
    is_active: declaration.is_active,
    declaration_date: declaration.declaration_date,
    covers_past_donations: declaration.covers_past_donations ?? false,
    hmrc_version: declaration.hmrc_version,
    template_version: declaration.template_version,
    attachment_url: declaration.attachment_url,
    attachment_download_url: await createGiftAidSignedUrl(declaration.attachment_url),
    donation_amount_pence: declaration.donation_amount_pence ? Number(declaration.donation_amount_pence) : null,
    charity_name: declaration.charity_name ?? null,
    donor_title_snapshot: declaration.donor_title_snapshot ?? null,
    donor_first_name_or_initial_snapshot: declaration.donor_first_name_or_initial_snapshot ?? null,
    donor_surname_snapshot: declaration.donor_surname_snapshot ?? null,
    donor_full_home_address_snapshot: declaration.donor_full_home_address_snapshot ?? null,
    donor_postcode_snapshot: declaration.donor_postcode_snapshot ?? null,
    signed_date: declaration.signed_date ?? null,
    taxpayer_confirmation: Boolean(declaration.taxpayer_confirmation),
    declaration_wording: declaration.declaration_wording ?? null,
    donor_notification_notes: declaration.donor_notification_notes ?? null,
    generated_pdf_storage_path: declaration.generated_pdf_storage_path ?? null,
    generated_pdf_download_url: await createGiftAidSignedUrl(declaration.generated_pdf_storage_path),
    notes: declaration.notes ?? null,
    created_at: declaration.created_at,
    cancelled_at: declaration.cancelled_at ?? null,
    cancelled_by: declaration.cancelled_by ?? null,
    cancellation_evidence_notes: declaration.cancellation_evidence_notes ?? null,
  })));

  const donationRows: GiftAidDonorDonationHistoryRow[] = (donations ?? []).map((donation) => {
    const fund = Array.isArray(donation.funds) ? donation.funds[0] ?? null : donation.funds;
    const bankLine = Array.isArray(donation.bank_lines) ? donation.bank_lines[0] ?? null : donation.bank_lines;
    const claimBatch = Array.isArray(donation.gift_aid_claim_batches)
      ? donation.gift_aid_claim_batches[0] ?? null
      : donation.gift_aid_claim_batches;
    const claimReference =
      claimBatch?.hmrc_submission_reference ??
      claimBatch?.batch_reference ??
      donation.gift_aid_claim_batch_id ??
      donation.gift_aid_claim_id ??
      null;
    return {
      id: donation.id,
      donation_date: donation.donation_date,
      amount_pence: Number(donation.amount_pence),
      source: donation.source,
      fund_name: fund?.name ?? null,
      bank_transaction_label:
        bankLine?.reference ?? bankLine?.description ?? donation.bank_transaction_id ?? null,
      gift_aid_status: donation.gift_aid_status ?? 'needs_review',
      gift_aid_eligible: donation.gift_aid_eligible,
      gift_aid_claim_batch_id: donation.gift_aid_claim_batch_id ?? donation.gift_aid_claim_id ?? null,
      gift_aid_claim_reference: claimReference,
      gift_aid_claimed: Boolean(
        donation.gift_aid_claim_batch_id ||
          donation.gift_aid_claim_id ||
          ['exported', 'submitted', 'paid'].includes(donation.gift_aid_status ?? '')
      ),
    };
  });

  const recurringPatternRows: GiftAidRecurringPatternRow[] = (recurringPatterns ?? [])
    .filter((row) => row.status !== 'dismissed')
    .map((row) => ({
      id: row.id as string,
      pattern_type: row.pattern_type as GiftAidRecurringPatternRow['pattern_type'],
      expected_amount_pence: Number(row.expected_amount_pence),
      amount_tolerance_pence: Number(row.amount_tolerance_pence ?? 50),
      expected_day_of_month:
        row.expected_day_of_month == null ? null : Number(row.expected_day_of_month),
      bank_reference_alias: row.bank_reference_alias ?? null,
      confidence_score: Number(row.confidence_score ?? 0.8),
      status: row.status === 'paused' ? 'paused' : 'active',
      grace_days: Number(row.grace_days ?? 7),
      next_expected_date: row.next_expected_date ?? null,
      last_occurrence_at: row.last_occurrence_at ?? null,
      occurrence_count: Number(row.occurrence_count ?? 3),
      updated_at: row.updated_at as string,
    }));

  const donorRemindersMapped: GiftAidReminderRow[] = (donorRemindersRaw ?? []).map((r) => ({
    id: r.id as string,
    donor_id: (r.donor_id as string | null) ?? null,
    declaration_id: (r.declaration_id as string | null) ?? null,
    reminder_type: String(r.reminder_type),
    severity: r.severity as GiftAidReminderRow['severity'],
    message: String(r.message),
    status: r.status as GiftAidReminderRow['status'],
    due_date: (r.due_date as string | null) ?? null,
  }));

  return {
    data: {
      donor: donorRow,
      declarations: declarationRows,
      donations: donationRows,
      recurring_patterns: recurringPatternRows,
      gift_aid_reminders: donorRemindersMapped,
    },
    error: null,
  };
}

export async function createGiftAidDonor(params: {
  fullName?: string;
  title?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  houseNameOrNumber?: string;
  postcode?: string;
  phone?: string;
  donorReferenceCode?: string;
  referenceCode?: string;
  email?: string;
  notes?: string;
  donationId?: string;
}): Promise<{ success: boolean; donorId: string | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'create', 'donations'); }
  catch (e) { return { success: false, donorId: null, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();
  const donorFields = buildDonorWriteFields(params);
  if (!donorFields.full_name) {
    return { success: false, donorId: null, error: 'Enter the donor name before saving.' };
  }
  const { data, error } = await supabase
    .from('donors')
    .insert({
      organisation_id: orgId,
      ...donorFields,
      is_active: true,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, donorId: null, error: error.message };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'create_gift_aid_donor',
    entityType: 'donor',
    entityId: data.id,
    metadata: {
      fullName: donorFields.full_name,
      donorReferenceCode: donorFields.reference_code ?? null,
      linkedDonationId: params.donationId ?? null,
    },
  });

  if (params.donationId) {
    const assignment = await assignDonationDonor({
      donationId: params.donationId,
      donorId: data.id,
    });
    if (!assignment.success) {
      return {
        success: false,
        donorId: data.id,
        error: assignment.error ?? 'Donor created, but linking the donation failed.',
      };
    }
  }

  return { success: true, donorId: data.id, error: null };
}

export async function updateGiftAidDonor(params: {
  donorId: string;
  fullName?: string;
  title?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  houseNameOrNumber?: string;
  postcode?: string;
  phone?: string;
  donorReferenceCode?: string;
  referenceCode?: string;
  email?: string;
  notes?: string;
}): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'donations'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();
  const donorFields = buildDonorWriteFields(params);
  if (!donorFields.full_name) {
    return { success: false, error: 'Enter the donor name before saving.' };
  }
  const { error } = await supabase
    .from('donors')
    .update({
      ...donorFields,
    })
    .eq('organisation_id', orgId)
    .eq('id', params.donorId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'update_gift_aid_donor',
    entityType: 'donor',
    entityId: params.donorId,
    metadata: {
      fullName: donorFields.full_name,
      donorReferenceCode: donorFields.reference_code ?? null,
    },
  });

  try {
    await syncDonorGiftAidValidations({
      orgId,
      donorId: params.donorId,
      userId: user.id,
    });
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Donor updated, but Gift Aid validation refresh failed.',
    };
  }

  return { success: true, error: null };
}

export async function assignDonationDonor(params: {
  donationId: string;
  donorId: string;
  matchId?: string | null;
}): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'gift_aid'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();
  const { data: donation, error: donationError } = await supabase
    .from('donations')
    .select('id, bank_transaction_id')
    .eq('organisation_id', orgId)
    .eq('id', params.donationId)
    .single();

  if (donationError || !donation) {
    return { success: false, error: donationError?.message ?? 'Donation not found.' };
  }

  const { error } = await supabase
    .from('donations')
    .update({
      donor_id: params.donorId,
      updated_by: user.id,
    })
    .eq('organisation_id', orgId)
    .eq('id', params.donationId);

  if (error) {
    return { success: false, error: error.message };
  }

  const sourceUpdate = donation.bank_transaction_id
    ? supabase
        .from('bank_transaction_donor_matches')
        .update({
          review_status: 'superseded',
          updated_by: user.id,
        })
        .eq('workspace_id', orgId)
        .eq('bank_transaction_id', donation.bank_transaction_id)
        .in('review_status', ['suggested', 'auto_confirmed', 'superseded'])
    : supabase
        .from('bank_transaction_donor_matches')
        .update({
          review_status: 'superseded',
          updated_by: user.id,
        })
        .eq('workspace_id', orgId)
        .eq('donation_id', params.donationId)
        .in('review_status', ['suggested', 'auto_confirmed', 'superseded']);

  const { error: sourceError } = await sourceUpdate;
  if (sourceError) {
    return { success: false, error: sourceError.message };
  }

  if (params.matchId) {
    const { error: matchError } = await supabase
      .from('bank_transaction_donor_matches')
      .update({
        donor_id: params.donorId,
        review_status: 'confirmed',
        updated_by: user.id,
      })
      .eq('id', params.matchId)
      .eq('workspace_id', orgId);

    if (matchError) {
      return { success: false, error: matchError.message };
    }
  } else {
    const { data: existingManualMatch } = await supabase
      .from('bank_transaction_donor_matches')
      .select('id')
      .eq('workspace_id', orgId)
      .eq('donation_id', params.donationId)
      .eq('donor_id', params.donorId)
      .eq('match_method', 'manual')
      .limit(1)
      .maybeSingle();

    const matchError = existingManualMatch
      ? (
          await supabase
            .from('bank_transaction_donor_matches')
            .update({
              review_status: 'confirmed',
              notes: 'Donor selected manually from the Gift Aid review queue.',
              updated_by: user.id,
            })
            .eq('id', existingManualMatch.id)
        ).error
      : (
          await supabase
            .from('bank_transaction_donor_matches')
            .insert({
              workspace_id: orgId,
              bank_transaction_id: donation.bank_transaction_id,
              donation_id: params.donationId,
              donor_id: params.donorId,
              match_method: 'manual',
              confidence_score: 1,
              review_status: 'confirmed',
              notes: 'Donor selected manually from the Gift Aid review queue.',
              created_by: user.id,
              updated_by: user.id,
            })
        ).error;

    if (matchError) {
      return { success: false, error: matchError.message };
    }
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'match_gift_aid_donation_donor',
    entityType: 'donation',
    entityId: params.donationId,
    metadata: {
      donorId: params.donorId,
      matchId: params.matchId ?? null,
      bankTransactionId: donation.bank_transaction_id ?? null,
      reviewStatus: 'confirmed',
    },
  });

  try {
    await syncDonationGiftAidValidation({
      orgId,
      donationId: params.donationId,
      userId: user.id,
    });
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Donor assigned, but Gift Aid validation refresh failed.',
    };
  }

  return { success: true, error: null };
}

export async function refreshGiftAidReviewMatches(params?: {
  donationIds?: string[];
}): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { role } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'gift_aid'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  try {
    await runGiftAidDonorMatching({ donationIds: params?.donationIds });
    return { success: true, error: null };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unable to refresh donor matches.',
    };
  }
}

export async function setDonationGiftAidValidation(params: {
  donationId: string;
  eligible: boolean;
  reason?: string;
}): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'gift_aid'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();
  const { data: donation, error: donationError } = await supabase
    .from('donations')
    .select('id, donation_date, donor_id, gift_aid_claim_id, gift_aid_status')
    .eq('organisation_id', orgId)
    .eq('id', params.donationId)
    .single();

  if (donationError || !donation) {
    return { success: false, error: donationError?.message ?? 'Donation not found.' };
  }

  if (!params.eligible) {
    try {
      await setDonationGiftAidManualIneligible({
        orgId,
        donationId: params.donationId,
        userId: user.id,
        reason: params.reason,
      });
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to exclude donation from Gift Aid.',
      };
    }

    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'exclude_gift_aid_donation',
      entityType: 'donation',
      entityId: params.donationId,
      metadata: {
        previousStatus: donation.gift_aid_status,
        nextStatus: 'ineligible',
        reason: params.reason ?? null,
      },
    });

    return { success: true, error: null };
  }

  if (!donation.donor_id) {
    return { success: false, error: 'Match this donation to a donor before validating it.' };
  }
  let validationResult: EligibilityResult;
  try {
    validationResult = await syncDonationGiftAidValidation({
      orgId,
      donationId: params.donationId,
      userId: user.id,
    });
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to refresh Gift Aid validation.',
    };
  }

  if (!validationResult.eligible) {
    return {
      success: false,
      error:
        validationResult.summary ?? 'Donation failed Gift Aid validation.',
    };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'validate_gift_aid_donation',
    entityType: 'donation',
    entityId: params.donationId,
    metadata: {
      previousStatus: donation.gift_aid_status,
      nextStatus: validationResult.status,
      eligible: validationResult.eligible,
      summary: validationResult.summary,
      declarationId: validationResult.matchedDeclarationId,
    },
  });

  return { success: true, error: null };
}

export async function getGiftAidClaimBuilderData(params: {
  organisationId: string;
  startDate: string;
  endDate: string;
  donorId?: string | null;
  fundId?: string | null;
  incomeStreamId?: string | null;
  source?: string | null;
  onlyEligibleUnclaimed?: boolean;
  excludeAlreadyClaimed?: boolean;
  includeExceptions?: boolean;
}): Promise<{ data: GiftAidClaimBuilderData | null; error: string | null }> {
  const {
    organisationId,
    startDate,
    endDate,
    donorId,
    fundId,
    incomeStreamId,
    source,
    onlyEligibleUnclaimed = true,
    excludeAlreadyClaimed = true,
    includeExceptions = false,
  } = params;
  const supabase = await createClient();

  let query = supabase
    .from('donations')
    .select(`
      id,
      organisation_id,
      donation_date,
      amount_pence,
      donor_id,
      fund_id,
      income_stream_id,
      source,
      status,
      gift_aid_status,
      gift_aid_eligible,
      gift_aid_claim_id,
      gift_aid_claim_batch_id,
      matched_declaration_id,
      provider_reference,
      bank_transaction_id,
      donors(id, title, first_name, last_name, full_name, house_name_or_number, address, postcode),
      funds(id, name),
      income_streams(code, name),
      bank_lines(reference, description, reconciled)
    `)
    .eq('organisation_id', organisationId)
    .eq('status', 'posted')
    .gte('donation_date', startDate)
    .lte('donation_date', endDate);

  if (excludeAlreadyClaimed) {
    query = query.is('gift_aid_claim_id', null).is('gift_aid_claim_batch_id', null);
  }

  if (donorId) {
    query = query.eq('donor_id', donorId);
  }

  if (fundId) {
    query = query.eq('fund_id', fundId);
  }

  if (incomeStreamId) {
    query = query.eq('income_stream_id', incomeStreamId);
  }

  if (source) {
    query = query.eq('source', source);
  }

  const { data, error } = await query.order('donation_date', { ascending: true });

  if (error) {
    return { data: null, error: error.message };
  }

  const donorIds = Array.from(
    new Set(
      (data ?? [])
        .map((row) => row.donor_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  let declarationsByDonor: Map<string, QueueDeclaration[]>;
  try {
    declarationsByDonor = await loadDeclarationsByDonor({
      supabase,
      organisationId,
      donorIds,
    });
  } catch (loadError) {
    return {
      data: null,
      error:
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load Gift Aid declarations.',
    };
  }

  let alreadyClaimedQuery = supabase
    .from('donations')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', organisationId)
    .eq('status', 'posted')
    .not('gift_aid_claim_id', 'is', null)
    .gte('donation_date', startDate)
    .lte('donation_date', endDate);

  if (donorId) {
    alreadyClaimedQuery = alreadyClaimedQuery.eq('donor_id', donorId);
  }

  if (fundId) {
    alreadyClaimedQuery = alreadyClaimedQuery.eq('fund_id', fundId);
  }

  if (source) {
    alreadyClaimedQuery = alreadyClaimedQuery.eq('source', source);
  }

  const { count: alreadyClaimedCount, error: alreadyClaimedError } =
    await alreadyClaimedQuery;

  if (alreadyClaimedError) {
    return { data: null, error: alreadyClaimedError.message };
  }

  let duplicateGuardrails:
    | ReturnType<typeof evaluateGiftAidClaimSelectionGuardrails>
    | null = null;
  if ((data ?? []).length > 0) {
    try {
      const guardCandidates = await loadGiftAidClaimGuardCandidates({
        orgId: organisationId,
        donationIds: (data ?? []).map((row) => row.id),
      });
      duplicateGuardrails = evaluateGiftAidClaimSelectionGuardrails({
        selectedDonationIds: (data ?? []).map((row) => row.id),
        candidates: guardCandidates.candidates,
      });
    } catch {
      duplicateGuardrails = null;
    }
  }

  const rows: GiftAidClaimBuilderRow[] = [];
  let excludedRowsCount = 0;
  const duplicateWarningMessages = new Set<string>();
  let missingDonorDetailsCount = 0;
  let invalidDeclarationCount = 0;
  let outsideHmrcLimitCount = 0;
  const exceptions: GiftAidClaimBuilderExceptionRow[] = [];
  const { data: settings } = await supabase
    .from('organisation_settings')
    .select('gift_aid_requires_bank_transaction_link')
    .eq('organisation_id', organisationId)
    .maybeSingle();
  const requireBankTransactionLink = Boolean(
    settings?.gift_aid_requires_bank_transaction_link
  );
  const missingDonorDetailCodes = [
    'missing_first_name_or_initial',
    'missing_last_name',
    'missing_house_name_or_number',
    'missing_postcode',
  ] as const;
  const invalidDeclarationCodes = [
    'missing_declaration',
    'declaration_not_active_for_donation_date',
  ] as const;

  for (const row of (data ?? []) as ClaimDonationRawRow[]) {
    const evaluated = evaluateClaimDonation({
      row,
      declarationsByDonor,
    });
    const bankLine = getSingleRelation(row.bank_lines);
    const incomeStream = getSingleRelation(row.income_streams);
    const claimValidation = validateDonationForClaimBatch({
      donation: {
        id: row.id,
        donorId: row.donor_id,
        donorFullName: evaluated.donorRecord?.full_name ?? null,
        donorAddress: evaluated.donorRecord?.address ?? evaluated.donorRecord?.house_name_or_number ?? null,
        donorPostcode: evaluated.donorRecord?.postcode ?? null,
        donationDate: row.donation_date,
        amountPence: Number(row.amount_pence ?? 0),
        giftAidClaimId: row.gift_aid_claim_id,
        giftAidClaimBatchId: row.gift_aid_claim_batch_id ?? null,
        status: row.status ?? 'posted',
        bankTransactionId: row.bank_transaction_id,
        bankTransactionReconciled: bankLine?.reconciled ?? null,
      },
      declarations: (declarationsByDonor.get(row.donor_id ?? '') ?? []).map(
        (declaration) => ({
          id: declaration.id,
          donorId: declaration.donor_id,
          status: declaration.status ?? null,
          startDate: declaration.start_date,
          endDate: declaration.end_date,
        })
      ),
      requireBankTransactionLink,
    });
    const validationCodes = new Set(
      [
        ...evaluated.validation.issues.map((issue) => issue.code),
        ...claimValidation.issues.map((issue) => issue.code),
      ]
    );
    const outsideHmrcClaimTimeLimit = isDonationOutsideHmrcClaimTimeLimit({
      donationDate: row.donation_date,
    });

    if (missingDonorDetailCodes.some((code) => validationCodes.has(code))) {
      missingDonorDetailsCount += 1;
    }

    if (invalidDeclarationCodes.some((code) => validationCodes.has(code))) {
      invalidDeclarationCount += 1;
    }

    if (
      outsideHmrcClaimTimeLimit ||
      claimValidation.validationStatus === 'blocking' ||
      !evaluated.donorRecord ||
      evaluated.status.workflow_stage !== 'prepare_claim' ||
      !evaluated.matchedDeclaration ||
      !evaluated.hmrcPreview
    ) {
      excludedRowsCount += 1;
      if (outsideHmrcClaimTimeLimit) {
        outsideHmrcLimitCount += 1;
      }
      if (includeExceptions || !onlyEligibleUnclaimed) {
        exceptions.push({
          donation_id: row.id,
          donor_id: row.donor_id,
          donor_name: evaluated.donorRecord?.full_name ?? null,
          donation_date: row.donation_date,
          amount_pence: Number(row.amount_pence ?? 0),
          source: row.source,
          fund_name: evaluated.fund?.name ?? null,
          income_stream_label: incomeStream
            ? [incomeStream.code, incomeStream.name].filter(Boolean).join(' ')
            : null,
          bank_transaction_label:
            bankLine?.reference ?? bankLine?.description ?? row.bank_transaction_id ?? null,
          exception_codes: Array.from(
            new Set([
              ...claimValidation.issues.map((issue) => issue.code),
              ...evaluated.validation.issues.map((issue) => issue.code),
              ...(outsideHmrcClaimTimeLimit ? ['outside_hmrc_time_limit'] : []),
            ])
          ),
          exception_messages: [
            ...claimValidation.issues.map((issue) => issue.message),
            ...evaluated.validation.issues.map((issue) => issue.message),
            ...(outsideHmrcClaimTimeLimit
              ? ['Donation falls outside the HMRC Gift Aid claim time limit.']
              : []),
          ],
        });
      }
      continue;
    }

    const duplicate =
      duplicateGuardrails?.analysisByDonationId.get(row.id) ?? null;

    if (duplicate?.blockingError ?? duplicate?.warning) {
      duplicateWarningMessages.add(
        duplicate?.blockingError ?? duplicate?.warning ?? ''
      );
    }

    rows.push({
      donation_id: row.id,
      donor_id: evaluated.donor!.id,
      donor_name: evaluated.donor!.full_name,
      source: row.source,
      fund_id: row.fund_id ?? null,
      address: evaluated.donor!.address ?? '',
      postcode: evaluated.donor!.postcode ?? '',
      donation_date: row.donation_date,
      amount_pence: evaluated.amountPence,
      claimable_pence: calculateClaimablePence(evaluated.amountPence),
      fund_name: evaluated.fund?.name ?? null,
      declaration_id: evaluated.matchedDeclaration.id,
      declaration_date: evaluated.matchedDeclaration.declaration_date,
      hmrc_title: evaluated.hmrcPreview.title,
      hmrc_first_name_or_initial: evaluated.hmrcPreview.firstNameOrInitial,
      hmrc_last_name: evaluated.hmrcPreview.lastName,
      hmrc_house_name_or_number: evaluated.hmrcPreview.houseNameOrNumber,
      hmrc_postcode: evaluated.hmrcPreview.postcode,
      duplicate_fingerprint: duplicate?.fingerprint ?? null,
      duplicate_warning:
        duplicate?.blockingError ?? duplicate?.warning ?? null,
      duplicate_blocking:
        Boolean(duplicate?.claimedDuplicateDonationIds.length) ||
        Boolean(
          duplicate?.unclaimedDuplicateDonationIds.filter(
            (id) => id !== row.id
          ).length
        ),
      duplicate_related_donation_ids: duplicate?.duplicateDonationIds ?? [],
    });
  }

  return {
    data: {
      rows,
      exceptions,
      summary: {
        donation_count: rows.length,
        total_donation_amount_pence: rows.reduce(
          (sum, row) => sum + row.amount_pence,
          0
        ),
        estimated_gift_aid_pence: rows.reduce(
          (sum, row) => sum + row.claimable_pence,
          0
        ),
        excluded_rows_count: excludedRowsCount,
        validation_warning_count: buildGiftAidClaimBuilderWarnings({
          outsideHmrcLimitCount,
          alreadyClaimedCount: alreadyClaimedCount ?? 0,
          missingDonorDetailsCount,
          invalidDeclarationCount,
          eligibleDonationCount: rows.length,
          duplicateWarnings: Array.from(duplicateWarningMessages),
        }).length,
        warning_messages: buildGiftAidClaimBuilderWarnings({
          outsideHmrcLimitCount,
          alreadyClaimedCount: alreadyClaimedCount ?? 0,
          missingDonorDetailsCount,
          invalidDeclarationCount,
          eligibleDonationCount: rows.length,
          duplicateWarnings: Array.from(duplicateWarningMessages),
        }).slice(0, 5),
      },
    },
    error: null,
  };
}

export async function createGiftAidClaimBatchFromBuilder(params: {
  startDate: string;
  endDate: string;
  donorId?: string | null;
  fundId?: string | null;
  incomeStreamId?: string | null;
  source?: string | null;
  includeExceptions?: boolean;
  gasdsBatchIds?: string[];
}): Promise<{ data: { batchId: string } | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanExportGiftAid(role);
  } catch (e) {
    return {
      data: null,
      error: e instanceof PermissionError ? e.message : 'Permission denied.',
    };
  }

  if (isGiftAidClaimDateRangeInvalid({ startDate: params.startDate, endDate: params.endDate })) {
    return { data: null, error: 'Enter a valid claim date range before creating the batch.' };
  }

  const gasdsIds = Array.from(new Set(params.gasdsBatchIds ?? [])).filter(Boolean);
  const admin = createAdminClient();

  const { data: orgSettings } = await admin
    .from('organisation_settings')
    .select('gasds_require_bank_deposit_evidence, gasds_annual_cap_pence')
    .eq('organisation_id', orgId)
    .maybeSingle();

  const requireGasdsEvidence = Boolean(orgSettings?.gasds_require_bank_deposit_evidence);
  const gasdsCapPence = Number(orgSettings?.gasds_annual_cap_pence ?? 800_000);

  const builder = await getGiftAidClaimBuilderData({
    organisationId: orgId,
    startDate: params.startDate,
    endDate: params.endDate,
    donorId: params.donorId ?? null,
    fundId: params.fundId ?? null,
    incomeStreamId: params.incomeStreamId ?? null,
    source: params.source ?? null,
    onlyEligibleUnclaimed: true,
    excludeAlreadyClaimed: true,
    includeExceptions: params.includeExceptions ?? false,
  });

  if (builder.error || !builder.data) {
    return { data: null, error: builder.error ?? 'Unable to load claim builder data.' };
  }

  let gasdsBatches: Array<{
    id: string;
    batch_reference: string;
    collection_date: string;
    service_or_event_name: string;
    collection_method: string;
    eligible_amount_pence: number;
    linked_bank_transaction_id: string | null;
    evidence_storage_path: string | null;
    status: string;
    gift_aid_claim_batch_id: string | null;
    workspace_id: string;
  }> = [];

  if (gasdsIds.length > 0) {
    const { data: batches, error: gasdsError } = await admin
      .from('gift_aid_small_donation_batches')
      .select(
        'id, batch_reference, collection_date, service_or_event_name, collection_method, eligible_amount_pence, linked_bank_transaction_id, evidence_storage_path, status, gift_aid_claim_batch_id, workspace_id'
      )
      .in('id', gasdsIds)
      .eq('workspace_id', orgId);

    if (gasdsError) {
      return { data: null, error: gasdsError.message };
    }
    gasdsBatches = batches ?? [];
    if (gasdsBatches.length !== gasdsIds.length) {
      return { data: null, error: 'One or more GASDS batches were not found in this organisation.' };
    }
    for (const b of gasdsBatches) {
      if (b.status !== 'ready') {
        return {
          data: null,
          error: `GASDS batch ${b.batch_reference} is not in "ready" status.`,
        };
      }
      if (b.gift_aid_claim_batch_id) {
        return {
          data: null,
          error: `GASDS batch ${b.batch_reference} is already linked to a claim.`,
        };
      }
      if (requireGasdsEvidence && !b.linked_bank_transaction_id && !b.evidence_storage_path) {
        return {
          data: null,
          error: `GASDS batch ${b.batch_reference} needs a bank deposit link or uploaded evidence.`,
        };
      }
    }
  }

  const tyStart = ukTaxYearStartDate();
  const { data: claimedAgg } = await admin
    .from('gift_aid_claim_lines')
    .select('donation_amount_pence, gift_aid_claim_batches!claim_batch_id(status, submitted_at, claim_end)')
    .eq('workspace_id', orgId)
    .eq('claim_item_type', 'gasds');

  let claimedSoFarPence = 0;
  for (const row of claimedAgg ?? []) {
    const typed = row as unknown as {
      donation_amount_pence?: number;
      gift_aid_claim_batches?:
        | { status?: string | null; submitted_at?: string | null; claim_end?: string | null }
        | Array<{ status?: string | null; submitted_at?: string | null; claim_end?: string | null }>;
    };
    const rel = typed.gift_aid_claim_batches;
    const batch = Array.isArray(rel) ? rel[0] : rel;
    if (!batch) continue;
    const st = String(batch.status ?? '');
    if (!['exported', 'submitted', 'paid'].includes(st)) continue;
    const anchorRaw = batch.submitted_at ?? batch.claim_end;
    if (!anchorRaw) continue;
    if (new Date(String(anchorRaw)) < tyStart) continue;
    claimedSoFarPence += Number(typed.donation_amount_pence ?? 0);
  }

  const newGasdsEligible = gasdsBatches.reduce((s, b) => s + Number(b.eligible_amount_pence ?? 0), 0);
  const capWarning =
    claimedSoFarPence + newGasdsEligible > gasdsCapPence
      ? `Eligible GASDS for this charity may exceed the £${(gasdsCapPence / 100).toFixed(0)} annual cap when combined with submissions this tax year.`
      : null;

  if (builder.data.rows.length === 0 && gasdsBatches.length === 0) {
    return {
      data: null,
      error:
        'Add at least one eligible donation or a ready small-donation (GASDS) batch before creating the batch.',
    };
  }

  if (builder.data.rows.length > 0 && builder.data.rows.some((row) => row.duplicate_blocking)) {
    return { data: null, error: 'Resolve duplicate or already-claimed blockers before creating the batch.' };
  }

  const totalDonationPence =
    builder.data.rows.reduce((sum, row) => sum + row.amount_pence, 0) +
    gasdsBatches.reduce((sum, b) => sum + Number(b.eligible_amount_pence ?? 0), 0);

  const totalClaimPence =
    builder.data.rows.reduce((sum, row) => sum + row.claimable_pence, 0) +
    gasdsBatches.reduce((sum, b) => sum + gasdsClaimAmountPence(Number(b.eligible_amount_pence ?? 0)), 0);

  const donationCount = builder.data.rows.length + gasdsBatches.length;

  const { data: batch, error: batchError } = await admin
    .from('gift_aid_claim_batches')
    .insert({
      workspace_id: orgId,
      claim_start: params.startDate,
      claim_end: params.endDate,
      status: 'review',
      donation_count: donationCount,
      donation_total_pence: totalDonationPence,
      claim_total_pence: totalClaimPence,
      validation_run_at: new Date().toISOString(),
      validation_summary: {
        eligibleCount: donationCount,
        exceptionCount: builder.data.exceptions.length,
        warnings: [...builder.data.summary.warning_messages].concat(
          capWarning ? [`[GASDS] ${capWarning}`] : [],
          claimedSoFarPence > 0
            ? [`GASDS eligible already counted this tax year (submitted/exported batches): £${(claimedSoFarPence / 100).toFixed(2)}`]
            : []
        ),
        gasds: {
          capPence: gasdsCapPence,
          claimedEligiblePenceThisTaxYear: claimedSoFarPence,
          selectedBatchCount: gasdsBatches.length,
        },
      },
      created_by: user.id,
      updated_by: user.id,
    })
    .select('id')
    .single();

  if (batchError || !batch) {
    return { data: null, error: batchError?.message ?? 'Unable to create claim batch.' };
  }

  const standardLineRows = builder.data.rows.map((row) => ({
    workspace_id: orgId,
    claim_batch_id: batch.id,
    claim_item_type: 'standard_gift_aid' as const,
    gasds_batch_id: null as string | null,
    donation_id: row.donation_id,
    donor_id: row.donor_id,
    declaration_id: row.declaration_id,
    donation_date: row.donation_date,
    donation_amount_pence: row.amount_pence,
    claim_rate: 0.25,
    claim_amount_pence: row.claimable_pence,
    donor_name_snapshot: row.donor_name,
    donor_address_snapshot: row.address,
    donor_postcode_snapshot: row.postcode,
    donor_title_snapshot: row.hmrc_title,
    donor_first_name_or_initial_snapshot: row.hmrc_first_name_or_initial,
    donor_last_name_snapshot: row.hmrc_last_name,
    donor_house_name_or_number_snapshot: row.hmrc_house_name_or_number,
    status: 'included',
    validation_status: 'valid',
    validation_issues: [],
    original_snapshot: row,
  }));

  const gasdsLineRows = gasdsBatches.map((b) => ({
    workspace_id: orgId,
    claim_batch_id: batch.id,
    claim_item_type: CLAIM_ITEM_GASDS,
    gasds_batch_id: b.id,
    donation_id: null as string | null,
    donor_id: null as string | null,
    declaration_id: null as string | null,
    donation_date: b.collection_date,
    donation_amount_pence: Number(b.eligible_amount_pence),
    claim_rate: 0.25,
    claim_amount_pence: gasdsClaimAmountPence(Number(b.eligible_amount_pence)),
    ...gasdsClaimLineSnapshots({
      batch_reference: b.batch_reference,
      collection_date: b.collection_date,
      service_or_event_name: b.service_or_event_name,
    }),
    status: 'included',
    validation_status: 'valid',
    validation_issues: [] as Record<string, unknown>[],
    original_snapshot: b as unknown as Record<string, unknown>,
  }));

  const { error: linesError } = await admin.from('gift_aid_claim_lines').insert([
    ...standardLineRows,
    ...gasdsLineRows,
  ]);
  if (linesError) {
    await admin.from('gift_aid_claim_batches').delete().eq('id', batch.id);
    return { data: null, error: linesError.message };
  }

  if (builder.data.rows.length > 0) {
    const donationIds = builder.data.rows.map((row) => row.donation_id);
    await admin
      .from('donations')
      .update({
        gift_aid_claim_batch_id: batch.id,
        gift_aid_status: 'included_in_draft_claim',
        updated_by: user.id,
      })
      .in('id', donationIds)
      .eq('organisation_id', orgId);
  }

  if (gasdsBatches.length > 0) {
    await admin
      .from('gift_aid_small_donation_batches')
      .update({
        status: 'included_in_claim',
        gift_aid_claim_batch_id: batch.id,
        updated_by: user.id,
      })
      .in(
        'id',
        gasdsBatches.map((b) => b.id)
      );
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'gift_aid_batch_created',
    entityType: 'gift_aid_claim_batch',
    entityId: batch.id,
    metadata: {
      startDate: params.startDate,
      endDate: params.endDate,
      donationCount,
      giftAidStandardCount: builder.data.rows.length,
      giftAidGasdsBatchCount: gasdsBatches.length,
      totalDonationPence,
      totalClaimPence,
    },
  });

  if (builder.data.rows.length > 0) {
    await Promise.all(
      builder.data.rows.map((row) =>
        logAuditEvent({
          orgId,
          userId: user.id,
          action: 'gift_aid_donation_added',
          entityType: 'donation',
          entityId: row.donation_id,
          metadata: { batchId: batch.id },
        })
      )
    );
  }

  if (gasdsBatches.length > 0) {
    await Promise.all(
      gasdsBatches.map((b) =>
        logAuditEvent({
          orgId,
          userId: user.id,
          action: 'gasds_batch_included_in_claim',
          entityType: 'gift_aid_small_donation_batch',
          entityId: b.id,
          metadata: { batchId: batch.id },
        })
      )
    );
  }

  invalidateOrgReportCache(orgId);
  return { data: { batchId: batch.id }, error: null };
}

async function recalculateGiftAidClaimBatchTotals(params: {
  orgId: string;
  batchId: string;
  admin: ReturnType<typeof createAdminClient>;
  userId: string;
}) {
  const { data: lines } = await params.admin
    .from('gift_aid_claim_lines')
    .select('donation_amount_pence, claim_amount_pence')
    .eq('workspace_id', params.orgId)
    .eq('claim_batch_id', params.batchId)
    .neq('status', 'removed');

  const donationTotal = (lines ?? []).reduce(
    (sum, row) => sum + Number((row as { donation_amount_pence?: number }).donation_amount_pence ?? 0),
    0
  );
  const claimTotal = (lines ?? []).reduce(
    (sum, row) => sum + Number((row as { claim_amount_pence?: number }).claim_amount_pence ?? 0),
    0
  );

  await params.admin
    .from('gift_aid_claim_batches')
    .update({
      donation_count: (lines ?? []).length,
      donation_total_pence: donationTotal,
      claim_total_pence: claimTotal,
      updated_by: params.userId,
    })
    .eq('id', params.batchId)
    .eq('workspace_id', params.orgId);
}

export async function removeGiftAidClaimBatchItem(params: {
  batchId: string;
  claimLineId: string;
  reason: string;
}): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanExportGiftAid(role);
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const reason = params.reason.trim();
  if (!reason) return { success: false, error: 'A reason is required to remove a claim item.' };

  const supabase = await createClient();
  const { data: line, error: lineError } = await supabase
    .from('gift_aid_claim_lines')
    .select('id, donation_id, claim_item_type, gasds_batch_id')
    .eq('workspace_id', orgId)
    .eq('claim_batch_id', params.batchId)
    .eq('id', params.claimLineId)
    .maybeSingle();

  if (lineError || !line) {
    return { success: false, error: lineError?.message ?? 'Claim item not found.' };
  }

  const itemType =
    ((line as { claim_item_type?: string | null }).claim_item_type as string | undefined) ??
    'standard_gift_aid';
  const gasdsBatchId =
    ((line as { gasds_batch_id?: string | null }).gasds_batch_id as string | null) ?? null;

  const admin = createAdminClient();
  await admin
    .from('gift_aid_claim_lines')
    .update({
      status: 'removed',
      validation_status: 'blocking',
      validation_issues: [{ code: 'removed_by_admin', message: reason }],
      edited_by: user.id,
      edited_at: new Date().toISOString(),
    })
    .eq('id', params.claimLineId);

  const donationId = (line as { donation_id?: string | null }).donation_id;

  if (itemType !== CLAIM_ITEM_GASDS && donationId) {
    await admin
      .from('donations')
      .update({
        gift_aid_claim_batch_id: null,
        gift_aid_status: 'eligible',
        updated_by: user.id,
      })
      .eq('id', donationId)
      .eq('organisation_id', orgId);

    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'gift_aid_donation_removed',
      entityType: 'donation',
      entityId: donationId,
      metadata: { batchId: params.batchId, claimLineId: params.claimLineId, reason },
    });
  } else if (itemType === CLAIM_ITEM_GASDS && gasdsBatchId) {
    await admin
      .from('gift_aid_small_donation_batches')
      .update({
        status: 'ready',
        gift_aid_claim_batch_id: null,
        updated_by: user.id,
      })
      .eq('id', gasdsBatchId)
      .eq('workspace_id', orgId);

    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'gasds_batch_removed_from_claim',
      entityType: 'gift_aid_small_donation_batch',
      entityId: gasdsBatchId,
      metadata: { batchId: params.batchId, claimLineId: params.claimLineId, reason },
    });
  }

  await recalculateGiftAidClaimBatchTotals({
    orgId,
    batchId: params.batchId,
    admin,
    userId: user.id,
  });

  invalidateOrgReportCache(orgId);
  return { success: true, error: null };
}

export async function listGiftAidSmallDonationBatches(): Promise<{
  data: GiftAidControlGasdsBatchRow[] | null;
  error: string | null;
}> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('gift_aid_small_donation_batches')
    .select(
      'id, batch_reference, collection_date, service_or_event_name, collection_method, eligible_amount_pence, total_collected_pence, status, gift_aid_claim_batch_id'
    )
    .eq('workspace_id', orgId)
    .order('collection_date', { ascending: false })
    .limit(200);

  if (error) return { data: null, error: error.message };

  const rows: GiftAidControlGasdsBatchRow[] = (data ?? []).map((row) => ({
    id: row.id,
    batch_reference: row.batch_reference,
    collection_date: row.collection_date,
    service_or_event_name: row.service_or_event_name,
    collection_method: row.collection_method,
    eligible_amount_pence: Number(row.eligible_amount_pence),
    total_collected_pence: Number(row.total_collected_pence),
    status: row.status,
    plain_status: plainGasdsBatchStatusLabel(row.status),
    gift_aid_claim_batch_id: row.gift_aid_claim_batch_id,
  }));

  return { data: rows, error: null };
}

export async function listReadyGasdsBatchesForClaimBuilder(): Promise<{
  data: GiftAidClaimBuilderGasdsOption[] | null;
  error: string | null;
}> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('gift_aid_small_donation_batches')
    .select(
      'id, batch_reference, collection_date, service_or_event_name, collection_method, eligible_amount_pence'
    )
    .eq('workspace_id', orgId)
    .eq('status', 'ready')
    .is('gift_aid_claim_batch_id', null)
    .order('collection_date', { ascending: true });

  if (error) return { data: null, error: error.message };

  const rows =
    (data ?? []).map((row) => ({
      id: row.id,
      batch_reference: row.batch_reference,
      collection_date: row.collection_date,
      service_or_event_name: row.service_or_event_name,
      collection_method: row.collection_method,
      eligible_amount_pence: Number(row.eligible_amount_pence),
      claimable_pence: gasdsClaimAmountPence(Number(row.eligible_amount_pence)),
    })) ?? [];

  return { data: rows, error: null };
}

export async function createGiftAidSmallDonationBatch(params: {
  batch_reference: string;
  collection_date: string;
  service_or_event_name: string;
  location_name?: string | null;
  community_building_id?: string | null;
  collection_method: 'cash' | 'contactless';
  total_collected_pence: number;
  eligible_amount_pence: number;
  excluded_amount_pence?: number;
  exclusion_reason?: string | null;
  linked_bank_transaction_id?: string | null;
  notes?: string | null;
  evidence_storage_path?: string | null;
  status?: 'draft' | 'ready';
}): Promise<{ data: { id: string } | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanExportGiftAid(role);
  } catch (e) {
    return {
      data: null,
      error: e instanceof PermissionError ? e.message : 'Permission denied.',
    };
  }

  const ref = params.batch_reference.trim();
  if (!ref) return { data: null, error: 'Batch reference is required.' };

  const total = Number(params.total_collected_pence);
  const eligible = Number(params.eligible_amount_pence);
  const excluded = Number(params.excluded_amount_pence ?? 0);

  if (!Number.isFinite(total) || total <= 0)
    return { data: null, error: 'Total collected must be positive.' };
  if (!Number.isFinite(eligible) || eligible < 0)
    return { data: null, error: 'Eligible amount cannot be negative.' };
  if (eligible + excluded > total) {
    return { data: null, error: 'Eligible plus excluded amounts cannot exceed the total collected.' };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('gift_aid_small_donation_batches')
    .insert({
      workspace_id: orgId,
      batch_reference: ref,
      collection_date: params.collection_date,
      service_or_event_name: params.service_or_event_name.trim(),
      location_name: params.location_name?.trim() || null,
      community_building_id: params.community_building_id ?? null,
      collection_method: params.collection_method,
      total_collected_pence: total,
      eligible_amount_pence: eligible,
      excluded_amount_pence: excluded,
      exclusion_reason: params.exclusion_reason?.trim() || null,
      linked_bank_transaction_id: params.linked_bank_transaction_id ?? null,
      evidence_storage_path: params.evidence_storage_path ?? null,
      notes: params.notes?.trim() || null,
      status: params.status ?? 'draft',
      created_by: user.id,
      updated_by: user.id,
    })
    .select('id')
    .single();

  if (error || !data) return { data: null, error: error?.message ?? 'Unable to save GASDS batch.' };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'gasds_small_donation_batch_created',
    entityType: 'gift_aid_small_donation_batch',
    entityId: data.id,
    metadata: { batchReference: ref },
  });

  invalidateOrgReportCache(orgId);
  return { data: { id: data.id }, error: null };
}

export async function editGiftAidClaimBatchItem(params: {
  batchId: string;
  claimLineId: string;
  fieldName: string;
  editedValue: string | number | null;
  reason: string;
}): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanExportGiftAid(role);
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const editableFields = new Set([
    'donation_amount_pence',
    'donation_date',
    'claim_amount_pence',
    'donor_name_snapshot',
    'donor_address_snapshot',
    'donor_postcode_snapshot',
    'donor_title_snapshot',
    'donor_first_name_or_initial_snapshot',
    'donor_last_name_snapshot',
    'donor_house_name_or_number_snapshot',
  ]);
  if (!editableFields.has(params.fieldName)) {
    return { success: false, error: 'This claim item field cannot be manually edited.' };
  }

  const supabase = await createClient();
  const { data: line, error: lineError } = await supabase
    .from('gift_aid_claim_lines')
    .select('*')
    .eq('workspace_id', orgId)
    .eq('claim_batch_id', params.batchId)
    .eq('id', params.claimLineId)
    .maybeSingle();

  if (lineError || !line) {
    return { success: false, error: lineError?.message ?? 'Claim item not found.' };
  }

  const originalValue = (line as Record<string, unknown>)[params.fieldName];
  const manualEdit = buildManualClaimLineEdit({
    fieldName: params.fieldName,
    originalValue,
    editedValue: params.editedValue,
    reason: params.reason,
  });
  if (!manualEdit.valid || !manualEdit.edit) {
    return { success: false, error: manualEdit.error };
  }

  const patch: Record<string, unknown> = {
    [params.fieldName]: params.editedValue,
    manual_edit_reason: manualEdit.edit.reason,
    edited_by: user.id,
    edited_at: new Date().toISOString(),
    original_snapshot: line,
    edited_snapshot: {
      ...line,
      [params.fieldName]: params.editedValue,
    },
  };
  if (params.fieldName === 'donation_amount_pence' && typeof params.editedValue === 'number') {
    patch.claim_amount_pence = calculateClaimablePence(params.editedValue);
  }

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from('gift_aid_claim_lines')
    .update(patch)
    .eq('id', params.claimLineId);

  if (updateError) return { success: false, error: updateError.message };

  await admin.from('gift_aid_claim_line_edits').insert({
    workspace_id: orgId,
    claim_batch_id: params.batchId,
    claim_line_id: params.claimLineId,
    field_name: params.fieldName,
    original_value: originalValue,
    edited_value: params.editedValue,
    reason: manualEdit.edit.reason,
    edited_by: user.id,
  });

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'gift_aid_manual_edit',
    entityType: 'gift_aid_claim_line',
    entityId: params.claimLineId,
    metadata: {
      batchId: params.batchId,
      fieldName: params.fieldName,
      originalValue,
      editedValue: params.editedValue,
      reason: manualEdit.edit.reason,
    },
  });

  return { success: true, error: null };
}

export async function approveGiftAidClaimBatch(params: {
  batchId: string;
}): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanExportGiftAid(role);
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from('gift_aid_claim_lines')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', orgId)
    .eq('claim_batch_id', params.batchId)
    .eq('validation_status', 'blocking')
    .neq('status', 'removed');

  if (countError) return { success: false, error: countError.message };
  if ((count ?? 0) > 0) {
    return { success: false, error: 'Resolve blocking Gift Aid exceptions before approving this batch.' };
  }

  const { error } = await supabase
    .from('gift_aid_claim_batches')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: user.id,
      updated_by: user.id,
    })
    .eq('id', params.batchId)
    .eq('workspace_id', orgId)
    .in('status', ['draft', 'review']);

  if (error) return { success: false, error: error.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'gift_aid_batch_approved',
    entityType: 'gift_aid_claim_batch',
    entityId: params.batchId,
  });

  return { success: true, error: null };
}

export async function voidGiftAidClaimBatch(params: {
  batchId: string;
  reason: string;
}): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanExportGiftAid(role);
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const reason = params.reason.trim();
  if (!reason) return { success: false, error: 'A reason is required to void a batch.' };

  const admin = createAdminClient();
  const { data: lines } = await admin
    .from('gift_aid_claim_lines')
    .select('donation_id')
    .eq('workspace_id', orgId)
    .eq('claim_batch_id', params.batchId);

  await admin
    .from('gift_aid_claim_batches')
    .update({
      status: 'voided',
      voided_at: new Date().toISOString(),
      notes: reason,
      updated_by: user.id,
    })
    .eq('id', params.batchId)
    .eq('workspace_id', orgId);

  const donationIds = (lines ?? []).map((line) => line.donation_id);
  if (donationIds.length > 0) {
    await admin
      .from('donations')
      .update({
        gift_aid_claim_batch_id: null,
        gift_aid_status: 'eligible',
        updated_by: user.id,
      })
      .in('id', donationIds)
      .eq('organisation_id', orgId)
      .eq('gift_aid_claim_batch_id', params.batchId);
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'gift_aid_batch_voided',
    entityType: 'gift_aid_claim_batch',
    entityId: params.batchId,
    metadata: { reason },
  });

  invalidateOrgReportCache(orgId);
  return { success: true, error: null };
}

export async function listGiftAidClaimBuilderSources(params: {
  organisationId: string;
  startDate: string;
  endDate: string;
}): Promise<{ data: string[]; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('donations')
    .select('source')
    .eq('organisation_id', params.organisationId)
    .eq('status', 'posted')
    .is('gift_aid_claim_id', null)
    .gte('donation_date', params.startDate)
    .lte('donation_date', params.endDate)
    .order('source', { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return {
    data: Array.from(
      new Set(
        (data ?? [])
          .map((row) => row.source?.trim())
          .filter((value): value is string => Boolean(value))
      )
    ),
    error: null,
  };
}

/* ================================================================== */
/*  DECLARATION MANAGEMENT                                             */
/* ================================================================== */

type DeclarationWriteParams = {
  donorId: string;
  declarationType?: string;
  status?: GiftAidDeclarationStatus;
  startDate: string;
  endDate: string | null;
  declarationDate: string;
  signedDate?: string;
  donationAmountPence?: number | null;
  charityName?: string;
  donorTitle?: string;
  donorFirstNameOrInitial?: string;
  donorSurname?: string;
  donorFullHomeAddress?: string;
  donorPostcode?: string;
  taxpayerConfirmation?: boolean;
  declarationWording?: string;
  donorNotificationNotes?: string;
  coversPastDonations?: boolean;
  hmrcVersion?: string | null;
  templateVersion?: string | null;
  attachmentUrl?: string | null;
  notes?: string | null;
  /** When true, persist identity fields on the donor row (same org) before saving the declaration. */
  updateDonorProfile?: boolean;
};

function declarationInputStringOrUndefined(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const t = value.trim();
  return t === '' ? undefined : t;
}

function buildDeclarationFormData(
  params: DeclarationWriteParams
): GiftAidDeclarationFormData {
  return giftAidDeclarationFormSchema.parse({
    donorId: params.donorId,
    declarationType: params.declarationType ?? 'single',
    status: params.status ?? 'draft',
    startDate: params.startDate,
    endDate: params.endDate,
    declarationDate: params.declarationDate,
    signedDate: params.signedDate ?? params.declarationDate,
    donationAmountPence: params.donationAmountPence ?? null,
    charityName: params.charityName,
    donorTitle: params.donorTitle,
    donorFirstNameOrInitial: params.donorFirstNameOrInitial,
    donorSurname: params.donorSurname,
    donorFullHomeAddress: params.donorFullHomeAddress,
    donorPostcode: params.donorPostcode,
    taxpayerConfirmation: params.taxpayerConfirmation,
    declarationWording:
      params.declarationWording ?? GIFT_AID_DECLARATION_WORDING,
    donorNotificationNotes:
      params.donorNotificationNotes ?? GIFT_AID_DONOR_NOTIFICATION_NOTES,
    coversPastDonations: params.coversPastDonations ?? false,
    hmrcVersion: params.hmrcVersion,
    templateVersion: params.templateVersion,
    attachmentUrl: params.attachmentUrl,
    notes: params.notes,
  });
}

function declarationDbFields(form: GiftAidDeclarationFormData, userId: string | null) {
  return {
    donor_id: form.donorId,
    declaration_type: form.declarationType,
    status: form.status,
    start_date: form.startDate,
    end_date: form.endDate || null,
    is_active: form.status === 'active',
    declaration_date: form.declarationDate,
    signed_date: form.signedDate,
    donation_amount_pence: form.donationAmountPence ?? null,
    charity_name: form.charityName,
    donor_title_snapshot: form.donorTitle,
    donor_first_name_or_initial_snapshot: form.donorFirstNameOrInitial,
    donor_surname_snapshot: form.donorSurname,
    donor_full_home_address_snapshot: form.donorFullHomeAddress,
    donor_postcode_snapshot: form.donorPostcode,
    taxpayer_confirmation: form.taxpayerConfirmation,
    declaration_wording: form.declarationWording,
    donor_notification_notes: form.donorNotificationNotes,
    covers_past_donations: form.coversPastDonations,
    hmrc_version: form.hmrcVersion,
    template_version: form.templateVersion,
    attachment_url: form.attachmentUrl,
    notes: form.notes,
    updated_by: userId,
  };
}

async function createGiftAidSignedUrl(path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from('gift-aid')
    .createSignedUrl(path, 60 * 30);
  if (error) return null;
  return data.signedUrl;
}

function buildSelfServiceDeclarationUrl(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return `${baseUrl.replace(/\/$/, '')}/gift-aid/declaration/${token}`;
}

function normalizeIpAddress(value: string | null) {
  const first = value?.split(',')[0]?.trim();
  if (!first) return null;
  return /^[0-9a-fA-F:.]+$/.test(first) ? first : null;
}

async function logSelfServiceAuditEvent(params: {
  orgId: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  await admin.from('audit_log').insert({
    organisation_id: params.orgId,
    user_id: params.userId,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    metadata: params.metadata ?? {},
  });
}

async function withDeclarationDefaults(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  input: DeclarationWriteParams;
}): Promise<DeclarationWriteParams> {
  const [{ data: donor, error: donorError }, { data: org }] = await Promise.all([
    params.supabase
      .from('donors')
      .select('id, title, first_name, last_name, full_name, house_name_or_number, address, postcode')
      .eq('organisation_id', params.orgId)
      .eq('id', params.input.donorId)
      .single(),
    params.supabase
      .from('organisations')
      .select('name')
      .eq('id', params.orgId)
      .single(),
  ]);

  if (donorError || !donor) {
    throw new Error('Donor not found for this organisation.');
  }

  const nameTokens = donor.full_name?.trim().split(/\s+/).filter(Boolean) ?? [];
  const fallbackFirst =
    nameTokens.length >= 2 ? nameTokens[0] : undefined;
  const fallbackSurname =
    nameTokens.length >= 2 ? nameTokens[nameTokens.length - 1] : undefined;
  const fullAddress = [donor.house_name_or_number, donor.address]
    .filter(Boolean)
    .join(', ')
    .trim();

  const in_ = params.input;
  return {
    ...in_,
    declarationType: in_.declarationType ?? 'single',
    charityName:
      declarationInputStringOrUndefined(in_.charityName) ?? org?.name?.trim() ?? undefined,
    donorTitle:
      declarationInputStringOrUndefined(in_.donorTitle) ?? donor.title?.trim() ?? undefined,
    donorFirstNameOrInitial:
      declarationInputStringOrUndefined(in_.donorFirstNameOrInitial) ??
      donor.first_name?.trim() ??
      fallbackFirst,
    donorSurname:
      declarationInputStringOrUndefined(in_.donorSurname) ??
      donor.last_name?.trim() ??
      fallbackSurname,
    donorFullHomeAddress:
      declarationInputStringOrUndefined(in_.donorFullHomeAddress) ??
      (fullAddress || undefined),
    donorPostcode:
      declarationInputStringOrUndefined(in_.donorPostcode) ?? donor.postcode?.trim() ?? undefined,
    taxpayerConfirmation: in_.taxpayerConfirmation ?? true,
    declarationWording:
      in_.declarationWording ?? GIFT_AID_DECLARATION_WORDING,
    donorNotificationNotes:
      in_.donorNotificationNotes ?? GIFT_AID_DONOR_NOTIFICATION_NOTES,
  };
}

async function syncDonorProfileFromGiftAidDeclaration(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  userId: string;
  form: GiftAidDeclarationFormData;
}): Promise<{ error: string | null; updated: boolean }> {
  const { data: existing, error: fetchError } = await params.supabase
    .from('donors')
    .select('id, full_name, title, first_name, last_name, address, postcode, house_name_or_number')
    .eq('organisation_id', params.orgId)
    .eq('id', params.form.donorId)
    .maybeSingle();

  if (fetchError || !existing) {
    return { error: fetchError?.message ?? 'Donor not found for this organisation.', updated: false };
  }

  const fullName = [params.form.donorFirstNameOrInitial, params.form.donorSurname]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ')
    .trim();

  const patch = {
    title: params.form.donorTitle.trim() || null,
    first_name: params.form.donorFirstNameOrInitial.trim() || null,
    last_name: params.form.donorSurname.trim() || null,
    full_name: fullName || existing.full_name,
    display_name: fullName || existing.full_name,
    house_name_or_number: null,
    address: params.form.donorFullHomeAddress.trim(),
    postcode: params.form.donorPostcode.trim() || null,
    updated_by: params.userId,
  };

  const unchanged =
    (existing.title?.trim() || '') === (patch.title?.trim() || '') &&
    (existing.first_name?.trim() || '') === (patch.first_name?.trim() || '') &&
    (existing.last_name?.trim() || '') === (patch.last_name?.trim() || '') &&
    (existing.full_name?.trim() || '') === (patch.full_name?.trim() || '') &&
    (existing.address?.trim() || '') === (patch.address?.trim() || '') &&
    (existing.postcode?.trim() || '') === (patch.postcode?.trim() || '');

  if (unchanged) {
    return { error: null, updated: false };
  }

  const { error } = await params.supabase
    .from('donors')
    .update(patch)
    .eq('organisation_id', params.orgId)
    .eq('id', params.form.donorId);

  if (error) {
    return { error: error.message, updated: false };
  }

  return { error: null, updated: true };
}

export async function listGiftAidDeclarationLinks(params: {
  donorId?: string | null;
  declarationId?: string | null;
}): Promise<{ data: GiftAidDeclarationLinkAdminData | null; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();
  let query = supabase
    .from('gift_aid_declaration_links')
    .select(`
      id,
      workspace_id,
      donor_id,
      declaration_id,
      status,
      expires_at,
      created_by,
      used_at,
      revoked_at,
      created_at,
      updated_at,
      donors(full_name, email),
      gift_aid_declarations(status, generated_pdf_storage_path, generated_pdf_path)
    `)
    .eq('workspace_id', orgId)
    .order('created_at', { ascending: false });

  if (params.donorId) query = query.eq('donor_id', params.donorId);
  if (params.declarationId) query = query.eq('declaration_id', params.declarationId);

  const { data, error } = await query;
  if (error) return { data: null, error: error.message };

  const rows = await Promise.all((data ?? []).map(async (row) => {
    const donor = Array.isArray(row.donors) ? row.donors[0] ?? null : row.donors;
    const declaration = Array.isArray(row.gift_aid_declarations)
      ? row.gift_aid_declarations[0] ?? null
      : row.gift_aid_declarations;
    const effectiveStatus = getDeclarationLinkStatus({
      status: row.status,
      expiresAt: row.expires_at,
    });
    return {
      id: row.id,
      workspace_id: row.workspace_id,
      donor_id: row.donor_id,
      declaration_id: row.declaration_id,
      status: effectiveStatus,
      expires_at: row.expires_at,
      created_by: row.created_by,
      used_at: row.used_at,
      revoked_at: row.revoked_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      donor_name: donor?.full_name ?? null,
      donor_email: donor?.email ?? null,
      declaration_status: declaration?.status ?? null,
      declaration_pdf_download_url: await createGiftAidSignedUrl(
        declaration?.generated_pdf_path ??
          declaration?.generated_pdf_storage_path ??
          null
      ),
    };
  }));

  return { data: { links: rows }, error: null };
}

export async function generateGiftAidDeclarationLink(params: {
  donorId?: string | null;
  declarationId?: string | null;
  expiresInDays?: number;
}): Promise<{
  data: { id: string; token: string; url: string; expiresAt: string } | null;
  error: string | null;
}> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'gift_aid'); }
  catch (e) { return { data: null, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  if (!params.donorId && !params.declarationId) {
    return { data: null, error: 'Select a donor or declaration before generating a link.' };
  }

  const supabase = await createClient();
  let donorId = params.donorId ?? null;
  if (params.declarationId && !donorId) {
    const { data: declaration, error } = await supabase
      .from('gift_aid_declarations')
      .select('donor_id')
      .eq('organisation_id', orgId)
      .eq('id', params.declarationId)
      .single();
    if (error || !declaration) {
      return { data: null, error: error?.message ?? 'Declaration not found.' };
    }
    donorId = declaration.donor_id;
  }

  if (donorId) {
    const { data: donor, error } = await supabase
      .from('donors')
      .select('id')
      .eq('organisation_id', orgId)
      .eq('id', donorId)
      .single();
    if (error || !donor) {
      return { data: null, error: error?.message ?? 'Donor not found.' };
    }
  }

  const token = generateDeclarationLinkToken();
  const expiresAt = buildDeclarationLinkExpiry(
    params.expiresInDays ?? DEFAULT_DECLARATION_LINK_EXPIRY_DAYS
  );
  const { data: link, error } = await supabase
    .from('gift_aid_declaration_links')
    .insert({
      workspace_id: orgId,
      donor_id: donorId,
      declaration_id: params.declarationId ?? null,
      token_hash: hashDeclarationLinkToken(token),
      status: 'active',
      expires_at: expiresAt.toISOString(),
      created_by: user.id,
    })
    .select('id, expires_at')
    .single();

  if (error || !link) {
    return { data: null, error: error?.message ?? 'Unable to generate declaration link.' };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'gift_aid_declaration_link_generated',
    entityType: 'gift_aid_declaration_link',
    entityId: link.id,
    metadata: { donorId, declarationId: params.declarationId ?? null },
  });

  return {
    data: {
      id: link.id,
      token,
      url: buildSelfServiceDeclarationUrl(token),
      expiresAt: link.expires_at,
    },
    error: null,
  };
}

export async function revokeGiftAidDeclarationLink(
  linkId: string
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'gift_aid'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();
  const { error } = await supabase
    .from('gift_aid_declaration_links')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
      revoked_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('workspace_id', orgId)
    .eq('id', linkId)
    .eq('status', 'active');

  if (error) return { success: false, error: error.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'gift_aid_declaration_link_revoked',
    entityType: 'gift_aid_declaration_link',
    entityId: linkId,
  });

  return { success: true, error: null };
}

export async function regenerateGiftAidDeclarationLink(
  linkId: string
): Promise<{
  data: { id: string; token: string; url: string; expiresAt: string } | null;
  error: string | null;
}> {
  await assertWriteAllowed();
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();
  const { data: existing, error } = await supabase
    .from('gift_aid_declaration_links')
    .select('id, donor_id, declaration_id')
    .eq('workspace_id', orgId)
    .eq('id', linkId)
    .single();
  if (error || !existing) {
    return { data: null, error: error?.message ?? 'Declaration link not found.' };
  }
  await revokeGiftAidDeclarationLink(linkId);
  return generateGiftAidDeclarationLink({
    donorId: existing.donor_id,
    declarationId: existing.declaration_id,
  });
}

export async function sendGiftAidDeclarationLinkByEmail(
  linkId: string
): Promise<{ success: boolean; error: string | null }> {
  void linkId;
  return {
    success: false,
    error:
      'No email provider is configured for Gift Aid declaration links. Copy the secure link and send it manually.',
  };
}

async function loadSelfServiceLinkByToken(token: string) {
  const admin = createAdminClient();
  const tokenHash = hashDeclarationLinkToken(token);
  const { data: link, error } = await admin
    .from('gift_aid_declaration_links')
    .select('id, workspace_id, donor_id, declaration_id, token_hash, status, expires_at, created_by, used_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!link) throw new Error('Declaration link not found.');

  const status = getDeclarationLinkStatus({
    status: link.status,
    expiresAt: link.expires_at,
  });
  if (status === 'expired' && link.status === 'active') {
    await admin
      .from('gift_aid_declaration_links')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', link.id);
  }

  return { link, status };
}

export async function getSelfServiceGiftAidDeclarationPreview(
  token: string
): Promise<{ data: GiftAidDeclarationLinkPreview | null; error: string | null }> {
  if (!token) return { data: null, error: 'Declaration link token is required.' };
  const admin = createAdminClient();
  try {
    const { link, status } = await loadSelfServiceLinkByToken(token);
    if (status !== 'active') {
      return { data: null, error: `This declaration link is ${status}.` };
    }

    const [{ data: org }, { data: donor }, { data: declaration }] = await Promise.all([
      admin.from('organisations').select('name').eq('id', link.workspace_id).single(),
      link.donor_id
        ? admin
            .from('donors')
            .select('title, first_name, last_name, full_name, house_name_or_number, address, postcode, email')
            .eq('organisation_id', link.workspace_id)
            .eq('id', link.donor_id)
            .single()
        : Promise.resolve({ data: null }),
      link.declaration_id
        ? admin
            .from('gift_aid_declarations')
            .select('declaration_wording, donor_notification_notes')
            .eq('organisation_id', link.workspace_id)
            .eq('id', link.declaration_id)
            .single()
        : Promise.resolve({ data: null }),
    ]);

    const wording = buildSelfServiceDeclarationWording();
    return {
      data: {
        token,
        link_id: link.id,
        status,
        expires_at: link.expires_at,
        charity_name: org?.name ?? 'Church',
        declaration_wording:
          declaration?.declaration_wording ?? wording.declarationWording,
        donor_notification_notes:
          declaration?.donor_notification_notes ?? wording.donorNotificationNotes,
        donor: donor
          ? {
              title: donor.title ?? null,
              first_name: donor.first_name ?? null,
              last_name: donor.last_name ?? null,
              full_name: donor.full_name ?? null,
              house_name_or_number: donor.house_name_or_number ?? null,
              address: donor.address ?? null,
              postcode: donor.postcode ?? null,
              email: donor.email ?? null,
            }
          : null,
      },
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to load declaration link.',
    };
  }
}

export async function submitSelfServiceGiftAidDeclaration(
  input: SelfServiceDeclarationSubmissionInput
): Promise<{ success: boolean; declarationId: string | null; error: string | null }> {
  const admin = createAdminClient();
  let parsed;
  try {
    parsed = parseSelfServiceDeclarationSubmission(input);
  } catch (error) {
    return { success: false, declarationId: null, error: formatSelfServiceDeclarationError(error) };
  }

  try {
    const { link, status } = await loadSelfServiceLinkByToken(parsed.token);
    if (status !== 'active') {
      return { success: false, declarationId: null, error: `This declaration link is ${status}.` };
    }

    const existingDeclaration = link.declaration_id
      ? await admin
          .from('gift_aid_declarations')
          .select('id, donor_id')
          .eq('organisation_id', link.workspace_id)
          .eq('id', link.declaration_id)
          .single()
      : { data: null, error: null };
    if (existingDeclaration.error) {
      throw new Error(existingDeclaration.error.message);
    }

    const donorId = link.donor_id ?? existingDeclaration.data?.donor_id ?? null;
    if (!donorId) {
      throw new Error('This declaration link is not connected to a donor.');
    }

    const { data: org, error: orgError } = await admin
      .from('organisations')
      .select('name')
      .eq('id', link.workspace_id)
      .single();
    if (orgError) throw new Error(orgError.message);

    const submittedAt = new Date();
    const scope = scopeToDeclarationFields({
      scope: parsed.declarationScope,
      submittedAt,
    });
    const wording = buildSelfServiceDeclarationWording();
    const donationAmountPence =
      parsed.declarationScope === 'single'
        ? poundsToPence(parsed.donationAmount ?? '')
        : null;
    const fullName = `${parsed.firstNameOrInitial} ${parsed.surname}`.trim();

    await admin
      .from('donors')
      .update({
        title: parsed.title,
        first_name: parsed.firstNameOrInitial,
        last_name: parsed.surname,
        full_name: fullName,
        display_name: fullName,
        address: parsed.fullHomeAddress,
        postcode: parsed.postcode,
        email: parsed.email,
        updated_at: submittedAt.toISOString(),
      })
      .eq('organisation_id', link.workspace_id)
      .eq('id', donorId);

    const form = buildDeclarationFormData({
      donorId,
      declarationType: scope.declarationType,
      status: 'active',
      startDate: scope.startDate,
      endDate: scope.endDate,
      declarationDate: submittedAt.toISOString().slice(0, 10),
      signedDate: submittedAt.toISOString().slice(0, 10),
      donationAmountPence,
      charityName: org?.name ?? 'Church',
      donorTitle: parsed.title,
      donorFirstNameOrInitial: parsed.firstNameOrInitial,
      donorSurname: parsed.surname,
      donorFullHomeAddress: parsed.fullHomeAddress,
      donorPostcode: parsed.postcode,
      taxpayerConfirmation: true,
      declarationWording: wording.declarationWording,
      donorNotificationNotes: wording.donorNotificationNotes,
      coversPastDonations: scope.coversPastDonations,
      hmrcVersion: 'HMRC self-service declaration',
      templateVersion: wording.textVersion,
      attachmentUrl: null,
      notes: 'Submitted by donor self-service link.',
    });

    const headerStore = await headers();
    const submittedIp = normalizeIpAddress(
      headerStore.get('x-forwarded-for') ?? headerStore.get('x-real-ip')
    );
    const submittedUserAgent = headerStore.get('user-agent');

    const declarationPatch = {
      organisation_id: link.workspace_id,
      ...declarationDbFields(form, null),
      status: 'active',
      is_active: true,
      e_signature_name: parsed.eSignatureName,
      declaration_text_version: SELF_SERVICE_DECLARATION_TEXT_VERSION,
      submitted_ip: submittedIp,
      submitted_user_agent: submittedUserAgent,
      self_service_link_id: link.id,
    };

    const declarationResult = link.declaration_id
      ? await admin
          .from('gift_aid_declarations')
          .update(declarationPatch)
          .eq('organisation_id', link.workspace_id)
          .eq('id', link.declaration_id)
          .select('id')
          .single()
      : await admin
          .from('gift_aid_declarations')
          .insert({
            ...declarationPatch,
            donor_id: donorId,
            created_by: null,
          })
          .select('id')
          .single();

    if (declarationResult.error || !declarationResult.data) {
      throw new Error(declarationResult.error?.message ?? 'Unable to save declaration.');
    }

    const declarationId = declarationResult.data.id;
    const pdfBuffer = await renderGiftAidDeclarationPdf(form, {
      eSignatureName: parsed.eSignatureName,
      submittedAt: submittedAt.toISOString(),
      textVersion: SELF_SERVICE_DECLARATION_TEXT_VERSION,
    });
    const storagePath = `${link.workspace_id}/declarations/${declarationId}/self-service-${submittedAt.getTime()}.pdf`;
    const checksum = createHash('sha256').update(pdfBuffer).digest('hex');
    const { error: uploadError } = await admin.storage
      .from('gift-aid')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });
    if (uploadError) throw new Error(uploadError.message);

    await admin
      .from('gift_aid_declarations')
      .update({
        generated_pdf_storage_path: storagePath,
        generated_pdf_path: storagePath,
        generated_pdf_created_at: submittedAt.toISOString(),
        self_service_link_id: link.id,
      })
      .eq('organisation_id', link.workspace_id)
      .eq('id', declarationId);

    await admin.from('gift_aid_declaration_documents').insert({
      organisation_id: link.workspace_id,
      declaration_id: declarationId,
      donor_id: donorId,
      document_type: 'generated_pdf',
      storage_path: storagePath,
      file_name: 'gift-aid-self-service-declaration.pdf',
      content_type: 'application/pdf',
      file_size: pdfBuffer.length,
      sha256: checksum,
      uploaded_by: null,
    });

    await admin
      .from('gift_aid_declaration_links')
      .update({
        status: 'used',
        declaration_id: declarationId,
        used_at: submittedAt.toISOString(),
        updated_at: submittedAt.toISOString(),
      })
      .eq('id', link.id);

    await logSelfServiceAuditEvent({
      orgId: link.workspace_id,
      userId: link.created_by,
      action: 'gift_aid_declaration_self_service_submitted',
      entityType: 'gift_aid_declaration',
      entityId: declarationId,
      metadata: {
        donorId,
        linkId: link.id,
        declarationScope: parsed.declarationScope,
        pdfPath: storagePath,
      },
    });

    await syncDonorGiftAidValidations({
      orgId: link.workspace_id,
      donorId,
      userId: link.created_by,
    });

    return { success: true, declarationId, error: null };
  } catch (error) {
    return {
      success: false,
      declarationId: null,
      error:
        error instanceof Error
          ? error.message
          : 'Unable to submit Gift Aid declaration.',
    };
  }
}

export async function listDeclarations(
  organisationId: string
): Promise<{ data: GiftAidDeclarationRow[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('gift_aid_declarations')
    .select('id, donor_id, declaration_type, status, start_date, end_date, is_active, declaration_date, covers_past_donations, hmrc_version, template_version, attachment_url, donation_amount_pence, charity_name, donor_title_snapshot, donor_first_name_or_initial_snapshot, donor_surname_snapshot, donor_full_home_address_snapshot, donor_postcode_snapshot, signed_date, taxpayer_confirmation, declaration_wording, donor_notification_notes, generated_pdf_storage_path, notes, created_at, cancelled_at, cancelled_by, cancellation_evidence_notes, donors(full_name)')
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false });

  if (error) {
    return { data: [], error: error.message };
  }

  const rows: GiftAidDeclarationRow[] = await Promise.all((data ?? []).map(async (d) => {
    const donor = d.donors as { full_name: string } | { full_name: string }[] | null;
    const donorObj = Array.isArray(donor) ? donor[0] ?? null : donor;

    return {
      id: d.id,
      donor_id: d.donor_id,
      donor_name: donorObj?.full_name ?? 'Unknown',
      declaration_type: d.declaration_type,
      status: d.status,
      start_date: d.start_date,
      end_date: d.end_date,
      is_active: d.is_active,
      declaration_date: d.declaration_date,
      covers_past_donations: d.covers_past_donations ?? false,
      hmrc_version: d.hmrc_version,
      template_version: d.template_version,
      attachment_url: d.attachment_url,
      attachment_download_url: await createGiftAidSignedUrl(d.attachment_url),
      donation_amount_pence: d.donation_amount_pence ? Number(d.donation_amount_pence) : null,
      charity_name: d.charity_name ?? null,
      donor_title_snapshot: d.donor_title_snapshot ?? null,
      donor_first_name_or_initial_snapshot: d.donor_first_name_or_initial_snapshot ?? null,
      donor_surname_snapshot: d.donor_surname_snapshot ?? null,
      donor_full_home_address_snapshot: d.donor_full_home_address_snapshot ?? null,
      donor_postcode_snapshot: d.donor_postcode_snapshot ?? null,
      signed_date: d.signed_date ?? null,
      taxpayer_confirmation: Boolean(d.taxpayer_confirmation),
      declaration_wording: d.declaration_wording ?? null,
      donor_notification_notes: d.donor_notification_notes ?? null,
      generated_pdf_storage_path: d.generated_pdf_storage_path ?? null,
      generated_pdf_download_url: await createGiftAidSignedUrl(d.generated_pdf_storage_path),
      notes: d.notes ?? null,
      created_at: d.created_at,
      cancelled_at: (d as { cancelled_at?: string | null }).cancelled_at ?? null,
      cancelled_by: (d as { cancelled_by?: string | null }).cancelled_by ?? null,
      cancellation_evidence_notes:
        (d as { cancellation_evidence_notes?: string | null }).cancellation_evidence_notes ?? null,
    };
  }));

  return { data: rows, error: null };
}

export async function createDeclaration(
  params: DeclarationWriteParams
): Promise<{ success: boolean; declarationId: string | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'create', 'gift_aid'); }
  catch (e) { return { success: false, declarationId: null, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();
  let form: GiftAidDeclarationFormData;
  try {
    const hydratedParams = await withDeclarationDefaults({
      supabase,
      orgId,
      input: params,
    });
    form = buildDeclarationFormData(hydratedParams);
  } catch (error) {
    return {
      success: false,
      declarationId: null,
      error: formatDeclarationValidationError(error),
    };
  }

  if (params.updateDonorProfile) {
    const sync = await syncDonorProfileFromGiftAidDeclaration({
      supabase,
      orgId,
      userId: user.id,
      form,
    });
    if (sync.error) {
      return { success: false, declarationId: null, error: sync.error };
    }
    if (sync.updated) {
      await logAuditEvent({
        orgId,
        userId: user.id,
        action: 'gift_aid_declaration_donor_profile_updated',
        entityType: 'donor',
        entityId: form.donorId,
        metadata: { source: 'gift_aid_declaration_create' },
      });
    }
  }

  const { data: declaration, error } = await supabase
    .from('gift_aid_declarations')
    .insert({
      organisation_id: orgId,
      ...declarationDbFields(form, user.id),
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error || !declaration) {
    return { success: false, declarationId: null, error: error?.message ?? 'Unable to create declaration.' };
  }

  if (form.attachmentUrl) {
    await supabase.from('gift_aid_declaration_documents').insert({
      organisation_id: orgId,
      declaration_id: declaration.id,
      donor_id: form.donorId,
      document_type: 'signed_declaration',
      storage_path: form.attachmentUrl,
      file_name: form.attachmentUrl.split('/').pop() ?? 'signed-declaration',
      content_type: 'application/octet-stream',
      uploaded_by: user.id,
    });
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'gift_aid_declaration_created',
    entityType: 'gift_aid_declaration',
    entityId: declaration.id,
    metadata: {
      donorId: form.donorId,
      declarationType: form.declarationType,
      status: form.status,
      startDate: form.startDate,
      endDate: form.endDate,
      coversPastDonations: form.coversPastDonations,
      donationAmountPence: form.donationAmountPence,
    },
  });

  if (form.attachmentUrl) {
    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'gift_aid_declaration_signed_copy_uploaded',
      entityType: 'gift_aid_declaration',
      entityId: declaration.id,
      metadata: {
        donorId: form.donorId,
        storagePath: form.attachmentUrl,
      },
    });
  }

  try {
    await syncDonorGiftAidValidations({
      orgId,
      donorId: form.donorId,
      userId: user.id,
    });
  } catch (error) {
    return {
      success: false,
      declarationId: declaration.id,
      error:
        error instanceof Error
          ? error.message
          : 'Declaration created, but Gift Aid validation refresh failed.',
    };
  }

  return { success: true, declarationId: declaration.id, error: null };
}

export async function updateDeclaration(params: DeclarationWriteParams & {
  declarationId: string;
}): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'gift_aid'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();
  let form: GiftAidDeclarationFormData;
  try {
    const hydratedParams = await withDeclarationDefaults({
      supabase,
      orgId,
      input: params,
    });
    form = buildDeclarationFormData(hydratedParams);
  } catch (error) {
    return { success: false, error: formatDeclarationValidationError(error) };
  }

  const { data: existing, error: existingError } = await supabase
    .from('gift_aid_declarations')
    .select('id, status')
    .eq('organisation_id', orgId)
    .eq('id', params.declarationId)
    .single();

  if (existingError || !existing) {
    return {
      success: false,
      error: existingError?.message ?? 'Declaration not found.',
    };
  }

  if (existing.status !== 'draft') {
    return {
      success: false,
      error: 'Only draft declarations can be edited. Cancel or replace active declarations instead.',
    };
  }

  if (params.updateDonorProfile) {
    const sync = await syncDonorProfileFromGiftAidDeclaration({
      supabase,
      orgId,
      userId: user.id,
      form,
    });
    if (sync.error) {
      return { success: false, error: sync.error };
    }
    if (sync.updated) {
      await logAuditEvent({
        orgId,
        userId: user.id,
        action: 'gift_aid_declaration_donor_profile_updated',
        entityType: 'donor',
        entityId: form.donorId,
        metadata: { source: 'gift_aid_declaration_edit', declarationId: params.declarationId },
      });
    }
  }

  const { error } = await supabase
    .from('gift_aid_declarations')
    .update(declarationDbFields(form, user.id))
    .eq('organisation_id', orgId)
    .eq('id', params.declarationId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'gift_aid_declaration_edited',
    entityType: 'gift_aid_declaration',
    entityId: params.declarationId,
    metadata: {
      donorId: form.donorId,
      declarationType: form.declarationType,
      status: form.status,
      startDate: form.startDate,
      endDate: form.endDate,
      coversPastDonations: form.coversPastDonations,
    },
  });

  try {
    await syncDonorGiftAidValidations({
      orgId,
      donorId: form.donorId,
      userId: user.id,
    });
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Declaration updated, but Gift Aid validation refresh failed.',
    };
  }

  return { success: true, error: null };
}

export async function activateDeclaration(
  declarationId: string
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'gift_aid'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();
  const { data: declaration, error: loadError } = await supabase
    .from('gift_aid_declarations')
    .select('id, donor_id, declaration_type, status, start_date, end_date, declaration_date, signed_date, donation_amount_pence, charity_name, donor_title_snapshot, donor_first_name_or_initial_snapshot, donor_surname_snapshot, donor_full_home_address_snapshot, donor_postcode_snapshot, taxpayer_confirmation, declaration_wording, donor_notification_notes, covers_past_donations, hmrc_version, template_version, attachment_url, notes')
    .eq('organisation_id', orgId)
    .eq('id', declarationId)
    .single();

  if (loadError || !declaration) {
    return { success: false, error: loadError?.message ?? 'Declaration not found.' };
  }

  try {
    buildDeclarationFormData({
      donorId: declaration.donor_id,
      declarationType: declaration.declaration_type,
      status: 'active',
      startDate: declaration.start_date,
      endDate: declaration.end_date,
      declarationDate: declaration.declaration_date,
      signedDate: declaration.signed_date ?? declaration.declaration_date,
      donationAmountPence: declaration.donation_amount_pence
        ? Number(declaration.donation_amount_pence)
        : null,
      charityName: declaration.charity_name,
      donorTitle: declaration.donor_title_snapshot,
      donorFirstNameOrInitial: declaration.donor_first_name_or_initial_snapshot,
      donorSurname: declaration.donor_surname_snapshot,
      donorFullHomeAddress: declaration.donor_full_home_address_snapshot,
      donorPostcode: declaration.donor_postcode_snapshot,
      taxpayerConfirmation: Boolean(declaration.taxpayer_confirmation),
      declarationWording: declaration.declaration_wording,
      donorNotificationNotes: declaration.donor_notification_notes,
      coversPastDonations: declaration.covers_past_donations,
      hmrcVersion: declaration.hmrc_version,
      templateVersion: declaration.template_version,
      attachmentUrl: declaration.attachment_url,
      notes: declaration.notes,
    });
  } catch (error) {
    return { success: false, error: formatDeclarationValidationError(error) };
  }

  const { error } = await supabase
    .from('gift_aid_declarations')
    .update({ status: 'active', is_active: true, updated_by: user.id })
    .eq('id', declarationId)
    .eq('organisation_id', orgId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'gift_aid_declaration_activated',
    entityType: 'gift_aid_declaration',
    entityId: declarationId,
    metadata: {
      donorId: declaration.donor_id,
      previousStatus: declaration.status,
      nextStatus: 'active',
    },
  });

  try {
    await syncDonorGiftAidValidations({
      orgId,
      donorId: declaration.donor_id,
      userId: user.id,
    });
  } catch (syncError) {
    return {
      success: false,
      error:
        syncError instanceof Error
          ? syncError.message
          : 'Declaration activated, but Gift Aid validation refresh failed.',
    };
  }

  return { success: true, error: null };
}

export type CancelDeclarationOptions = {
  reason?: string;
  /** Effective cancellation date boundary (Gift Aid eligibility ends after this date for new donations). */
  cancellationDate?: string;
  /** Notes or filing reference for HMRC / trustee audit trail (stored separately from the reason summary). */
  evidenceNotes?: string;
};

export async function cancelDeclaration(
  declarationId: string,
  input?: string | CancelDeclarationOptions
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'gift_aid'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const payload: CancelDeclarationOptions =
    typeof input === 'string' ? { reason: input } : input ?? {};
  const reasonText = normalizeOptionalText(payload.reason) ?? null;
  const evidenceText = normalizeOptionalText(payload.evidenceNotes) ?? null;

  let endIso: string;
  if (payload.cancellationDate?.trim()) {
    const trimmed = payload.cancellationDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return { success: false, error: 'Use an ISO cancellation date (YYYY-MM-DD).' };
    }
    endIso = trimmed;
  } else {
    endIso = new Date().toISOString().slice(0, 10);
  }

  const supabase = await createClient();
  const { data: updatedDeclaration, error } = await supabase
    .from('gift_aid_declarations')
    .update({
      status: 'cancelled',
      is_active: false,
      end_date: endIso,
      cancellation_reason: reasonText ?? 'Cancelled by user.',
      cancellation_evidence_notes: evidenceText,
      cancelled_by: user.id,
      updated_by: user.id,
    })
    .eq('id', declarationId)
    .eq('organisation_id', orgId)
    .select('donor_id')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'gift_aid_declaration_cancelled',
    entityType: 'gift_aid_declaration',
    entityId: declarationId,
    metadata: {
      donorId: updatedDeclaration?.donor_id ?? null,
      nextStatus: 'cancelled',
      reason: reasonText,
      cancellationDate: endIso,
      evidenceNotes: evidenceText,
      cancelledBy: user.id,
    },
  });

  const syncRem = await syncGiftAidDeclarationReminders(supabase, orgId);
  if (syncRem.error) {
    console.warn('Gift Aid reminder sync after cancellation:', syncRem.error);
  }

  if (updatedDeclaration?.donor_id) {
    try {
      await syncDonorGiftAidValidations({
        orgId,
        donorId: updatedDeclaration.donor_id,
        userId: user.id,
      });
    } catch (syncError) {
      return {
        success: false,
        error:
          syncError instanceof Error
            ? syncError.message
            : 'Declaration cancelled, but Gift Aid validation refresh failed.',
      };
    }
  }

  return { success: true, error: null };
}

export const deactivateDeclaration = cancelDeclaration;
export const reactivateDeclaration = activateDeclaration;

/** Upload a signed declaration copy to private Supabase Storage. */
export async function uploadSignedDeclarationCopy(
  formData: FormData
): Promise<{ storagePath: string | null; url: string | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'gift_aid'); }
  catch (e) { return { storagePath: null, url: null, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const file = formData.get('file') as File | null;
  const declarationId = String(formData.get('declarationId') ?? '');
  if (!file) {
    return { storagePath: null, url: null, error: 'No file provided.' };
  }

  const supabase = await createClient();
  const declaration = declarationId
    ? (
        await supabase
          .from('gift_aid_declarations')
          .select('id, donor_id')
          .eq('organisation_id', orgId)
          .eq('id', declarationId)
          .single()
      )
    : { data: null, error: null };

  if (declarationId && (declaration.error || !declaration.data)) {
    return { storagePath: null, url: null, error: declaration.error?.message ?? 'Declaration not found.' };
  }

  const ext = file.name.split('.').pop() ?? 'pdf';
  const path = declarationId
    ? `${orgId}/declarations/${declarationId}/signed-${Date.now()}.${ext}`
    : `${orgId}/declarations/temp/signed-${Date.now()}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const checksum = createHash('sha256').update(buffer).digest('hex');

  const { error: uploadErr } = await supabase.storage
    .from('gift-aid')
    .upload(path, buffer, {
      contentType: file.type || 'application/pdf',
      upsert: false,
    });

  if (uploadErr) {
    return { storagePath: null, url: null, error: uploadErr.message };
  }

  if (declarationId && declaration.data) {
    const { error: docError } = await supabase
      .from('gift_aid_declaration_documents')
      .insert({
        organisation_id: orgId,
        declaration_id: declarationId,
        donor_id: declaration.data.donor_id,
        document_type: 'signed_declaration',
        storage_path: path,
        file_name: file.name,
        content_type: file.type || 'application/pdf',
        file_size: file.size,
        sha256: checksum,
        uploaded_by: user.id,
      });

    if (docError) {
      await supabase.storage.from('gift-aid').remove([path]);
      return { storagePath: null, url: null, error: docError.message };
    }

    await supabase
      .from('gift_aid_declarations')
      .update({ attachment_url: path, updated_by: user.id })
      .eq('organisation_id', orgId)
      .eq('id', declarationId);

    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'gift_aid_declaration_signed_copy_uploaded',
      entityType: 'gift_aid_declaration',
      entityId: declarationId,
      metadata: {
        donorId: declaration.data.donor_id,
        storagePath: path,
        fileName: file.name,
        sha256: checksum,
      },
    });
  }

  const url = await createGiftAidSignedUrl(path);

  return { storagePath: path, url: declarationId ? url : path, error: null };
}

export const uploadDeclarationFile = uploadSignedDeclarationCopy;

export async function generateDeclarationPdf(
  declarationId: string
): Promise<{ storagePath: string | null; url: string | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'gift_aid'); }
  catch (e) { return { storagePath: null, url: null, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();
  const { data: declaration, error: declarationError } = await supabase
    .from('gift_aid_declarations')
    .select('id, donor_id, declaration_type, status, start_date, end_date, declaration_date, signed_date, donation_amount_pence, charity_name, donor_title_snapshot, donor_first_name_or_initial_snapshot, donor_surname_snapshot, donor_full_home_address_snapshot, donor_postcode_snapshot, taxpayer_confirmation, declaration_wording, donor_notification_notes, covers_past_donations, hmrc_version, template_version, attachment_url, notes')
    .eq('organisation_id', orgId)
    .eq('id', declarationId)
    .single();

  if (declarationError || !declaration) {
    return { storagePath: null, url: null, error: declarationError?.message ?? 'Declaration not found.' };
  }

  let form: GiftAidDeclarationFormData;
  try {
    form = buildDeclarationFormData({
      donorId: declaration.donor_id,
      declarationType: declaration.declaration_type,
      status: declaration.status,
      startDate: declaration.start_date,
      endDate: declaration.end_date,
      declarationDate: declaration.declaration_date,
      signedDate: declaration.signed_date ?? declaration.declaration_date,
      donationAmountPence: declaration.donation_amount_pence
        ? Number(declaration.donation_amount_pence)
        : null,
      charityName: declaration.charity_name,
      donorTitle: declaration.donor_title_snapshot,
      donorFirstNameOrInitial: declaration.donor_first_name_or_initial_snapshot,
      donorSurname: declaration.donor_surname_snapshot,
      donorFullHomeAddress: declaration.donor_full_home_address_snapshot,
      donorPostcode: declaration.donor_postcode_snapshot,
      taxpayerConfirmation: Boolean(declaration.taxpayer_confirmation),
      declarationWording: declaration.declaration_wording,
      donorNotificationNotes: declaration.donor_notification_notes,
      coversPastDonations: declaration.covers_past_donations,
      hmrcVersion: declaration.hmrc_version,
      templateVersion: declaration.template_version,
      attachmentUrl: declaration.attachment_url,
      notes: declaration.notes,
    });
  } catch (error) {
    return { storagePath: null, url: null, error: formatDeclarationValidationError(error) };
  }

  const pdf = await renderGiftAidDeclarationPdf(form);
  const checksum = createHash('sha256').update(pdf).digest('hex');
  const fileName = `gift-aid-declaration-${declarationId.slice(0, 8)}.pdf`;
  const path = `${orgId}/declarations/${declarationId}/generated-${Date.now()}.pdf`;

  const { error: uploadErr } = await supabase.storage
    .from('gift-aid')
    .upload(path, pdf, {
      contentType: 'application/pdf',
      upsert: false,
    });

  if (uploadErr) {
    return { storagePath: null, url: null, error: uploadErr.message };
  }

  const { error: docError } = await supabase
    .from('gift_aid_declaration_documents')
    .insert({
      organisation_id: orgId,
      declaration_id: declarationId,
      donor_id: declaration.donor_id,
      document_type: 'generated_pdf',
      storage_path: path,
      file_name: fileName,
      content_type: 'application/pdf',
      file_size: pdf.length,
      sha256: checksum,
      uploaded_by: user.id,
    });

  if (docError) {
    await supabase.storage.from('gift-aid').remove([path]);
    return { storagePath: null, url: null, error: docError.message };
  }

  await supabase
    .from('gift_aid_declarations')
    .update({
      generated_pdf_storage_path: path,
      generated_pdf_created_at: new Date().toISOString(),
      generated_pdf_created_by: user.id,
      updated_by: user.id,
    })
    .eq('organisation_id', orgId)
    .eq('id', declarationId);

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'gift_aid_declaration_pdf_generated',
    entityType: 'gift_aid_declaration',
    entityId: declarationId,
    metadata: {
      donorId: declaration.donor_id,
      storagePath: path,
      fileName,
      sha256: checksum,
    },
  });

  const url = await createGiftAidSignedUrl(path);
  return { storagePath: path, url, error: null };
}

/* ================================================================== */
/*  GET APPROVAL HISTORY                                               */
/* ================================================================== */

export async function getGiftAidApprovalHistory(
  claimId: string
): Promise<{ data: { action: string; performed_by: string; notes: string | null; created_at: string }[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('approval_events')
    .select('action, performed_by, notes, created_at')
    .eq('entity_type', 'gift_aid_claim')
    .eq('entity_id', claimId)
    .order('created_at', { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: data ?? [], error: null };
}

/* ================================================================== */
/*  DONOR SOFT-DELETE                                                   */
/* ================================================================== */

export async function archiveDonor(
  donorId: string,
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'donations'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();
  const { error } = await supabase
    .from('donors')
    .update({ is_active: false })
    .eq('organisation_id', orgId)
    .eq('id', donorId);

  if (!error) {
    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'archive_donor',
      entityType: 'donor',
      entityId: donorId,
    });
  }

  return { success: !error, error: error?.message ?? null };
}

export async function unarchiveDonor(
  donorId: string,
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'donations'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();
  const { error } = await supabase
    .from('donors')
    .update({ is_active: true })
    .eq('organisation_id', orgId)
    .eq('id', donorId);

  if (!error) {
    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'unarchive_donor',
      entityType: 'donor',
      entityId: donorId,
    });
  }

  return { success: !error, error: error?.message ?? null };
}
