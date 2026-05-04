import type { GiftAidValidationIssue } from './eligibility';
import type { GiftAidHealthScoreResult } from './health-score';

/* Gift Aid types (shared, not a server action file) */

export interface GiftAidClaimRow {
  id: string;
  claim_start: string;
  claim_end: string;
  created_at: string;
  submitted_at: string | null;
  paid_at: string | null;
  reference: string | null;
  status:
    | 'draft'
    | 'review'
    | 'approved'
    | 'exported'
    | 'submitted'
    | 'paid'
    | 'rejected'
    | 'voided';
  donation_count: number;
  eligible_amount_pence: number;
  claimable_total_pence: number;
  journal_id: string | null;
  latest_export_id: string | null;
  latest_export_file_name: string | null;
  latest_exported_at: string | null;
}

/** Bank receipt reconciliation for the matching `gift_aid_claim_batches` row (same id as claim when mirrored). */
export type GiftAidBankPaymentStatus =
  | 'pending'
  | 'partially_paid'
  | 'paid'
  | 'overpaid'
  | 'underpaid'
  | 'reconciled';

export interface GiftAidClaimBatchPaymentAllocationRow {
  id: string;
  bank_line_id: string;
  allocated_amount_pence: number;
  journal_id: string | null;
  confirmed_at: string;
  txn_date: string | null;
  reference: string | null;
  description: string | null;
  amount_pence: number | null;
}

export interface GiftAidClaimBatchPaymentSnapshot {
  claim_batch_id: string;
  expected_payment_amount_pence: number | null;
  expected_payment_date: string | null;
  payment_bank_account_id: string | null;
  received_payment_total_pence: number;
  received_bank_transaction_id: string | null;
  gift_aid_payment_status: GiftAidBankPaymentStatus;
  payment_reconciled_at: string | null;
  payment_journal_id: string | null;
  claim_total_pence: number;
  allocations: GiftAidClaimBatchPaymentAllocationRow[];
}

export interface GiftAidClaimDetail {
  id: string;
  claim_start: string;
  claim_end: string;
  created_at: string;
  submitted_at: string | null;
  paid_at: string | null;
  reference: string | null;
  status:
    | 'draft'
    | 'review'
    | 'approved'
    | 'exported'
    | 'submitted'
    | 'paid'
    | 'rejected'
    | 'voided';
  created_by: string | null;
  journal_id: string | null;
  total_donations_pence: number | null;
  total_gift_aid_pence: number | null;
  export_ready: boolean;
  export_blockers: string[];
  latest_export_id: string | null;
  latest_export_file_name: string | null;
  latest_exported_at: string | null;
  /** Present when a `gift_aid_claim_batches` row exists with the same id as this claim. */
  batch_payment?: GiftAidClaimBatchPaymentSnapshot | null;
}

export interface ClaimDonationRow {
  id: string;
  donation_date: string;
  amount_pence: number;
  donor_name: string;
  address: string;
  postcode: string;
  claimable_pence: number;
  fund_id: string | null;
}

export interface GiftAidSchedulePreviewRow {
  claim_line_id: string;
  donation_id: string;
  title: string;
  first_name_or_initial: string;
  last_name: string;
  house_name_or_number: string;
  postcode: string;
  aggregated_donations: string;
  sponsored_event: string;
  donation_date: string;
  amount: string;
  donation_amount_pence: number;
  claim_amount_pence: number;
  validation_warnings: string[];
  locked: boolean;
}

/** GASDS (small donations) rows on schedule preview — no named donor declaration. */
export interface GiftAidScheduleGasdsPreviewRow {
  claim_line_id: string;
  donation_id: null;
  gasds_batch_id: string;
  batch_reference: string;
  collection_date: string;
  service_or_event_name: string;
  collection_method: string;
  eligible_amount_pence: number;
  claim_amount_pence: number;
  validation_warnings: string[];
  locked: boolean;
}

export interface GiftAidScheduleExportHistoryRow {
  id: string;
  version: number;
  generated_by: string | null;
  generated_at: string;
  file_name: string | null;
  storage_path: string | null;
  pdf_file_name: string | null;
  pdf_storage_path: string | null;
  row_count: number;
  donation_total_pence: number;
  gift_aid_total_pence: number;
  export_readiness: string;
}

