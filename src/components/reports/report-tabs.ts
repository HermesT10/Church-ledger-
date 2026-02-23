/**
 * Report sub-navigation tabs — shared across all report pages.
 * Used for quick switching between related reports.
 */
export const REPORT_TABS = [
  { label: 'Income Statement', href: '/reports/income-statement' },
  { label: 'Cash Flow', href: '/reports/cash-flow' },
  { label: 'Budget vs Actual', href: '/reports/budget-vs-actual' },
  { label: 'Forecast', href: '/reports/forecast' },
  { label: 'Balance Sheet', href: '/reports/balance-sheet' },
  { label: 'Fund Movements', href: '/reports/fund-movements' },
  { label: 'Trustee Snapshot', href: '/reports/trustee-snapshot' },
  { label: 'Trial Balance', href: '/reports/trial-balance' },
  { label: 'SOFA', href: '/reports/sofa' },
  { label: 'Cash Position', href: '/reports/cash-position' },
  { label: 'Supplier Spend', href: '/reports/supplier-spend' },
  { label: 'Quarterly Report', href: '/reports/quarterly' },
  { label: 'Annual Report', href: '/reports/annual' },
  { label: 'AGM Pack', href: '/reports/agm' },
  { label: 'Export Pack', href: '/reports/export-pack' },
] as const;
