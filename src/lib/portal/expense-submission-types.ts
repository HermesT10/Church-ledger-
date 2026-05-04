export type PortalExpenseSubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'changes_requested'
  | 'approved'
  | 'rejected'
  | 'awaiting_bank_match'
  | 'paid'
  | 'reconciled'
  | 'voided';

export type PortalExpenseMethod = 'cash' | 'card' | 'cheque' | 'bank_transfer';

export interface PortalExpenseSubmissionRow {
  id: string;
  workspace_id: string;
  submitted_by: string;
  expense_date: string;
  amount_pence: number;
  detail: string;
  method: PortalExpenseMethod;
  supplier_id: string | null;
  supplier_name: string | null;
  budget_id: string | null;
  budget_category_id: string | null;
  fund_id: string | null;
  account_id: string | null;
  reimbursement_required: boolean;
  card_assignment_id: string | null;
  receipt_url: string | null;
  receipt_path: string | null;
  receipt_required: boolean;
  overspend_warning: string | null;
  overspend_allowed: boolean;
  admin_notes: string | null;
  change_request_note: string | null;
  status: PortalExpenseSubmissionStatus;
  approved_by: string | null;
  approved_at: string | null;
  linked_manual_transaction_id: string | null;
  linked_bank_transaction_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PortalExpenseOption {
  id: string;
  name: string;
  secondary?: string | null;
  canSubmitAgainst?: boolean;
}

export interface PortalExpenseCardOption extends PortalExpenseOption {
  bankAccountId: string | null;
  lastFour: string | null;
  spendingLimit: number | null;
}

export interface PortalExpenseBudgetOption extends PortalExpenseOption {
  budgetCategoryId: string | null;
  spendingLimit: number | null;
  remainingPence: number | null;
}

export interface PortalExpenseOverspendWarning {
  blocked: boolean;
  message: string | null;
  remainingPence: number | null;
}

export interface PortalExpenseSubmissionFormOptions {
  receiptsRequired: boolean;
  allowOverspendSubmission: boolean;
  budgets: PortalExpenseBudgetOption[];
  funds: PortalExpenseOption[];
  accounts: PortalExpenseOption[];
  cards: PortalExpenseCardOption[];
  suppliers: PortalExpenseOption[];
}
