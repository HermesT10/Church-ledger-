/* Giving types (shared, not a server action file) */

export type GivingProvider = 'gocardless' | 'sumup' | 'izettle';

export interface DetectedColumns {
  date: string;
  grossAmount: string;
  feeAmount: string | null;
  netAmount: string | null;
  donorName: string | null;
  reference: string | null;
  payoutReference: string | null;
  status: string | null;
}

export interface NormalizedRow {
  txn_date: string;
  gross_amount_pence: number;
  fee_amount_pence: number;
  net_amount_pence: number;
  donor_name: string | null;
  reference: string | null;
  payout_reference: string | null;
  raw: Record<string, string>;
}

export interface GivingImportResult {
  importId: string;
  total_rows: number;
  inserted_count: number;
  skipped_count: number;
  error_count: number;
  journals_created: number;
  sample_errors: string[];
}

export interface GivingImportSummary {
  id: string;
  provider: string;
  import_start: string | null;
  import_end: string | null;
  file_name: string | null;
  status: string;
  inserted_count: number;
  skipped_count: number;
  error_count: number;
  journals_created: number;
  created_at: string;
}

export interface GivingImportRowView {
  id: string;
  txn_date: string;
  gross_amount_pence: number;
  fee_amount_pence: number;
  net_amount_pence: number;
  donor_name: string | null;
  reference: string | null;
  payout_reference: string | null;
}
