/* ------------------------------------------------------------------ */
/*  Reconciliation types (shared, not a server action file)            */
/* ------------------------------------------------------------------ */

/* ---- Journal matching (existing) ---- */

export interface UnreconciledBankLine {
  id: string;
  txn_date: string;
  description: string | null;
  reference: string | null;
  amount_pence: number;
  balance_pence: number | null;
}

export interface ReconciledBankLine {
  id: string;
  txn_date: string;
  description: string | null;
  reference: string | null;
  amount_pence: number;
  match_id: string;
  match_type: string;
  match_provider: string | null;
  journal_id: string;
  journal_memo: string | null;
  journal_date: string | null;
}

export interface ReconciliationStats {
  totalLines: number;
  reconciledCount: number;
  unreconciledCount: number;
  unreconciledAmountPence: number;
}

/* ---- Statement reconciliation (new) ---- */

export interface ReconciliationRow {
  id: string;
  organisation_id: string;
  bank_account_id: string;
  statement_date: string;
  statement_closing_balance_pence: number;
  opening_balance_pence: number;
  cleared_balance_pence: number | null;
  lines_cleared: number;
  reconciled_by: string | null;
  reconciled_at: string | null;
  locked: boolean;
  created_at: string;
}

export interface ReconciliationWithMeta extends ReconciliationRow {
  reconciled_by_name: string | null;
  bank_account_name: string;
}

export interface ClearableBankLine {
  id: string;
  txn_date: string;
  description: string | null;
  reference: string | null;
  amount_pence: number;
  balance_pence: number | null;
  allocated: boolean;
  cleared: boolean;
}

export interface ReconciliationSummary {
  openingBalancePence: number;
  clearedTotalPence: number;
  statementBalancePence: number;
  differencePence: number;
  clearedCount: number;
  totalLines: number;
  isBalanced: boolean;
}

/* ---- GL-based reconciliation ---- */

export interface GLReconciliationData {
  glBalancePence: number;
  statementBalancePence: number | null;
  differencePence: number;
  isReconciled: boolean;
}
