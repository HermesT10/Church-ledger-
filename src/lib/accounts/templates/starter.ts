/**
 * Starter church chart of accounts — seeded data for onboarding/import.
 */

export interface TemplateAccountRow {
  code: string;
  name: string;
  type: 'income' | 'expense' | 'asset' | 'liability' | 'fund_balance';
  reporting_category: string;
  subtype?: string;
}

/** Core COA duplicated from settings seed until larger/charity templates diverge further */
export const STARTER_ACCOUNTS_CHART: TemplateAccountRow[] = [
  { code: 'INC-001', name: 'Donations-General', type: 'income', reporting_category: 'Tithes & Offerings', subtype: 'Giving' },
  { code: 'INC-002', name: 'Donations-Restricted', type: 'income', reporting_category: 'Tithes & Offerings', subtype: 'Giving' },
  { code: 'INC-003', name: 'Gift Aid', type: 'income', reporting_category: 'Tax Recovery', subtype: 'Gift Aid' },
  { code: 'INC-004', name: 'Lettings/Hall Hire', type: 'income', reporting_category: 'Other Income', subtype: 'Lettings' },
  { code: 'INC-005', name: 'Grants', type: 'income', reporting_category: 'Other Income', subtype: 'Grants' },
  { code: 'INC-006', name: 'Fundraising/Events', type: 'income', reporting_category: 'Other Income', subtype: 'Events' },
  { code: 'EXP-001', name: 'Salaries', type: 'expense', reporting_category: 'Staff Costs', subtype: 'Staff' },
  { code: 'EXP-002', name: 'Employer NIC', type: 'expense', reporting_category: 'Staff Costs', subtype: 'Staff' },
  { code: 'EXP-003', name: 'Pension', type: 'expense', reporting_category: 'Staff Costs', subtype: 'Staff' },
  { code: 'EXP-004', name: 'Utilities', type: 'expense', reporting_category: 'Premises Costs', subtype: 'Premises' },
  { code: 'EXP-005', name: 'Insurance', type: 'expense', reporting_category: 'Premises Costs', subtype: 'Premises' },
  { code: 'EXP-006', name: 'Maintenance & Repairs', type: 'expense', reporting_category: 'Premises Costs', subtype: 'Premises' },
  { code: 'EXP-007', name: 'Ministry Activities', type: 'expense', reporting_category: 'Ministry & Activities', subtype: 'Ministry' },
  { code: 'EXP-008', name: 'Youth Activities', type: 'expense', reporting_category: 'Ministry & Activities', subtype: 'Ministry' },
  { code: 'AST-001', name: 'Bank Account 1', type: 'asset', reporting_category: 'Bank Accounts', subtype: 'Bank' },
  { code: 'AST-002', name: 'Bank Account 2', type: 'asset', reporting_category: 'Bank Accounts', subtype: 'Bank' },
  { code: 'AST-003', name: 'Bank Account 3', type: 'asset', reporting_category: 'Bank Accounts', subtype: 'Bank' },
  { code: 'LIA-001', name: 'Creditors/Accounts Payable', type: 'liability', reporting_category: 'Creditors', subtype: 'Payable' },
  { code: 'LIA-002', name: 'PAYE/NIC Liability', type: 'liability', reporting_category: 'Payroll Liabilities', subtype: 'Payroll Liability' },
  { code: 'LIA-003', name: 'Pension Liability', type: 'liability', reporting_category: 'Payroll Liabilities', subtype: 'Payroll Liability' },
  { code: 'LIA-004', name: 'Net Pay Liability', type: 'liability', reporting_category: 'Payroll Liabilities', subtype: 'Payroll Liability' },
  { code: 'EQU-001', name: 'General Reserves', type: 'fund_balance', reporting_category: 'General Reserves', subtype: 'Unrestricted Reserve' },
  { code: 'EQU-002', name: 'Restricted Reserves', type: 'fund_balance', reporting_category: 'Restricted Reserves', subtype: 'Restricted Reserve' },
];

/** Additional lines for “larger church” template (extends starter with common codes) */
export const LARGER_CHURCH_EXTRA: TemplateAccountRow[] = [
  { code: 'AST-004', name: 'Petty Cash', type: 'asset', reporting_category: 'Bank Accounts', subtype: 'Cash' },
  { code: 'AST-005', name: 'Gift Aid Receivable', type: 'asset', reporting_category: 'Current Assets', subtype: 'Receivable' },
  { code: 'INC-007', name: 'Interest Income', type: 'income', reporting_category: 'Other Income', subtype: 'Interest' },
  { code: 'EXP-009', name: 'Software / Subscriptions', type: 'expense', reporting_category: 'Support Costs', subtype: 'Administration' },
  { code: 'EXP-010', name: 'Bank Charges', type: 'expense', reporting_category: 'Finance Costs', subtype: 'Finance Costs' },
];

/** Charity / non-profit flavour adds governance / fundraising lines */
export const CHARITY_EXTRA: TemplateAccountRow[] = [
  { code: 'EXP-011', name: 'Governance & Audit', type: 'expense', reporting_category: 'Governance Costs', subtype: 'Governance' },
  { code: 'EXP-012', name: 'Fundraising Costs', type: 'expense', reporting_category: 'Raising Funds', subtype: 'Fundraising' },
  { code: 'INC-008', name: 'Investment Income', type: 'income', reporting_category: 'Investment Income', subtype: 'Interest' },
];

export type AccountTemplateId = 'starter' | 'larger' | 'charity';

export function getAccountsForTemplate(id: AccountTemplateId): TemplateAccountRow[] {
  if (id === 'starter') return [...STARTER_ACCOUNTS_CHART];
  if (id === 'larger') return [...STARTER_ACCOUNTS_CHART, ...LARGER_CHURCH_EXTRA];
  return [...STARTER_ACCOUNTS_CHART, ...LARGER_CHURCH_EXTRA, ...CHARITY_EXTRA];
}
