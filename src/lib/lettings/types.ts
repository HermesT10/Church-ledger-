export type LettingsHirerStatus = 'active' | 'inactive' | 'archived';
export type LettingsChargeStatus = 'expected' | 'paid' | 'part_paid' | 'overdue' | 'waived' | 'cancelled';
export type LettingsPaymentStatus = 'matched' | 'reconciled' | 'voided';

export interface LettingsHirerRow {
  id: string;
  organisation_id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  default_room_name: string | null;
  default_rate_pence: number | null;
  default_fund_id: string | null;
  default_income_account_id: string | null;
  status: LettingsHirerStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface LettingsChargeRow {
  id: string;
  organisation_id: string;
  hirer_id: string;
  period_year: number;
  period_month: number;
  description: string | null;
  expected_amount_pence: number;
  paid_amount_pence: number;
  outstanding_amount_pence: number;
  status: LettingsChargeStatus;
  due_date: string | null;
  default_fund_id: string | null;
  default_income_account_id: string | null;
  waived_reason: string | null;
  cancelled_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LettingsPaymentRow {
  id: string;
  organisation_id: string;
  hirer_id: string;
  lettings_charge_id: string | null;
  bank_transaction_id: string | null;
  transaction_id: string | null;
  posted_journal_id: string | null;
  payment_date: string;
  amount_pence: number;
  status: LettingsPaymentStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  voided_at: string | null;
  void_reason: string | null;
}

export interface LettingsRegisterMonth {
  month: number;
  chargeId: string | null;
  expectedPence: number;
  paidPence: number;
  outstandingPence: number;
  status: LettingsChargeStatus | 'not_set';
}

export interface LettingsRegisterHirer {
  hirer: LettingsHirerRow;
  months: LettingsRegisterMonth[];
  totalExpectedPence: number;
  totalPaidPence: number;
  totalOutstandingPence: number;
  status: 'clear' | 'outstanding' | 'inactive';
}

export interface LettingsSummary {
  incomeThisYearPence: number;
  incomeThisMonthPence: number;
  outstandingPence: number;
  overdueCount: number;
  activeHirerCount: number;
  expectedThisYearPence: number;
}

export interface LettingsYearData {
  year: number;
  summary: LettingsSummary;
  hirers: LettingsRegisterHirer[];
  monthlyTotals: Array<{
    month: number;
    expectedPence: number;
    paidPence: number;
    outstandingPence: number;
  }>;
}
