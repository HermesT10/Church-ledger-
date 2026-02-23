/* ------------------------------------------------------------------ */
/*  Chart of Accounts — shared types                                   */
/* ------------------------------------------------------------------ */

export type AccountType = 'income' | 'expense' | 'asset' | 'liability' | 'equity';

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
}

export interface AccountWithStats extends AccountRow {
  transaction_count: number;
  balance_pence: number;
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  income: 'Income',
  expense: 'Expense',
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
};

export const ACCOUNT_TYPES: AccountType[] = [
  'income',
  'expense',
  'asset',
  'liability',
  'equity',
];
