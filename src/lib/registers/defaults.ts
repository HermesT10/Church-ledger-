import type { RegisterType } from './types';

export const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const SHORT_MONTH_LABELS = MONTH_LABELS.map((month) => month.slice(0, 3));

export interface DefaultRegisterCategory {
  name: string;
  groupName: string | null;
  displayOrder: number;
  notes?: string | null;
}

export const DEFAULT_INCOME_REGISTER_CATEGORIES: DefaultRegisterCategory[] = [
  { name: 'Cafe', groupName: null, displayOrder: 10 },
  { name: 'URC Funding', groupName: null, displayOrder: 20 },
  { name: 'Baptist Union', groupName: null, displayOrder: 30 },
  { name: 'Lettings', groupName: null, displayOrder: 40 },
  { name: 'Giving', groupName: null, displayOrder: 50 },
  { name: 'Gift Aid', groupName: null, displayOrder: 60 },
  { name: 'Events', groupName: null, displayOrder: 70 },
  { name: 'Offering', groupName: null, displayOrder: 80 },
  { name: 'Other', groupName: null, displayOrder: 900 },
];

export const DEFAULT_EXPENSE_REGISTER_CATEGORIES: DefaultRegisterCategory[] = [
  { name: 'Salaries', groupName: 'Staff & Payroll Costs', displayOrder: 10 },
  { name: 'Pension Contributions', groupName: 'Staff & Payroll Costs', displayOrder: 20 },
  { name: 'Intern / Temporary Staff', groupName: 'Staff & Payroll Costs', displayOrder: 30 },
  { name: 'Employer Taxes / Payroll Costs', groupName: 'Staff & Payroll Costs', displayOrder: 40 },
  { name: 'Staff Expenses', groupName: 'Staff & Payroll Costs', displayOrder: 50 },
  { name: 'Staff Training', groupName: 'Staff & Payroll Costs', displayOrder: 60 },

  { name: 'Building Maintenance', groupName: 'Premises & Building Costs', displayOrder: 110 },
  { name: 'Cleaning', groupName: 'Premises & Building Costs', displayOrder: 120 },
  { name: 'Water', groupName: 'Premises & Building Costs', displayOrder: 130 },
  { name: 'Utilities', groupName: 'Premises & Building Costs', displayOrder: 140 },
  { name: 'Insurance', groupName: 'Premises & Building Costs', displayOrder: 150 },
  { name: 'Service Charges', groupName: 'Premises & Building Costs', displayOrder: 160 },
  { name: 'Repairs', groupName: 'Premises & Building Costs', displayOrder: 170 },
  { name: 'Security / Fire Safety', groupName: 'Premises & Building Costs', displayOrder: 180 },

  { name: 'Software Subscriptions', groupName: 'Office, Admin & Software', displayOrder: 210 },
  { name: 'Cloud Storage', groupName: 'Office, Admin & Software', displayOrder: 220 },
  { name: 'Video Conferencing', groupName: 'Office, Admin & Software', displayOrder: 230 },
  { name: 'Payment Processing Fees', groupName: 'Office, Admin & Software', displayOrder: 240 },
  { name: 'Office Supplies', groupName: 'Office, Admin & Software', displayOrder: 250 },
  { name: 'Stationery', groupName: 'Office, Admin & Software', displayOrder: 260 },
  { name: 'Professional Fees', groupName: 'Office, Admin & Software', displayOrder: 270 },
  { name: 'Licences', groupName: 'Office, Admin & Software', displayOrder: 280 },

  { name: 'Sunday Services', groupName: 'Ministry, Worship & Church Activities', displayOrder: 310 },
  { name: 'Worship & Music', groupName: 'Ministry, Worship & Church Activities', displayOrder: 320 },
  { name: 'Guest Speakers', groupName: 'Ministry, Worship & Church Activities', displayOrder: 330 },
  { name: 'Events', groupName: 'Ministry, Worship & Church Activities', displayOrder: 340 },
  { name: 'Cafe / Hospitality', groupName: 'Ministry, Worship & Church Activities', displayOrder: 350 },
  { name: 'Outreach Activities', groupName: 'Ministry, Worship & Church Activities', displayOrder: 360 },
  { name: 'Youth / Children Ministry', groupName: 'Ministry, Worship & Church Activities', displayOrder: 370 },
  { name: 'Pastoral Support', groupName: 'Ministry, Worship & Church Activities', displayOrder: 380 },
  { name: 'Church Activities', groupName: 'Ministry, Worship & Church Activities', displayOrder: 390 },

  { name: 'Mission Giving', groupName: 'Mission, Giving & External Support', displayOrder: 410 },
  { name: 'Denominational Contributions', groupName: 'Mission, Giving & External Support', displayOrder: 420 },
  { name: 'External Charity Support', groupName: 'Mission, Giving & External Support', displayOrder: 430 },
  { name: 'Grants Given', groupName: 'Mission, Giving & External Support', displayOrder: 440 },
  { name: 'Community Support', groupName: 'Mission, Giving & External Support', displayOrder: 450 },
  { name: 'Leadership Support', groupName: 'Mission, Giving & External Support', displayOrder: 460 },

  { name: 'Bank Charges', groupName: 'Finance, Bank Charges & Loan Repayments', displayOrder: 510 },
  { name: 'Loan Interest', groupName: 'Finance, Bank Charges & Loan Repayments', displayOrder: 520 },
  { name: 'Loan Repayments', groupName: 'Finance, Bank Charges & Loan Repayments', displayOrder: 530 },
  { name: 'Card Charges', groupName: 'Finance, Bank Charges & Loan Repayments', displayOrder: 540 },
  { name: 'Debt Repayments', groupName: 'Finance, Bank Charges & Loan Repayments', displayOrder: 550 },

  { name: 'Uncategorized', groupName: 'Other / Needs Review', displayOrder: 900 },
  { name: 'Needs Review', groupName: 'Other / Needs Review', displayOrder: 910 },
  { name: 'One-off Expense', groupName: 'Other / Needs Review', displayOrder: 920 },
  { name: 'Correction / Adjustment', groupName: 'Other / Needs Review', displayOrder: 930 },
];

export function defaultCategoriesForRegister(type: RegisterType): DefaultRegisterCategory[] {
  return type === 'income' ? DEFAULT_INCOME_REGISTER_CATEGORIES : DEFAULT_EXPENSE_REGISTER_CATEGORIES;
}

export function formatRegisterPounds(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  return `${sign}£${(Math.abs(pence) / 100).toFixed(2)}`;
}

export function monthStart(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export function monthEnd(year: number, month: number): string {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}
