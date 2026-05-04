import type {
  BankStatementAmountMode,
  BankStatementColumnMeta,
  BankStatementColumnMapping,
  BankStatementFileType,
  NormalisedBankTransactionRow,
} from './statement-parser';
import type { CorrectionEventRow } from '@/lib/banking/correction-events.types';

export interface BankStatementImportRow {
  id: string;
  workspace_id: string;
  bank_account_id: string;
  file_name: string;
  file_path: string;
  file_type: BankStatementFileType | string;
  file_hash: string;
  status: string;
  statement_start_date: string | null;
  statement_end_date: string | null;
  opening_balance: number | null;
  closing_balance: number | null;
  rows_detected: number;
  rows_imported: number;
  duplicates_skipped: number;
  errors_count: number;
  parse_errors: unknown;
  statement_warnings?: unknown;
  warning_status?: 'clear' | 'warning';
  uploaded_by: string | null;
  uploaded_at: string;
  imported_at: string | null;
}

export interface StatementPreviewSummary {
  rows_detected: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  date_start: string | null;
  date_end: string | null;
  opening_balance: number | null;
  closing_balance: number | null;
}

export interface StatementPreviewResult {
  ok: boolean;
  error: string | null;
  statement_import_id: string | null;
  headers: string[];
  columns: BankStatementColumnMeta[];
  amountMode: BankStatementAmountMode;
  hasHeaders: boolean;
  saved_template_applied: boolean;
  saved_template_name: string | null;
  mapping: BankStatementColumnMapping;
  confidence: 'high' | 'medium' | 'low';
  detection_reasons: string[];
  summary: StatementPreviewSummary;
  preview_rows: NormalisedBankTransactionRow[];
  invalid_rows: NormalisedBankTransactionRow[];
}

export interface ImportParsedStatementResult {
  ok: boolean;
  error: string | null;
  statement_import_id: string | null;
  total_rows: number;
  inserted_count: number;
  skipped_duplicates: number;
  errors_count: number;
  sample_errors: string[];
  donation_candidates_scanned?: number;
  donation_candidates_created?: number;
  donation_candidates_updated?: number;
  donation_candidates_skipped?: number;
}

export type DeleteBankStatementReason =
  | 'wrong_file_uploaded'
  | 'duplicate_upload'
  | 'wrong_bank_account'
  | 'incorrect_mapping'
  | 'other';

export interface DeleteBankStatementImportResult {
  ok: boolean;
  error: string | null;
  deleted_transactions: number;
  reconciled_count: number;
  posted_count: number;
  excluded_count: number;
  file_deleted: boolean;
  storage_error?: string | null;
}

export interface BankStatementImportDetail {
  import: BankStatementImportRow;
  bank_account_id: string;
  bank_account_name: string;
  aggregates: {
    total_lines: number;
    unreconciled_rows: number;
    reconciled_rows: number;
    posted_rows: number;
    excluded_rows: number;
    lines_needing_undo: number;
    gift_aid_locked_match_count: number;
  };
  correction_events: CorrectionEventRow[];
}

export interface RemoveBankStatementImportWithOptionsResult {
  ok: boolean;
  error: string | null;
  deleted_transactions: number;
  file_deleted: boolean;
  unreconciled_line_count: number;
  storage_error?: string | null;
  correction_event_error?: string | null;
}
