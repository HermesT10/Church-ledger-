/* Types and constants for giving platforms (shared, not a server action file) */

export interface GivingPlatformRow {
  id: string;
  provider: string;
  clearing_account_id: string;
  clearing_account_code: string;
  clearing_account_name: string;
  fee_account_id: string;
  fee_account_code: string;
  fee_account_name: string;
  donations_income_account_id: string | null;
  donations_income_account_code: string;
  donations_income_account_name: string;
  is_active: boolean;
}

export const PROVIDER_LABELS: Record<string, string> = {
  gocardless: 'GoCardless',
  sumup: 'SumUp',
  izettle: 'iZettle',
};
