export type TransactionType = 'income' | 'expense' | 'transfer' | 'adjustment';

export type TransactionStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'awaiting_bank_match'
  | 'matched'
  | 'reconciled'
  | 'posted'
  | 'rejected'
  | 'voided';

export type TransactionLineDirection = 'in' | 'out';
export type TransactionMatchStatus = 'suggested' | 'confirmed' | 'rejected';
export type MatchConfidence = 'high' | 'medium' | 'low';

export interface ManualTransactionLineInput {
  fund_id?: string | null;
  account_id: string;
  income_stream_id?: string | null;
  description?: string | null;
  amount_pence: number;
  direction: TransactionLineDirection;
}

export interface ManualTransactionInput {
  type: TransactionType;
  transaction_date: string;
  amount_pence: number;
  description: string;
  payee_payer_name?: string | null;
  reference?: string | null;
  payment_method?: string | null;
  expected_bank_account_id?: string | null;
  requires_bank_match?: boolean;
  duplicate_override_reason?: string | null;
  lines: ManualTransactionLineInput[];
}

export interface ManualTransactionRow {
  id: string;
  organisation_id: string;
  type: TransactionType;
  transaction_date: string;
  amount_pence: number;
  description: string;
  payee_payer_name: string | null;
  supplier_id?: string | null;
  reference: string | null;
  payment_method: string | null;
  expected_bank_account_id: string | null;
  status: TransactionStatus;
  approval_status: string | null;
  requires_bank_match: boolean;
  matched_bank_transaction_id: string | null;
  posted_journal_id: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  reconciled_at: string | null;
  posted_at: string | null;
  created_at: string;
  updated_at: string;
  voided_at: string | null;
  void_reason: string | null;
  duplicate_override_reason: string | null;
  transfer_from_account_id?: string | null;
  transfer_to_account_id?: string | null;
  reconciliation_metadata?: Record<string, unknown> | null;
}

export interface ManualTransactionLineRow {
  id: string;
  organisation_id: string;
  manual_transaction_id: string;
  fund_id: string | null;
  account_id: string;
  income_stream_id: string | null;
  description: string | null;
  amount_pence: number;
  direction: TransactionLineDirection;
  line_order: number;
  created_at: string;
}

export interface TransactionAttachmentRow {
  id: string;
  organisation_id: string;
  manual_transaction_id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number;
  file_hash: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface TransactionMatchRow {
  id: string;
  organisation_id: string;
  bank_line_id: string;
  manual_transaction_id: string;
  match_status: TransactionMatchStatus;
  confidence_score: number;
  confidence_label: MatchConfidence;
  match_reason: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
}

export interface TransactionListRow extends ManualTransactionRow {
  created_by_name?: string | null;
  line_count: number;
  attachment_count: number;
  match_count: number;
  fund_names: string[];
  account_names: string[];
}

export interface TransactionSummary {
  awaitingBankMatch: number;
  drafts: number;
  reconciledThisMonth: number;
  missingReceipts: number;
  possibleDuplicates: number;
}

export interface DuplicateCandidate {
  id: string;
  transaction_date: string;
  amount_pence: number;
  description: string;
  payee_payer_name: string | null;
  reference: string | null;
  status: TransactionStatus;
  score: number;
  reasons: string[];
}

export interface MatchSuggestion {
  bank_line_id: string;
  manual_transaction_id: string;
  confidence_score: number;
  confidence_label: MatchConfidence;
  match_reason: string;
  bank_description: string | null;
  bank_reference: string | null;
  bank_amount_pence: number;
  bank_txn_date: string;
}
