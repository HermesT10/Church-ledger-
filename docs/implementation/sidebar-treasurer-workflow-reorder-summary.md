# Sidebar treasurer workflow reorder — implementation summary

## Old structure (before)

| Order | Section | Items |
|------:|---------|-------|
| 1 | Overview | Dashboard, Calendar |
| 2 | Structure | Funds, Accounts, Journals |
| 3 | Income | Income Register → Giving Imports (unchanged list) |
| 4 | Expenses | … Payment Runs, **Staff, Payroll** |
| 5 | Banking | **Banking**, Transactions, Cash, Reconciliation |
| 6 | Planning | Budgets, **Reports**, Month End |
| 7 | Admin | Workflows, Settings |

## New structure (after)

| Order | Section | Items |
|------:|---------|-------|
| 1 | Overview | Dashboard, Calendar |
| 2 | Banking | **Bank Accounts**, Reconciliation, Transactions, Cash |
| 3 | Income | Same six items, same order |
| 4 | Expenses | … Payment Runs, **Payroll, Staff** |
| 5 | Accounting | Funds, Accounts, Journals |
| 6 | Planning | Budgets, Month End |
| 7 | Reports | Reports (only) |
| 8 | Admin | Workflows, Settings |

## Label changes

| Before | After | Route |
|--------|-------|-------|
| Banking (item) | **Bank Accounts** | `/banking` (unchanged) |
| Structure (section) | **Accounting** | — |
| — | Section tooltips via `description` on each `NavGroup` | native `title` on section header button |

Staff was already labeled **Staff** (`/employees`). Payroll/Staff **order** swapped under Expenses.

## Routes

All `href` and `matchPrefix` values preserved. No route path renames.

## Permission behaviour

Unchanged `roles` on every nav item. Empty groups still hidden after filtering.

## UX

- Collapsible sections, badges, active link styling, hover states, icon rail (collapsed), mobile sheet — unchanged behaviour aside from order/labels.
- **Month End** uses `ListChecks` icon to distinguish from other clipboard-style items.
- **localStorage** for section open/closed: key `sidebarNavGroups_v2` so renames do not read obsolete `"Structure"` / mixed Planning keys.

## Files touched

- `src/components/app-sidebar.tsx` — `NAV_GROUPS`, `NavGroup.description`, `STORAGE_KEY`, section button `title`, `ListChecks` import
- `docs/audits/sidebar-reorder-audit.md` — audit
- `docs/implementation/sidebar-treasurer-workflow-reorder-summary.md` — this file
- `tests/sidebarTreasurerWorkflow.test.ts` — order/label regression checks

## Tests

Run:

`npm run test:run -- tests/sidebarTreasurerWorkflow.test.ts`
