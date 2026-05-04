export const GIFT_AID_DONATION_STATUSES = [
  'not_assessed',
  'unmatched',
  'needs_review',
  'matched_no_declaration',
  'eligible',
  'missing_declaration',
  'invalid_donor_details',
  'already_claimed',
  'ineligible',
  'included_in_claim',
  'included_in_draft_claim',
  'exported',
  'submitted',
  'paid',
  'rejected',
] as const;

export type GiftAidDonationStatus =
  (typeof GIFT_AID_DONATION_STATUSES)[number];

export const GIFT_AID_DECLARATION_STATUSES = [
  'active',
  'cancelled',
  'expired',
] as const;

export type GiftAidDeclarationStatus =
  (typeof GIFT_AID_DECLARATION_STATUSES)[number];

export const GIFT_AID_MATCH_METHODS = [
  'exact_reference_code',
  'exact_normalized_full_name',
  'exact_import_metadata',
  'fuzzy_name_reference',
  'manual',
] as const;

export type GiftAidMatchMethod = (typeof GIFT_AID_MATCH_METHODS)[number];

export const GIFT_AID_MATCH_REVIEW_STATUSES = [
  'suggested',
  'auto_confirmed',
  'confirmed',
  'rejected',
  'superseded',
] as const;

export type GiftAidMatchReviewStatus =
  (typeof GIFT_AID_MATCH_REVIEW_STATUSES)[number];

export const GIFT_AID_BATCH_STATUSES = [
  'draft',
  'review',
  'approved',
  'exported',
  'submitted',
  'paid',
  'rejected',
  'voided',
] as const;

export type GiftAidBatchStatus = (typeof GIFT_AID_BATCH_STATUSES)[number];

