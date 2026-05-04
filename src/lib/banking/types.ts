/* ------------------------------------------------------------------ */
/*  Banking types (shared, not a server action file)                    */
/* ------------------------------------------------------------------ */

/* ---- CSV Import ---- */

export interface ColumnMapping {
  date: string;
  description: string;
  amount: string;
  money_in?: string;
  money_out?: string;
  reference?: string;
  balance?: string;
}

export interface ImportResult {
  total_rows: number;
  inserted_count: number;
  skipped_duplicates: number;
  errors_count: number;
  sample_errors: string[];
  donation_candidates_scanned?: number;
  donation_candidates_created?: number;
  donation_candidates_updated?: number;
  donation_candidates_skipped?: number;
  statement_import_id?: string;
  file_path?: string;
}

/* ---- Bank Account ---- */

export interface BankAccountRow {
  id: string;
  organisation_id: string;
  workspace_id?: string;
  name: string;
  account_type?:
    | 'current'
    | 'savings'
    | 'credit_card'
    | 'loan'
    | 'cash'
    | 'clearing';
  bank_name?: string | null;
  masked_account_number?: string | null;
  account_number_last4: string | null;
  sort_code: string | null;
  currency: string;
  linked_account_id: string | null;
  opening_balance?: number;
  opening_balance_date?: string | null;
  card_colour?: string | null;
  card_gradient?: string | null;
  card_theme?: string | null;
  status?: 'active' | 'archived';
  is_active: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
  archived_at?: string | null;
}

export interface BankAccountWithStats extends BankAccountRow {
  total_lines: number;
  unallocated_count: number;
  latest_balance_pence: number | null;
}

export interface BankingMoneySummary {
  statement_balance_pence: number | null;
  book_balance_pence: number | null;
  difference_pence: number | null;
}

export interface BankingHubSummary extends BankingMoneySummary {
  unreconciled_transactions: number;
  statements_imported_this_month: number;
  stale_bank_imports: number;
  possible_duplicates: number;
  last_reconciled_date: string | null;
  month_end_ready: boolean;
}

export interface BankingAccountSummary
  extends BankAccountRow, BankingMoneySummary {
  unreconciled_count: number;
  last_import_at: string | null;
  last_import_file_name: string | null;
  last_reconciled_date: string | null;
  possible_duplicates: number;
}

export interface BankingHubData {
  summary: BankingHubSummary;
  accounts: BankingAccountSummary[];
}

/* ---- Bank Line ---- */

export interface BankLineRow {
  id: string;
  organisation_id: string;
  workspace_id?: string;
  bank_account_id: string;
  statement_import_id?: string | null;
  txn_date: string;
  transaction_date?: string | null;
  transaction_time?: string | null;
  row_number?: number | null;
  description: string | null;
  additional_description?: string | null;
  display_description?: string | null;
  reference: string | null;
  amount?: number | null;
  direction?: 'in' | 'out' | null;
  money_in?: number | null;
  money_out?: number | null;
  amount_pence: number;
  balance_pence: number | null;
  running_balance?: number | null;
  fingerprint: string;
  raw: Record<string, unknown> | null;
  raw_row?: Record<string, unknown> | null;
  status?:
    | 'unmatched'
    | 'suggested_match'
    | 'matched'
    | 'reconciled'
    | 'excluded'
    | 'duplicate'
    | 'needs_review';
  matched_source_type?: string | null;
  matched_source_id?: string | null;
  posted_journal_id?: string | null;
  allocated: boolean;
  reconciled: boolean;
  reconciled_at: string | null;
  reconciled_by?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at?: string;
}

export interface BankLineWithAllocation extends BankLineRow {
  allocation: AllocationRow | null;
  matched_record_label?: string | null;
  suggested_match_label?: string | null;
  suggested_match_confidence?: 'high' | 'medium' | 'low' | null;
  suggested_match_reason?: string | null;
}

export type BankingTransactionStatusFilter =
  | 'all'
  | 'needs_matching'
  | 'reconciled'
  | 'matched'
  | 'unmatched'
  | 'duplicate'
  | 'needs_review';

export type BankingDirectionFilter = 'all' | 'in' | 'out';

