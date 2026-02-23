/* ------------------------------------------------------------------ */
/*  Donations — shared types                                           */
/* ------------------------------------------------------------------ */

export type DonationChannel =
  | 'online'
  | 'direct_debit'
  | 'standing_order'
  | 'cash'
  | 'bank_transfer'
  | 'other';

export const DONATION_CHANNELS: DonationChannel[] = [
  'online',
  'direct_debit',
  'standing_order',
  'cash',
  'bank_transfer',
  'other',
];

export const CHANNEL_LABELS: Record<DonationChannel, string> = {
  online: 'Online',
  direct_debit: 'Direct Debit',
  standing_order: 'Standing Order',
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  other: 'Other',
};

/* ------------------------------------------------------------------ */
/*  Donation row                                                       */
/* ------------------------------------------------------------------ */

export interface DonationRow {
  id: string;
  organisation_id: string;
  donor_id: string | null;
  donor_name: string | null;
  donation_date: string;
  channel: DonationChannel;
  source: string;
  fund_id: string | null;
  fund_name: string | null;
  gross_amount_pence: number;
  fee_amount_pence: number;
  net_amount_pence: number;
  provider_reference: string | null;
  gift_aid_eligible: boolean;
  gift_aid_claim_id: string | null;
  import_batch_id: string | null;
  journal_id: string | null;
  status: 'draft' | 'posted';
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Recurring donations                                                */
/* ------------------------------------------------------------------ */

export type RecurringFrequency = 'weekly' | 'monthly' | 'quarterly' | 'annually';
export type RecurringStatus = 'active' | 'paused' | 'cancelled';

export const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Annually',
};

export const RECURRING_STATUS_LABELS: Record<RecurringStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  cancelled: 'Cancelled',
};

export interface RecurringDonationRow {
  id: string;
  donor_id: string;
  donor_name: string | null;
  fund_id: string | null;
  fund_name: string | null;
  amount_pence: number;
  frequency: RecurringFrequency;
  next_due_date: string | null;
  channel: DonationChannel;
  provider_reference: string | null;
  status: RecurringStatus;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Dashboard                                                          */
/* ------------------------------------------------------------------ */

export interface DonationsDashboard {
  totalThisMonthPence: number;
  totalYtdPence: number;
  onlinePence: number;
  cashPence: number;
  recurringTotalPence: number;
  giftAidEstimatePence: number;
  platformFeesPence: number;
  donationCount: number;
  donorCount: number;
}
