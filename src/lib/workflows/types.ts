/* ------------------------------------------------------------------ */
/*  Workflow types (shared, not a server action file)                   */
/* ------------------------------------------------------------------ */

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
  fundId: string | null;
  fundName: string | null;
  accountId: string | null;
  accountName: string | null;
  description: string | null;
  attachmentUrl: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'converted';
  reviewedBy: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  billId: string | null;
  createdAt: string;
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
