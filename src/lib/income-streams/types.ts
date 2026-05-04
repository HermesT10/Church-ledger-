export type IncomeStreamStatus = 'active' | 'archived';

export interface IncomeStreamRow {
  id: string;
  organisation_id: string;
  code: string;
  name: string;
  description: string | null;
  default_fund_id: string | null;
  default_income_account_id: string | null;
  status: IncomeStreamStatus;
  created_at: string;
  updated_at: string;
}
