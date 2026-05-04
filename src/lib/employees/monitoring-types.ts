import type { PortalPermissionSet } from '@/lib/portal-permissions';

export interface EmployeeMonitoringOverview {
  monitoredUserId: string | null;
  latestInviteStatus: string | null;
  enabledPageCount: number;
  enabledActionCount: number;
  enabledScopeCount: number;
  budgetAssignmentCount: number;
  fundAssignmentCount: number;
  cardAssignmentCount: number;
}

export interface EmployeeBudgetUsageRow {
  assignmentId: string;
  budgetId: string;
  budgetName: string;
  categoryId: string | null;
  categoryName: string | null;
  annualAllocationPence: number;
  monthlyAllocationPence: number[];
  usedPence: number;
  pendingPence: number;
  remainingPence: number;
  overspendRisk: 'ok' | 'attention' | 'overspent';
  linkedTransactions: EmployeeMonitoringTransaction[];
}

export interface EmployeeMonitoringSubmission {
  id: string;
  type: 'invoice' | 'expense' | 'cash_collection';
  title: string;
  amountPence: number;
  status: string;
  submittedAt: string;
  note: string | null;
  href: string;
}

export interface EmployeeMonitoringTransaction {
  id: string;
  type: 'manual_transaction' | 'bank_line' | 'journal_line';
  date: string;
  description: string;
  amountPence: number;
  status: string;
  reconciled: boolean;
  href: string | null;
}

export interface EmployeeMonitoringCard {
  id: string;
  cardName: string;
  lastFour: string | null;
  bankAccountName: string | null;
  spendingLimitPence: number | null;
  spentPence: number;
  remainingPence: number | null;
  status: string;
  linkedTransactions: EmployeeMonitoringTransaction[];
}

export interface EmployeeMonitoringCalendarItem {
  id: string;
  type: 'created_event' | 'attended_event' | 'task';
  title: string;
  date: string | null;
  status: string;
  href: string | null;
}

export interface EmployeeMonitoringActivityItem {
  id: string;
  type: string;
  title: string;
  description: string | null;
  occurredAt: string;
  sourceType: string | null;
  sourceId: string | null;
  severity: 'info' | 'success' | 'warning' | 'danger';
  href: string | null;
}

export interface EmployeeMonitoringData {
  overview: EmployeeMonitoringOverview;
  permissions: PortalPermissionSet | null;
  budgetUsage: EmployeeBudgetUsageRow[];
  submissions: EmployeeMonitoringSubmission[];
  transactions: EmployeeMonitoringTransaction[];
  cards: EmployeeMonitoringCard[];
  calendar: EmployeeMonitoringCalendarItem[];
  activity: EmployeeMonitoringActivityItem[];
}
