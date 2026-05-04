/* ------------------------------------------------------------------ */
/*  Workflow types (shared, not a server action file)                   */
/* ------------------------------------------------------------------ */

export type InvoiceSubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'change_requested'
  | 'scheduled_for_payment'
  | 'paid'
  | 'voided';

export interface InvoiceSubmissionRow {
  id: string;
  organisationId: string;
  submittedBy: string;
  submitterName: string | null;
  supplierName: string;
  supplierId: string | null;
  invoiceNumber: string | null;
  invoiceDate: string;
  amountPence: number;
  budgetId: string | null;
  budgetName: string | null;
  fundId: string | null;
  fundName: string | null;
  accountId: string | null;
  accountName: string | null;
  description: string | null;
  attachmentUrl: string | null;
  attachmentPath: string | null;
  attachmentFileName: string | null;
  status: InvoiceSubmissionStatus;
  reviewedBy: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  billId: string | null;
  paymentRunId: string | null;
  submittedAt: string | null;
  underReviewAt: string | null;
  changeRequestedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  paidAt: string | null;
  adminNote: string | null;
  requestChangesNote: string | null;
  createdAt: string;
}

export interface PortalInvoiceFormOptions {
  suppliers: { id: string; name: string }[];
  funds: { id: string; name: string }[];
  budgets: { id: string; name: string; year: number | null; canSubmitAgainst: boolean }[];
  expenseAccounts: { id: string; code: string; name: string }[];
}

export interface ExpenseRequestRow {
  id: string;
  organisationId: string;
  submittedBy: string;
  submitterName: string | null;
  spendDate: string;
  amountPence: number;
  fundId: string | null;
  fundName: string | null;
  accountId: string;
  accountName: string | null;
  description: string;
  receiptUrl: string | null;
  receiptLate: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'converted';
  reviewedBy: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  cashSpendId: string | null;
  createdAt: string;
}

export interface ConversationRow {
  id: string;
  organisationId: string;
  subject: string | null;
  createdBy: string;
  creatorName: string | null;
  participantCount: number;
  unreadCount: number;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface MessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string | null;
  content: string;
  attachmentUrl: string | null;
  createdAt: string;
}

export interface ApprovalCounts {
  pendingInvoices: number;
  pendingExpenses: number;
  lateReceipts: number;
  unreadMessages: number;
}
