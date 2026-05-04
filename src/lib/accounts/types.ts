/* ------------------------------------------------------------------ */
/*  Chart of Accounts — shared types                                   */
/* ------------------------------------------------------------------ */

/** Postgres enum plus legacy reads (`equity` migrated to fund_balance in 00072). */
export type AccountType =
  | 'income'
  | 'expense'
  | 'asset'
  | 'liability'
  /** Charity-native reserves / restricted-net positioning */
  | 'fund_balance'
  /** Deprecated PG enum value — remap UX label only when stale reads linger */
  | 'equity';

export interface AccountRow {
  id: string;
  organisation_id: string;
  code: string;
  name: string;
  type: AccountType;
  reporting_category: string | null;
  parent_id: string | null;
  is_active: boolean;
  created_at: string;
  subtype?: string | null;
  description?: string | null;
  normal_balance?: string | null;
  is_system_account?: boolean;
  allow_direct_posting?: boolean;
  available_in_reconciliation?: boolean;
  available_in_donations?: boolean;
  available_in_invoices?: boolean;
  available_in_payroll?: boolean;
  default_fund_id?: string | null;
  created_by?: string | null;
  updated_at?: string | null;
  archived_at?: string | null;
}

export interface AccountWithStats extends AccountRow {
  transaction_count: number;
  balance_pence: number;
}

/** Tabs / navigation order */
export const ACCOUNT_TYPES_NAV: AccountType[] = [
  'asset',
  'liability',
  'income',
  'expense',
  'fund_balance',
];

export const ACCOUNT_TYPES_LEGACY_EXTENDED: AccountType[] = [
  ...ACCOUNT_TYPES_NAV.filter((t) => t !== 'fund_balance'),
  'equity',
];

/** Canonical iteration — excludes obsolete equity */
export const ACCOUNT_TYPES: AccountType[] = ACCOUNT_TYPES_NAV;

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  income: 'Income',
  expense: 'Expense',
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity (legacy)',
  fund_balance: 'Fund balance / Reserve',
};