export interface GiftAidSchedulePreviewData {
  batch: {
    id: string;
    status: string;
    claim_start: string;
    claim_end: string;
    donation_count: number;
    donation_total_pence: number;
    claim_total_pence: number;
  };
  rows: GiftAidSchedulePreviewRow[];
  gasds_rows?: GiftAidScheduleGasdsPreviewRow[];
  issues: Array<{ donationId: string; field: string; message: string }>;
  readiness: 'ready' | 'warnings' | 'blocked';
  row_count: number;
  total_donation_amount_pence: number;
  total_gift_aid_amount_pence: number;
  export_history: GiftAidScheduleExportHistoryRow[];
}

export type GiftAidControlCentreTab =
  | 'overview'
  | 'donors'
  | 'declarations'
  | 'eligible-donations'
  | 'claim-batches'
  | 'schedule-builder'
  | 'exceptions'
  | 'small-donations'
  | 'settings';

export interface GiftAidControlMetric {
  id: string;
  label: string;
  value: number;
  value_pence?: number;
  helper: string;
  href?: string;
}

export interface GiftAidControlAlert {
  id: string;
  title: string;
  description: string;
  count: number;
  tone: 'info' | 'warning' | 'success' | 'danger';
  href?: string;
}

export interface GiftAidControlDonorRow extends GiftAidDonorRow {
  declaration_status_label: string;
  total_giving_pence: number;
  eligible_giving_pence: number;
  gift_aid_claimed_pence: number;
}

export interface GiftAidControlEligibleDonationRow {
  donation_id: string;
  donation_date: string;
  donor_id: string | null;
  donor_name: string | null;
  amount_pence: number;
  fund_name: string | null;
  bank_transaction_label: string | null;
  declaration_label: string;
  gift_aid_status: string;
  plain_status: string;
  claim_batch_label: string | null;
  workflow_stage: GiftAidWorkflowStage;
}

export interface GiftAidControlClaimBatchRow extends GiftAidClaimRow {
  plain_status: string;
  needs_review: boolean;
  ready_for_hmrc: boolean;
}

export interface GiftAidControlExceptionRow {
  id: string;
  donation_id: string | null;
  donor_id: string | null;
  donor_name: string | null;
  amount_pence: number | null;
  message: string;
  plain_status: string;
  href: string;
}

export interface GiftAidControlScheduleBatchOption {
  id: string;
  label: string;
  status: string;
  plain_status: string;
  row_count: number;
  total_donation_pence: number;
  total_gift_aid_pence: number;
  latest_export_file_name: string | null;
}

export interface GiftAidGasdsSummary {
  tax_year_label: string;
  claimed_eligible_pence: number;
  annual_cap_pence: number;
  remaining_eligible_pence: number;
  ready_batch_count: number;
}

/** Workspace declaration reminder (evaluation output stored in DB). */
export interface GiftAidReminderRow {
  id: string;
  reminder_type: string;
  severity: 'info' | 'warning' | 'urgent';
  message: string;
  status: 'open' | 'dismissed' | 'resolved';
  due_date: string | null;
  donor_id: string | null;
  declaration_id: string | null;
}

/** Thresholds for Gift Aid reminder rules (organisation_settings-backed). */
export interface GiftAidReminderSettings {
  stale_declaration_days: number;
  no_donation_days: number;
  require_signed_copy: boolean;
}

export interface GiftAidControlCentreData {
  /** Charity-wide composite score for the current tax-year-to-date window (+ prior window for trend). */
  health_score: GiftAidHealthScoreResult | null;
  metrics: GiftAidControlMetric[];
  alerts: GiftAidControlAlert[];
  donors: GiftAidControlDonorRow[];
  declarations: GiftAidDeclarationRow[];
  eligible_donations: GiftAidControlEligibleDonationRow[];
  claim_batches: GiftAidControlClaimBatchRow[];
  exceptions: GiftAidControlExceptionRow[];
  schedule_batches: GiftAidControlScheduleBatchOption[];
  gasds: GiftAidGasdsSummary;
  gasds_batches: GiftAidControlGasdsBatchRow[];
  reminders: GiftAidReminderRow[];
  reminder_settings: GiftAidReminderSettings;
}

