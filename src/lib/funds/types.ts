/* ------------------------------------------------------------------ */
/*  Charity Funds — shared types                                       */
/* ------------------------------------------------------------------ */

export type FundType = 'restricted' | 'unrestricted' | 'designated';

export interface FundRow {
  id: string;
  organisation_id: string;
  name: string;
  type: FundType;
  purpose_text: string | null;
  reporting_group: string | null;
  is_active: boolean;
  created_at: string;
}

export interface FundWithStats extends FundRow {
  transaction_count: number;
  balance_pence: number;
  /** Period income (credit to income accounts). Only populated when period is selected. */
  income_pence: number;
  /** Period expenses (debit to expense accounts). Only populated when period is selected. */
  expense_pence: number;
  /** net_movement = income - expense for the period */
  net_movement_pence: number;
}

/* ------------------------------------------------------------------ */
/*  Overspend detection                                                */
/* ------------------------------------------------------------------ */

export type OverspendStatus = 'ok' | 'overspent' | 'overdrawn' | 'attention';

export function getOverspendStatus(type: FundType, balancePence: number): OverspendStatus {
  if (balancePence >= 0) return 'ok';
  if (type === 'restricted') return 'overspent';
  if (type === 'designated') return 'overdrawn';
  return 'attention';
}

export const OVERSPEND_LABELS: Record<OverspendStatus, string> = {
  ok: 'OK',
  overspent: 'Overspent',
  overdrawn: 'Overdrawn',
  attention: 'Attention',
};

/* ------------------------------------------------------------------ */
/*  Fund detail drill-down types                                       */
/* ------------------------------------------------------------------ */

export interface FundAccountBreakdown {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  total_debit_pence: number;
  total_credit_pence: number;
  /** Net amount relevant to the account type:
   *  income = credit - debit, expense = debit - credit */
  net_pence: number;
  line_count: number;
}

export interface FundTransaction {
  journal_line_id: string;
  journal_id: string;
  journal_date: string;
  journal_memo: string | null;
  account_code: string;
  account_name: string;
  account_type: string;
  description: string | null;
  debit_pence: number;
  credit_pence: number;
}

export interface FundDetailStats {
  opening_balance_pence: number;
  income_pence: number;
  expense_pence: number;
  net_movement_pence: number;
  closing_balance_pence: number;
}

/* ------------------------------------------------------------------ */
/*  Period presets                                                      */
/* ------------------------------------------------------------------ */

export type PeriodPreset = 'this_month' | 'last_month' | 'ytd' | 'custom';

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  this_month: 'This Month',
  last_month: 'Last Month',
  ytd: 'Year to Date',
  custom: 'Custom',
};

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const FUND_TYPE_LABELS: Record<FundType, string> = {
  unrestricted: 'Unrestricted',
  restricted: 'Restricted',
  designated: 'Designated',
};

export const FUND_TYPES: FundType[] = [
  'unrestricted',
  'restricted',
  'designated',
];
