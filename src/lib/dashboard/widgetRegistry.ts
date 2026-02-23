/* ------------------------------------------------------------------ */
/*  Dashboard Widget Registry                                          */
/*  Defines widget IDs, metadata, default layout, and merge logic.     */
/* ------------------------------------------------------------------ */

export type WidgetId =
  /* Core widgets (visible by default) */
  | 'overview-chart'
  | 'income-kpi'
  | 'expense-kpi'
  | 'todo-list'
  | 'breakdown'
  | 'month-timeline'
  /* Optional widgets (hidden by default) */
  | 'cash-position'
  | 'fund-balances'
  | 'budget-vs-actual'
  | 'gift-aid-summary'
  | 'recent-transactions'
  | 'supplier-spend'
  | 'payroll-summary';

export interface WidgetConfig {
  id: WidgetId;
  visible: boolean;
}

export interface WidgetMeta {
  id: WidgetId;
  label: string;
  description: string;
  defaultVisible: boolean;
}

/* ------------------------------------------------------------------ */
/*  Metadata for the customize panel                                   */
/* ------------------------------------------------------------------ */

export const WIDGET_META: WidgetMeta[] = [
  {
    id: 'overview-chart',
    label: 'Income & Expense Trend',
    description: 'Line chart showing income vs expense over the period.',
    defaultVisible: true,
  },
  {
    id: 'income-kpi',
    label: 'Income KPI',
    description: 'Total income with delta badge vs prior period.',
    defaultVisible: true,
  },
  {
    id: 'expense-kpi',
    label: 'Expense KPI',
    description: 'Total expenses with delta badge vs prior period.',
    defaultVisible: true,
  },
  {
    id: 'todo-list',
    label: 'To-Do List',
    description: 'Actionable tasks generated from live app data.',
    defaultVisible: true,
  },
  {
    id: 'breakdown',
    label: 'Category Breakdown',
    description: 'Top 5 income and expense categories with percentages.',
    defaultVisible: true,
  },
  {
    id: 'month-timeline',
    label: 'Month Timeline',
    description: 'Monthly period strip with income badges.',
    defaultVisible: true,
  },
  {
    id: 'cash-position',
    label: 'Cash Position',
    description: 'Bank account balances vs GL balances.',
    defaultVisible: false,
  },
  {
    id: 'fund-balances',
    label: 'Fund Balances',
    description: 'Restricted / unrestricted fund summary with overspend flags.',
    defaultVisible: false,
  },
  {
    id: 'budget-vs-actual',
    label: 'Budget vs Actual',
    description: 'Current year budget variance summary.',
    defaultVisible: false,
  },
  {
    id: 'gift-aid-summary',
    label: 'Gift Aid Summary',
    description: 'Estimated reclaim, claimed, and outstanding amounts.',
    defaultVisible: false,
  },
  {
    id: 'recent-transactions',
    label: 'Recent Transactions',
    description: 'Last 10 posted journal entries.',
    defaultVisible: false,
  },
  {
    id: 'supplier-spend',
    label: 'Top Suppliers',
    description: 'Top 5 suppliers by spend this period.',
    defaultVisible: false,
  },
  {
    id: 'payroll-summary',
    label: 'Payroll Summary',
    description: 'Latest payroll run totals and liabilities.',
    defaultVisible: false,
  },
];

/* ------------------------------------------------------------------ */
/*  Default layout (core visible, optional hidden)                     */
/* ------------------------------------------------------------------ */

export const DEFAULT_LAYOUT: WidgetConfig[] = WIDGET_META.map((w) => ({
  id: w.id,
  visible: w.defaultVisible,
}));

/* ------------------------------------------------------------------ */
/*  All known widget IDs (for validation)                              */
/* ------------------------------------------------------------------ */

const ALL_IDS = new Set<string>(WIDGET_META.map((w) => w.id));

/* ------------------------------------------------------------------ */
/*  mergeWithDefaults                                                  */
/*  Merges a saved layout with the current defaults:                   */
/*  - Preserves saved order and visibility for known IDs               */
/*  - Appends any new IDs (added in code) at the end with default vis  */
/*  - Strips any IDs that no longer exist                              */
/* ------------------------------------------------------------------ */

export function mergeWithDefaults(
  saved: WidgetConfig[] | null | undefined
): WidgetConfig[] {
  if (!saved || !Array.isArray(saved) || saved.length === 0) {
    return DEFAULT_LAYOUT.map((w) => ({ ...w }));
  }

  const result: WidgetConfig[] = [];
  const seen = new Set<string>();

  for (const item of saved) {
    if (
      item &&
      typeof item.id === 'string' &&
      ALL_IDS.has(item.id) &&
      !seen.has(item.id)
    ) {
      result.push({ id: item.id as WidgetId, visible: item.visible !== false });
      seen.add(item.id);
    }
  }

  for (const meta of WIDGET_META) {
    if (!seen.has(meta.id)) {
      result.push({ id: meta.id, visible: meta.defaultVisible });
    }
  }

  return result;
}