export interface GiftAidControlGasdsBatchRow {
  id: string;
  batch_reference: string;
  collection_date: string;
  service_or_event_name: string;
  collection_method: string;
  eligible_amount_pence: number;
  total_collected_pence: number;
  status: string;
  plain_status: string;
  gift_aid_claim_batch_id: string | null;
}

export type GiftAidDeclarationLinkStatus = 'active' | 'used' | 'expired' | 'revoked';

export interface GiftAidDeclarationLinkRow {
  id: string;
  workspace_id: string;
  donor_id: string | null;
  declaration_id: string | null;
  status: GiftAidDeclarationLinkStatus;
  expires_at: string;
  created_by: string | null;
  used_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
  donor_name: string | null;
  donor_email: string | null;
  declaration_status: string | null;
  declaration_pdf_download_url: string | null;
}

export interface GiftAidDeclarationLinkAdminData {
  links: GiftAidDeclarationLinkRow[];
}

export interface GiftAidDeclarationLinkPreview {
  token: string;
  link_id: string;
  status: GiftAidDeclarationLinkStatus;
  expires_at: string;
  charity_name: string;
  declaration_wording: string;
  donor_notification_notes: string;
  donor: {
    title: string | null;
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    house_name_or_number: string | null;
    address: string | null;
    postcode: string | null;
    email: string | null;
  } | null;
}

/** Dashboard metrics for the Gift Aid overview. */
export interface GiftAidDashboard {
  estimatedReclaimThisYearPence: number;
  claimedAmountPence: number;
  outstandingReclaimPence: number;
  paidAmountPence: number;
  donorsMissingDeclarations: number;
  donationsExcluded: number;
}

/** Gift Aid declaration row. */
export interface GiftAidDeclarationRow {
  id: string;
  donor_id: string;
  donor_name: string;
  declaration_type: string;
  status: 'draft' | 'active' | 'cancelled' | 'expired' | 'invalid';
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  declaration_date: string | null;
  covers_past_donations: boolean;
  hmrc_version: string | null;
  template_version: string | null;
  attachment_url: string | null;
  attachment_download_url: string | null;
  donation_amount_pence: number | null;
  charity_name: string | null;
  donor_title_snapshot: string | null;
  donor_first_name_or_initial_snapshot: string | null;
  donor_surname_snapshot: string | null;
  donor_full_home_address_snapshot: string | null;
  donor_postcode_snapshot: string | null;
  signed_date: string | null;
  taxpayer_confirmation: boolean;
  declaration_wording: string | null;
  donor_notification_notes: string | null;
  generated_pdf_storage_path: string | null;
  generated_pdf_download_url: string | null;
  notes: string | null;
  created_at: string;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancellation_evidence_notes?: string | null;
}

export type GiftAidWorkflowStage =
  | 'ingest'
  | 'match'
  | 'validate'
  | 'prepare_claim'
  | 'export'
  | 'track_audit';

export interface GiftAidWorkflowStageSummary {
  id: GiftAidWorkflowStage;
  label: string;
  description: string;
  count: number;
}

export interface GiftAidWorkflowDashboard {
  kpis: Array<{
    id: string;
    title: string;
    value: number;
    subtitle: string;
    href?: string;
  }>;
  stages: GiftAidWorkflowStageSummary[];
}

export interface GiftAidReviewQueueRow {
  donation_id: string;
  donation_date: string;
  amount_pence: number;
  source: string;
  bank_reference: string | null;
  fund_name: string | null;
  donor_id: string | null;
  donor_name: string | null;
  donor_email: string | null;
  donor_address: string | null;
  donor_postcode: string | null;
  suggested_match_id: string | null;
  suggested_donor_id: string | null;
  suggested_donor_name: string | null;
  suggested_donor_email: string | null;
  suggested_match_method: string | null;
  suggested_match_review_status: string | null;
  confidence_score: number | null;
  declaration_id: string | null;
  declaration_date: string | null;
  declaration_active: boolean;
  declaration_status: 'active' | 'cancelled' | 'expired' | 'missing';
  declaration_type: string | null;
  declaration_start_date: string | null;
  declaration_end_date: string | null;
  declaration_covers_past_donations: boolean;
  declaration_attachment_url: string | null;
  declaration_notes: string | null;
  declaration_hmrc_version: string | null;
  declaration_template_version: string | null;
  gift_aid_eligible: boolean;
  gift_aid_claim_id: string | null;
  gift_aid_status: string;
  eligibility_status: string;
  validation_issues: GiftAidValidationIssue[];
  duplicate_fingerprint: string | null;
  duplicate_warning: string | null;
  duplicate_blocking: boolean;
  duplicate_related_donation_ids: string[];
  workflow_stage: GiftAidWorkflowStage;
  queue_reason: string;
  validation_reason: string | null;
}

