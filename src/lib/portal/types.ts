import type { PortalPermissionSet } from '@/lib/portal-permissions';

export type PortalTaskStatus = 'open' | 'in_progress' | 'done';
export type PortalNotificationType =
  | 'invoice_submitted'
  | 'invoice_under_review'
  | 'invoice_approved'
  | 'invoice_rejected'
  | 'invoice_changes_requested'
  | 'invoice_scheduled'
  | 'invoice_paid'
  | 'invoice_voided'
  | 'expense_submitted'
  | 'expense_changes_requested'
  | 'expense_approved'
  | 'expense_rejected'
  | 'expense_awaiting_bank_match'
  | 'expense_paid'
  | 'expense_reconciled'
  | 'expense_voided'
  | 'cash_collection_submitted'
  | 'cash_collection_reviewed'
  | 'cash_collection_rejected'
  | 'cash_collection_converted'
  | 'cash_collection_banked'
  | 'cash_collection_reconciled'
  | 'budget_changed'
  | 'event_assigned'
  | 'task_due'
  | 'general';

export interface PortalAssignedBudget {
  id: string;
  name: string;
  year: number;
  status: string;
  canView: boolean;
  canSubmitAgainst: boolean;
  spendingLimit: number | null;
  budgetPence: number;
  usedPence: number;
  remainingPence: number;
}

export interface PortalTask {
  id: string;
  title: string;
  description: string | null;
  dueAt: string | null;
  status: PortalTaskStatus;
  assignedBy: string | null;
  updatedBy: string | null;
  calendarEvent: {
    id: string;
    title: string;
    startAt: string;
    href: string;
  } | null;
}

export interface PortalUpcomingEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  status: string;
  response: string | null;
  href: string;
}

export interface PortalSubmission {
  id: string;
  type: 'invoice' | 'expense' | 'cash_collection';
  title: string;
  amountPence: number;
  status: string;
  createdAt: string;
  href: string;
}

export interface PortalRestrictedFundSummary {
  id: string;
  name: string;
  balancePence: number;
  canSubmitAgainst: boolean;
}

export interface PortalNotification {
  id: string;
  type: PortalNotificationType;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface PortalDashboardData {
  permissions: PortalPermissionSet;
  assignedBudgets: PortalAssignedBudget[];
  tasks: PortalTask[];
  upcomingEvents: PortalUpcomingEvent[];
  pendingSubmissions: PortalSubmission[];
  approvedPaidUpdates: PortalSubmission[];
  cashCollections: PortalSubmission[];
  expenses: PortalSubmission[];
  invoices: PortalSubmission[];
  notifications: PortalNotification[];
  restrictedFunds: PortalRestrictedFundSummary[];
}