/* ---- Allocation ---- */

export interface AllocationRow {
  id: string;
  organisation_id: string;
  bank_line_id: string;
  account_id: string;
  fund_id: string;
  supplier_id: string | null;
  amount_pence: number;
  created_by: string | null;
  created_at: string;
}

export interface AllocationDisplay extends AllocationRow {
  account_name: string;
  fund_name: string;
  supplier_name: string | null;
}

/* ---- Paginated response ---- */

export interface PaginatedBankLines {
  lines: BankLineWithAllocation[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/* ---- Bank Account Stats ---- */

export interface BankAccountStats {
  currentBalancePence: number | null;
  totalLines: number;
  allocatedCount: number;
  unallocatedCount: number;
  unallocatedAmountPence: number;
}

export interface BankStatementImportDisplay {
  id: string;
  file_name: string;
  file_type: string;
  status: string;
  statement_start_date: string | null;
  statement_end_date: string | null;
  rows_detected: number;
  rows_imported: number;
  duplicates_skipped: number;
  errors_count: number;
  uploaded_by: string | null;
  uploaded_at: string;
  imported_at: string | null;
  statement_warnings: BankingStatementWarning[];
  warning_status: 'clear' | 'warning';
  unreconciled_rows?: number;
  reconciled_rows?: number;
  posted_rows?: number;
  excluded_rows?: number;
}

export type BankingStatementWarningType =
  | 'date_gap'
  | 'date_overlap'
  | 'balance_mismatch';

export interface BankingStatementWarning {
  type: BankingStatementWarningType;
  severity: 'warning';
  message: string;
  previous_statement_import_id?: string | null;
  previous_statement_end_date?: string | null;
  current_statement_start_date?: string | null;
  previous_closing_balance?: number | null;
  current_opening_balance?: number | null;
}

export interface BankReconciliationCertificateDisplay {
  id: string;
  bank_account_id: string;
  statement_import_id: string | null;
  statement_period_start: string | null;
  statement_period_end: string;
  closing_bank_balance_pence: number;
  book_balance_pence: number;
  difference_pence: number;
  reconciled_transaction_count: number;
  unreconciled_exception_count: number;
  certificate_number: string;
  generated_by: string | null;
  generated_at: string;
}

export interface BankRuleRow {
  id: string;
  workspace_id: string;
  bank_account_id: string | null;
  name: string;
  priority: number;
  condition_type:
    | 'contains'
    | 'exact'
    | 'starts_with'
    | 'amount_equals'
    | 'amount_range';
  condition_value: string | null;
  direction: 'in' | 'out' | null;
  amount_min: number | null;
  amount_max: number | null;
  transaction_type:
    | 'income'
    | 'expense'
    | 'transfer'
    | 'donation'
    | 'payroll'
    | 'gift_aid_payment'
    | 'other';
  account_id: string | null;
  fund_id: string | null;
  income_stream_id: string | null;
  donor_id: string | null;
  supplier_id: string | null;
  description_template: string | null;
  auto_apply: boolean;
  status: 'active' | 'inactive';
  last_applied_at: string | null;
  last_applied_bank_transaction_id: string | null;
  applied_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BankingAuditEvent {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  user_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface BankingReconciliationSummary {
  unreconciled_count: number;
  reconciled_count: number;
  progress_percent: number;
  last_reconciled_date: string | null;
  recent_unreconciled_lines: BankLineWithAllocation[];
}

export interface BankingAccountDetailData {
  account: BankingAccountSummary;
  linked_ledger_account_name: string | null;
  linked_ledger_account: {
    id: string;
    code: string | null;
    name: string;
    type: string;
    subtype: string | null;
    status: 'linked' | 'missing' | 'invalid';
    message: string;
  } | null;
  statements: BankStatementImportDisplay[];
  certificates: BankReconciliationCertificateDisplay[];
  rules: BankRuleRow[];
  audit_events: BankingAuditEvent[];
  reconciliation: BankingReconciliationSummary;
}

export interface MonthlyBankingStat {
  /** ISO month string, e.g. "2026-01" */
  month: string;
  money_in_pence: number;
  money_out_pence: number;
}