export interface GiftAidDonorRow {
  id: string;
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
  declaration_count: number;
  active_declaration_count: number;
  donation_count: number;
  validated_donation_count: number;
  unlinked_donation_count: number;
  latest_donation_date: string | null;
}

export interface GiftAidDonorDonationHistoryRow {
  id: string;
  donation_date: string;
  amount_pence: number;
  source: string;
  fund_name: string | null;
  bank_transaction_label: string | null;
  gift_aid_status: string;
  gift_aid_eligible: boolean;
  gift_aid_claim_batch_id: string | null;
  gift_aid_claim_reference: string | null;
  gift_aid_claimed: boolean;
}

export type GiftAidRecurringPatternType =
  | 'monthly'
  | 'weekly'
  | 'quarterly'
  | 'irregular';

/** Stored recurring donor pattern (non-dismissed rows shown on profile). */
export interface GiftAidRecurringPatternRow {
  id: string;
  pattern_type: GiftAidRecurringPatternType;
  expected_amount_pence: number;
  amount_tolerance_pence: number;
  expected_day_of_month: number | null;
  bank_reference_alias: string | null;
  confidence_score: number;
  status: 'active' | 'paused';
  grace_days: number;
  next_expected_date: string | null;
  last_occurrence_at: string | null;
  occurrence_count: number;
  updated_at: string;
}

export interface GiftAidDonorDetail {
  donor: GiftAidDonorRow;
  declarations: GiftAidDeclarationRow[];
  donations: GiftAidDonorDonationHistoryRow[];
  recurring_patterns: GiftAidRecurringPatternRow[];
  /** Open Gift Aid declaration reminders for this donor. */
  gift_aid_reminders: GiftAidReminderRow[];
}

export interface GiftAidClaimBuilderRow {
  donation_id: string;
  donor_id: string;
  donor_name: string;
  source: string;
  fund_id: string | null;
  address: string;
  postcode: string;
  donation_date: string;
  amount_pence: number;
  claimable_pence: number;
  fund_name: string | null;
  declaration_id: string | null;
  declaration_date: string | null;
  hmrc_title: string;
  hmrc_first_name_or_initial: string;
  hmrc_last_name: string;
  hmrc_house_name_or_number: string;
  hmrc_postcode: string;
  duplicate_fingerprint: string | null;
  duplicate_warning: string | null;
  duplicate_blocking: boolean;
  duplicate_related_donation_ids: string[];
}

export interface GiftAidClaimBuilderExceptionRow {
  donation_id: string;
  donor_id: string | null;
  donor_name: string | null;
  donation_date: string;
  amount_pence: number;
  source: string;
  fund_name: string | null;
  income_stream_label: string | null;
  bank_transaction_label: string | null;
  exception_codes: string[];
  exception_messages: string[];
}

export interface GiftAidClaimBuilderSummary {
  donation_count: number;
  total_donation_amount_pence: number;
  estimated_gift_aid_pence: number;
  excluded_rows_count: number;
  validation_warning_count: number;
  warning_messages: string[];
}

export interface GiftAidClaimBuilderData {
  rows: GiftAidClaimBuilderRow[];
  exceptions: GiftAidClaimBuilderExceptionRow[];
  summary: GiftAidClaimBuilderSummary;
}

export interface GiftAidClaimBuilderGasdsOption {
  id: string;
  batch_reference: string;
  collection_date: string;
  service_or_event_name: string;
  collection_method: string;
  eligible_amount_pence: number;
  claimable_pence: number;
}
