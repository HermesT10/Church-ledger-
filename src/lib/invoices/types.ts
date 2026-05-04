import type { AccountType } from '@/lib/accounts/types';

export type InvoiceDirection = 'payable' | 'receivable';

export type InvoiceHubTab = 'bills-to-pay' | 'owed-to-us' | 'all' | 'drafts' | 'overdue';

export type ReceivableInvoiceStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'voided';

export type PayableBillStatus = 'draft' | 'approved' | 'posted' | 'paid';

export type InvoiceLineDraftInput = {
  accountId: string;
  fundId: string;
  description?: string | null;
  amountPence: number;
};

export type CreatePayableBillInput = {
  supplierId: string;
  billNumber?: string | null;
  billDate: string;
  dueDate?: string | null;
  totalPence: number;
  attachmentUrl?: string | null;
  lines: InvoiceLineDraftInput[];
};

export type CreateReceivableInvoiceInput = {
  hirerId: string;
  invoiceNumber?: string | null;
  invoiceDate: string;
  dueDate?: string | null;
  totalPence: number;
  linkedLettingChargeId?: string | null;
  notes?: string | null;
  message?: string | null;
  lines: InvoiceLineDraftInput[];
};

export type InvoiceFormOptions = {
  suppliers: { id: string; name: string; default_account_id: string | null; default_fund_id: string | null }[];
  hirers: { id: string; name: string; email: string | null; default_income_account_id: string | null; default_fund_id: string | null }[];
  funds: { id: string; name: string }[];
  expenseAccounts: { id: string; code: string; name: string; type: AccountType }[];
  incomeAccounts: { id: string; code: string; name: string; type: AccountType }[];
};

export type PayableInvoiceListItem = {
  id: string;
  direction: 'payable';
  counterpartyName: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  dueDate: string | null;
  totalPence: number;
  status: PayableBillStatus;
  paymentStatus: 'unpaid' | 'scheduled_for_payment' | 'paid';
  href: string;
};

export type ReceivableInvoiceListItem = {
  id: string;
  direction: 'receivable';
  counterpartyName: string;
  invoiceNumber: string | null;
  invoiceDate: string;
  dueDate: string | null;
  totalPence: number;
  paidPence: number;
  status: ReceivableInvoiceStatus;
  paymentStatus: 'unpaid' | 'partially_paid' | 'paid';
  href: string;
  generatedPdfStoragePath: string | null;
};

export type InvoiceHubItem = PayableInvoiceListItem | ReceivableInvoiceListItem;

export type InlineSupplierInput = {
  name: string;
  contactEmail?: string | null;
  phone?: string | null;
  address?: string | null;
  defaultExpenseAccountId?: string | null;
  defaultFundId?: string | null;
  bankReferenceAlias?: string | null;
  notes?: string | null;
};

export type InlineHirerInput = {
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  defaultIncomeAccountId?: string | null;
  defaultFundId?: string | null;
  notes?: string | null;
};

export type InlineAccountInput = {
  name: string;
  type: 'income' | 'expense';
  parentAccountId?: string | null;
  description?: string | null;
  defaultFundId?: string | null;
};
