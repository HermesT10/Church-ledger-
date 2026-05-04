export const PORTAL_PAGE_KEYS = [
  'dashboard',
  'budgets',
  'submit_invoices',
  'cash_collections',
  'expenses',
  'calendar',
  'restricted_funds',
  'income_register',
  'expense_register',
  'documents',
] as const;

export const PORTAL_ACTION_KEYS = [
  'view',
  'create',
  'edit_own',
  'edit_all',
  'submit',
  'approve',
  'upload',
  'comment',
  'delete_own',
] as const;

export const PORTAL_SCOPE_KEYS = [
  'all_workspace',
  'assigned_budgets',
  'assigned_funds',
  'assigned_categories',
  'own_records',
] as const;

export type PortalPageKey = (typeof PORTAL_PAGE_KEYS)[number];
export type PortalActionKey = (typeof PORTAL_ACTION_KEYS)[number];
export type PortalScopeKey = (typeof PORTAL_SCOPE_KEYS)[number];

export const PORTAL_PAGE_LABELS: Record<PortalPageKey, string> = {
  dashboard: 'Dashboard',
  budgets: 'Budgets',
  submit_invoices: 'Submit invoices',
  cash_collections: 'Cash collections',
  expenses: 'Expenses',
  calendar: 'Calendar',
  restricted_funds: 'Restricted funds',
  income_register: 'Income register',
  expense_register: 'Expense register',
  documents: 'Documents',
};

export const PORTAL_ACTION_LABELS: Record<PortalActionKey, string> = {
  view: 'View',
  create: 'Create',
  edit_own: 'Edit own',
  edit_all: 'Edit all',
  submit: 'Submit',
  approve: 'Approve',
  upload: 'Upload',
  comment: 'Comment',
  delete_own: 'Delete own',
};

export const PORTAL_SCOPE_LABELS: Record<PortalScopeKey, string> = {
  all_workspace: 'All workspace',
  assigned_budgets: 'Assigned budgets',
  assigned_funds: 'Assigned funds',
  assigned_categories: 'Assigned categories',
  own_records: 'Own records',
};
