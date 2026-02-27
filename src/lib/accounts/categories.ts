/* ------------------------------------------------------------------ */
/*  Standard Account Categories — for Chart of Accounts                 */
/*  Includes both generic and church-specific categories.              */
/* ------------------------------------------------------------------ */

import type { AccountType } from './types';

export interface AccountCategory {
  value: string;
  label: string;
  description?: string;
}

export const ACCOUNT_CATEGORIES: Record<AccountType, AccountCategory[]> = {
  asset: [
    { value: 'Bank Accounts', label: 'Bank Accounts', description: 'Checking, savings, and money market accounts' },
    { value: 'Cash on Hand', label: 'Cash on Hand', description: 'Petty cash or cash registers' },
    { value: 'Clearing Accounts', label: 'Clearing Accounts', description: 'Temporary holding accounts for allocations' },
    { value: 'Accounts Receivable', label: 'Accounts Receivable', description: 'Money owed to the organisation by customers' },
    { value: 'Inventory', label: 'Inventory', description: 'Raw materials, work in progress, and finished goods' },
    { value: 'Fixed Assets', label: 'Fixed Assets', description: 'Equipment, machinery, vehicles, and buildings' },
    { value: 'Intangible Assets', label: 'Intangible Assets', description: 'Patents, trademarks, and goodwill' },
    { value: 'Prepayments', label: 'Prepayments', description: 'Payments made in advance (e.g., insurance)' },
    { value: 'Other', label: 'Other', description: 'Other asset categories' },
  ],
  liability: [
    { value: 'Accounts Payable', label: 'Accounts Payable', description: 'Money owed to vendors and suppliers' },
    { value: 'Creditors', label: 'Creditors', description: 'Amounts owed to suppliers for purchases' },
    { value: 'Credit Card Balances', label: 'Credit Card Balances', description: 'Company credit card accounts' },
    { value: 'Loans Payable', label: 'Loans Payable', description: 'Bank loans and long-term debt' },
    { value: 'Accrued Liabilities', label: 'Accrued Liabilities', description: 'Expenses incurred but not yet billed' },
    { value: 'Payroll Liabilities', label: 'Payroll Liabilities', description: 'PAYE, NIC, pension, and other payroll obligations' },
    { value: 'Sales Tax Payable', label: 'Sales Tax Payable', description: 'Sales tax collected to be remitted' },
    { value: 'Deferred Revenue', label: 'Deferred Revenue', description: 'Money received for services not yet delivered' },
    { value: 'Other', label: 'Other', description: 'Other liability categories' },
  ],
  equity: [
    { value: "Owner's Investment/Capital", label: "Owner's Investment/Capital", description: 'Money invested by the owner' },
    { value: 'Retained Earnings', label: 'Retained Earnings', description: 'Cumulative net income not distributed' },
    { value: 'General Reserves', label: 'General Reserves', description: 'Unrestricted reserves' },
    { value: 'Restricted Reserves', label: 'Restricted Reserves', description: 'Designated or restricted reserves' },
    { value: 'Drawings/Dividends', label: 'Drawings/Dividends', description: 'Money withdrawn by the owner' },
    { value: 'Other', label: 'Other', description: 'Other equity categories' },
  ],
  income: [
    { value: 'Sales/Operating Income', label: 'Sales/Operating Income', description: 'Revenue from primary business activities' },
    { value: 'Tithes & Offerings', label: 'Tithes & Offerings', description: 'Donations, tithes, and offerings' },
    { value: 'Tax Recovery', label: 'Tax Recovery', description: 'Gift Aid and other tax recoveries' },
    { value: 'Other Income', label: 'Other Income', description: 'Interest income, gains on asset sales' },
    { value: 'Sales Returns and Allowances', label: 'Sales Returns and Allowances', description: 'Deductions for returned products' },
    { value: 'Other', label: 'Other', description: 'Other income categories' },
  ],
  expense: [
    { value: 'Cost of Goods Sold (COGS)', label: 'Cost of Goods Sold (COGS)', description: 'Direct costs of producing goods or services' },
    { value: 'Wages and Salaries', label: 'Wages and Salaries', description: 'Employee compensation' },
    { value: 'Staff Costs', label: 'Staff Costs', description: 'Salaries, pensions, and related employment costs' },
    { value: 'Rent and Utilities', label: 'Rent and Utilities', description: 'Office or warehouse rent, electricity, water' },
    { value: 'Premises Costs', label: 'Premises Costs', description: 'Building maintenance, insurance, and utilities' },
    { value: 'Ministry & Activities', label: 'Ministry & Activities', description: 'Programme and ministry expenditure' },
    { value: 'Marketing/Advertising', label: 'Marketing/Advertising', description: 'Advertising campaigns and materials' },
    { value: 'Depreciation Expense', label: 'Depreciation Expense', description: 'Allocation of asset cost over time' },
    { value: 'Bank Fees/Interest Expense', label: 'Bank Fees/Interest Expense', description: 'Banking service charges and interest' },
    { value: 'Platform Fees', label: 'Platform Fees', description: 'Payment processing and platform charges' },
    { value: 'Other', label: 'Other', description: 'Other expense categories' },
  ],
};

/** Display order for account types: Assets, Liabilities, Equity, Income, Expense (Balance Sheet then P&L) */
export const ACCOUNT_TYPE_ORDER: AccountType[] = [
  'asset',
  'liability',
  'equity',
  'income',
  'expense',
];