export interface GiftAidDonorRecord {
  id: string;
  workspace_id: string;
  full_name: string;
  reference_code: string | null;
  donor_reference_code: string | null;
  title: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  house_name_or_number: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postcode: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface GiftAidDeclarationRecord {
  id: string;
  workspace_id: string;
  donor_id: string;
  declaration_type: string;
  status: GiftAidDeclarationStatus;
  declaration_date: string | null;
  start_date: string;
  end_date: string | null;
  covers_past_donations: boolean;
  is_active: boolean;
  attachment_url: string | null;
  hmrc_version: string | null;
  template_version: string | null;
  notes: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface GiftAidDonationRecord {
  id: string;
  workspace_id: string;
  donor_id: string | null;
  bank_transaction_id: string | null;
  giving_import_row_id: string | null;
  matched_declaration_id: string | null;
  donation_date: string;
  fund_id: string | null;
  source: string;
  channel: string;
  gross_amount_pence: number;
  fee_amount_pence: number;
  net_amount_pence: number;
  provider_reference: string | null;
  status: 'draft' | 'posted';
  gift_aid_status: GiftAidDonationStatus;
  gift_aid_eligible: boolean;
  gift_aid_claim_id: string | null;
  gift_aid_claim_batch_id: string | null;
  gift_aid_estimated_claim_pence: number | null;
  gift_aid_ineligible_reason: string | null;
  gift_aid_validation_result: Record<string, unknown>;
  review_reason: string | null;
  included_in_claim_at: string | null;
  submitted_to_hmrc_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface BankTransactionDonorMatchRecord {
  id: string;
  workspace_id: string;
  bank_transaction_id: string | null;
  donor_id: string;
  donation_id: string | null;
  match_method: GiftAidMatchMethod;
  confidence_score: number | null;
  review_status: GiftAidMatchReviewStatus;
  notes: string | null;
  match_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface GiftAidClaimBatchRecord {
  id: string;
  workspace_id: string;
  claim_start: string;
  claim_end: string;
  status: GiftAidBatchStatus;
  batch_reference: string | null;
  hmrc_submission_reference: string | null;
  donation_count: number;
  donation_total_pence: number;
  claim_total_pence: number;
  latest_exported_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  voided_at: string | null;
  validation_run_at: string | null;
  validation_summary: Record<string, unknown>;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export interface GiftAidClaimLineRecord {
  id: string;
  workspace_id: string;
  claim_batch_id: string;
  donation_id: string | null;
  donor_id: string | null;
  claim_item_type: 'standard_gift_aid' | 'gasds';
  gasds_batch_id: string | null;
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
  status: 'included' | 'removed' | 'exception';
  validation_status: 'valid' | 'warning' | 'blocking';
  validation_issues: Array<Record<string, unknown>>;
  manual_edit_reason: string | null;
  edited_at: string | null;
  edited_by: string | null;
  original_snapshot: Record<string, unknown> | null;
  edited_snapshot: Record<string, unknown> | null;
  created_at: string;
}

export interface GiftAidExportRecord {
  id: string;
  workspace_id: string;
  claim_batch_id: string;
  export_format: 'hmrc_csv' | 'hmrc_xlsx' | 'pdf_review' | 'csv' | 'json';
  file_name: string | null;
  storage_path: string | null;
  checksum_sha256: string | null;
  row_count: number;
  version: number;
  generated_by: string | null;
  generated_at: string;
  donation_total_pence: number;
  gift_aid_total_pence: number;
  pdf_storage_path: string | null;
  pdf_file_name: string | null;
  validation_summary: Record<string, unknown>;
  export_readiness: 'ready' | 'warnings' | 'blocked';
  exported_at: string;
  submitted_at: string | null;
  submission_reference: string | null;
  exported_by: string | null;
  created_at: string;
}

export interface GiftAidDonorModel {
  id: string;
  workspaceId: string;
  fullName: string;
  referenceCode: string | null;
  donorReferenceCode: string | null;
  title: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  houseNameOrNumber: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postcode: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface GiftAidDeclarationModel {
  id: string;
  workspaceId: string;
  donorId: string;
  declarationType: string;
  status: GiftAidDeclarationStatus;
  declarationDate: string | null;
  startDate: string;
  endDate: string | null;
  coversPastDonations: boolean;
  isActive: boolean;
  attachmentUrl: string | null;
  hmrcVersion: string | null;
  templateVersion: string | null;
  notes: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface GiftAidDonationModel {
  id: string;
  workspaceId: string;
  donorId: string | null;
  bankTransactionId: string | null;
  givingImportRowId: string | null;
  matchedDeclarationId: string | null;
  donationDate: string;
  fundId: string | null;
  source: string;
  channel: string;
  grossAmountPence: number;
  feeAmountPence: number;
  netAmountPence: number;
  providerReference: string | null;
  postingStatus: 'draft' | 'posted';
  giftAidStatus: GiftAidDonationStatus;
  giftAidEligible: boolean;
  legacyClaimId: string | null;
  ineligibleReason: string | null;
  validationResult: Record<string, unknown>;
  reviewReason: string | null;
  includedInClaimAt: string | null;
  submittedToHmrcAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface BankTransactionDonorMatchModel {
  id: string;
  workspaceId: string;
  bankTransactionId: string | null;
  donorId: string;
  donationId: string | null;
  matchMethod: GiftAidMatchMethod;
  confidenceScore: number | null;
  reviewStatus: GiftAidMatchReviewStatus;
  notes: string | null;
  matchMetadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface GiftAidClaimBatchModel {
  id: string;
  workspaceId: string;
  claimStart: string;
  claimEnd: string;
  status: GiftAidBatchStatus;
  batchReference: string | null;
  hmrcSubmissionReference: string | null;
  donationCount: number;
  donationTotalPence: number;
  claimTotalPence: number;
  latestExportedAt: string | null;
  submittedAt: string | null;
  voidedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface GiftAidClaimLineModel {
  id: string;
  workspaceId: string;
  claimBatchId: string;
  donationId: string | null;
  donorId: string | null;
  claimItemType: 'standard_gift_aid' | 'gasds';
  gasdsBatchId: string | null;
  declarationId: string | null;
  donationDate: string;
  donationAmountPence: number;
  claimRate: number;
  claimAmountPence: number;
  donorNameSnapshot: string;
  donorAddressSnapshot: string | null;
  donorPostcodeSnapshot: string | null;
  donorTitleSnapshot: string | null;
  donorFirstNameOrInitialSnapshot: string | null;
  donorLastNameSnapshot: string | null;
  donorHouseNameOrNumberSnapshot: string | null;
  createdAt: string;
}

export interface GiftAidExportModel {
  id: string;
  workspaceId: string;
  claimBatchId: string;
  exportFormat: 'hmrc_csv' | 'hmrc_xlsx' | 'pdf_review' | 'csv' | 'json';
  fileName: string | null;
  storagePath: string | null;
  checksumSha256: string | null;
  rowCount: number;
  exportedAt: string;
  submittedAt: string | null;
  submissionReference: string | null;
  exportedBy: string | null;
  createdAt: string;
}

export function mapGiftAidDonorRecord(
  record: GiftAidDonorRecord
): GiftAidDonorModel {
  return {
    id: record.id,
    workspaceId: record.workspace_id,
    fullName: record.full_name,
    referenceCode: record.reference_code,
    donorReferenceCode: record.donor_reference_code,
    title: record.title,
    firstName: record.first_name,
    lastName: record.last_name,
    displayName: record.display_name,
    houseNameOrNumber: record.house_name_or_number,
    email: record.email,
    phone: record.phone,
    address: record.address,
    postcode: record.postcode,
    notes: record.notes,
    isActive: record.is_active,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    createdBy: record.created_by,
    updatedBy: record.updated_by,
  };
}

export function mapGiftAidDeclarationRecord(
  record: GiftAidDeclarationRecord
): GiftAidDeclarationModel {
  return {
    id: record.id,
    workspaceId: record.workspace_id,
    donorId: record.donor_id,
    declarationType: record.declaration_type,
    status: record.status,
    declarationDate: record.declaration_date,
    startDate: record.start_date,
    endDate: record.end_date,
    coversPastDonations: record.covers_past_donations,
    isActive: record.is_active,
    attachmentUrl: record.attachment_url,
    hmrcVersion: record.hmrc_version,
    templateVersion: record.template_version,
    notes: record.notes,
    cancelledAt: record.cancelled_at,
    cancellationReason: record.cancellation_reason,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    createdBy: record.created_by,
    updatedBy: record.updated_by,
  };
}

export function mapGiftAidDonationRecord(
  record: GiftAidDonationRecord
): GiftAidDonationModel {
  return {
    id: record.id,
    workspaceId: record.workspace_id,
    donorId: record.donor_id,
    bankTransactionId: record.bank_transaction_id,
    givingImportRowId: record.giving_import_row_id,
    matchedDeclarationId: record.matched_declaration_id,
    donationDate: record.donation_date,
    fundId: record.fund_id,
    source: record.source,
    channel: record.channel,
    grossAmountPence: Number(record.gross_amount_pence),
    feeAmountPence: Number(record.fee_amount_pence),
    netAmountPence: Number(record.net_amount_pence),
    providerReference: record.provider_reference,
    postingStatus: record.status,
    giftAidStatus: record.gift_aid_status,
    giftAidEligible: record.gift_aid_eligible,
    legacyClaimId: record.gift_aid_claim_id,
    ineligibleReason: record.gift_aid_ineligible_reason,
    validationResult: record.gift_aid_validation_result ?? {},
    reviewReason: record.review_reason,
    includedInClaimAt: record.included_in_claim_at,
    submittedToHmrcAt: record.submitted_to_hmrc_at,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    createdBy: record.created_by,
    updatedBy: record.updated_by,
  };
}

export function mapBankTransactionDonorMatchRecord(
  record: BankTransactionDonorMatchRecord
): BankTransactionDonorMatchModel {
  return {
    id: record.id,
    workspaceId: record.workspace_id,
    bankTransactionId: record.bank_transaction_id,
    donorId: record.donor_id,
    donationId: record.donation_id,
    matchMethod: record.match_method,
    confidenceScore: record.confidence_score,
    reviewStatus: record.review_status,
    notes: record.notes,
    matchMetadata: record.match_metadata,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    createdBy: record.created_by,
    updatedBy: record.updated_by,
  };
}

export function mapGiftAidClaimBatchRecord(
  record: GiftAidClaimBatchRecord
): GiftAidClaimBatchModel {
  return {
    id: record.id,
    workspaceId: record.workspace_id,
    claimStart: record.claim_start,
    claimEnd: record.claim_end,
    status: record.status,
    batchReference: record.batch_reference,
    hmrcSubmissionReference: record.hmrc_submission_reference,
    donationCount: Number(record.donation_count),
    donationTotalPence: Number(record.donation_total_pence),
    claimTotalPence: Number(record.claim_total_pence),
    latestExportedAt: record.latest_exported_at,
    submittedAt: record.submitted_at,
    voidedAt: record.voided_at,
    notes: record.notes,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    createdBy: record.created_by,
    updatedBy: record.updated_by,
  };
}

export function mapGiftAidClaimLineRecord(
  record: GiftAidClaimLineRecord
): GiftAidClaimLineModel {
  return {
    id: record.id,
    workspaceId: record.workspace_id,
    claimBatchId: record.claim_batch_id,
    donationId: record.donation_id,
    donorId: record.donor_id,
    claimItemType: record.claim_item_type ?? 'standard_gift_aid',
    gasdsBatchId: record.gasds_batch_id,
    declarationId: record.declaration_id,
    donationDate: record.donation_date,
    donationAmountPence: Number(record.donation_amount_pence),
    claimRate: Number(record.claim_rate),
    claimAmountPence: Number(record.claim_amount_pence),
    donorNameSnapshot: record.donor_name_snapshot,
    donorAddressSnapshot: record.donor_address_snapshot,
    donorPostcodeSnapshot: record.donor_postcode_snapshot,
    donorTitleSnapshot: record.donor_title_snapshot,
    donorFirstNameOrInitialSnapshot:
      record.donor_first_name_or_initial_snapshot,
    donorLastNameSnapshot: record.donor_last_name_snapshot,
    donorHouseNameOrNumberSnapshot:
      record.donor_house_name_or_number_snapshot,
    createdAt: record.created_at,
  };
}

export function mapGiftAidExportRecord(
  record: GiftAidExportRecord
): GiftAidExportModel {
  return {
    id: record.id,
    workspaceId: record.workspace_id,
    claimBatchId: record.claim_batch_id,
    exportFormat: record.export_format,
    fileName: record.file_name,
    storagePath: record.storage_path,
    checksumSha256: record.checksum_sha256,
    rowCount: Number(record.row_count),
    exportedAt: record.exported_at,
    submittedAt: record.submitted_at,
    submissionReference: record.submission_reference,
    exportedBy: record.exported_by,
    createdAt: record.created_at,
  };
}
