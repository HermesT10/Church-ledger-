/* Gift Aid types (shared, not a server action file) */

export interface GiftAidClaimRow {
  id: string;
  claim_start: string;
  claim_end: string;
  created_at: string;
  submitted_at: string | null;
  paid_at: string | null;
  reference: string | null;
  status: 'draft' | 'submitted' | 'paid';
  donation_count: number;
  eligible_amount_pence: number;
  claimable_total_pence: number;
  journal_id: string | null;
}

export interface GiftAidClaimDetail {
  id: string;
  claim_start: string;
  claim_end: string;
  created_at: string;
  submitted_at: string | null;
  paid_at: string | null;
  reference: string | null;
  status: 'draft' | 'submitted' | 'paid';
  created_by: string | null;
  journal_id: string | null;
  total_donations_pence: number | null;
  total_gift_aid_pence: number | null;
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
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  declaration_date: string | null;
  hmrc_version: string | null;
  template_version: string | null;
  attachment_url: string | null;
  created_at: string;
}
