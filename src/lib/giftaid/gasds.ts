/**
 * Helpers for Gift Aid Small Donations Scheme (GASDS) — non-server utilities.
 */

export const CLAIM_ITEM_STANDARD_GIFT_AID = 'standard_gift_aid' as const;
export const CLAIM_ITEM_GASDS = 'gasds' as const;
export type GiftAidClaimItemType =
  | typeof CLAIM_ITEM_STANDARD_GIFT_AID
  | typeof CLAIM_ITEM_GASDS;

/** UK tax year starts 6 April (same basis as HMRC Gift Aid conventions in this codebase). */
export function ukTaxYearStartDate(now = new Date()): Date {
  const y = now.getFullYear();
  const month = now.getMonth();
  const dom = now.getDate();
  const april = month > 3 || (month === 3 && dom >= 6);
  const startYear = april ? y : y - 1;
  return new Date(Date.UTC(startYear, 3, 6));
}

export function gasdsClaimAmountPence(eligibleAmountPence: number): number {
  return Math.round(Number(eligibleAmountPence) * 0.25);
}

/** Placeholder HMRC-style snapshots for DB NOT NULLcolumns (lines are exported on a separate GASDS worksheet). */
export function gasdsClaimLineSnapshots(input: {
  batch_reference: string;
  collection_date: string;
  service_or_event_name: string;
}) {
  const detail = `${input.collection_date} · ${input.service_or_event_name}`.slice(0, 240);
  return {
    donor_name_snapshot: 'Gift Aid Small Donations Scheme (GASDS)',
    donor_address_snapshot: detail || null,
    donor_postcode_snapshot: 'ZZ99 9ZZ',
    donor_title_snapshot: '—',
    donor_first_name_or_initial_snapshot: 'GASDS',
    donor_last_name_snapshot: input.batch_reference.slice(0, 120),
    donor_house_name_or_number_snapshot: '—',
  };
}

export function plainGasdsBatchStatusLabel(status: string): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'ready':
      return 'Ready for claim';
    case 'included_in_claim':
      return 'In claim batch';
    case 'claimed':
      return 'Claim submitted';
    case 'rejected':
      return 'Rejected';
    case 'voided':
      return 'Voided';
    default:
      return status;
  }
}

export interface GasdsBatchEligibleForClaim {
  id: string;
  batch_reference: string;
  collection_date: string;
  service_or_event_name: string;
  collection_method: string;
  total_collected_pence: number;
  eligible_amount_pence: number;
  excluded_amount_pence: number;
  linked_bank_transaction_id: string | null;
  evidence_storage_path: string | null;
  gift_aid_claim_batch_id: string | null;
  status: string;
}
