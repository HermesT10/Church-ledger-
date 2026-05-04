# Dashboard Card Purpose Audit

## Scope

This audit reviews the current dashboard information architecture in `src/app/(app)/dashboard/dashboard-client.tsx`, with supporting data from `src/lib/reports/dashboard.ts`, `src/lib/reports/dashboard-financial-overview.ts`, and `src/lib/reports/types.ts`.

The current visual direction is good. The recommended work is not a visual redesign; it is a card-purpose refinement so every dashboard card earns its place.

## Current Cards Found

| Card | Current purpose | Data source | Current issue | Proposed change |
| --- | --- | --- | --- | --- |
| Total Cash KPI | Headline cash total | `financialOverview.kpis.totalCashPence` | Useful headline. Can be duplicated if Cash Position only repeats total. | Keep. Cash Position should explain this value by source/category. |
| Restricted Funds Remaining KPI | Headline restricted remaining balance | Restricted fund tracker aggregate | Useful headline. Can be duplicated by fund card if it only shows remaining. | Keep. Restricted Fund Tracker should stay fund-level risk/status. |
| Loans Outstanding KPI | Headline liability/loan balance | Liability account aggregation | Distinct from fund/cash cards. | Keep. |
| YTD Income KPI | Headline income total | Selected-year posted ledger lines | Duplicated by mini-card inside chart card. | Keep KPI; remove mini-card duplicate from chart card. |
| YTD Expenses KPI | Headline expense total | Selected-year posted ledger lines | Duplicated by mini-card inside chart card. | Keep KPI; remove mini-card duplicate from chart card. |
| Net Position KPI | Headline surplus/deficit | YTD income minus YTD expenses | Duplicated by mini-card inside chart card. | Keep KPI; chart should show trend/movement instead. |
| Monthly Income vs Expenses chart | Trend view of monthly income and expenses | `financialOverview.monthlyIncomeExpense` | Top chart includes duplicate YTD mini-cards. | Keep chart; replace mini-cards with trend insights such as strongest income month, highest expense month, current month net, and biggest movement. |
| Fund balances widget | Optional fund snapshot | `fundBalances` optional widget | Related to restricted funds but not identical; gives broad fund balances. | Keep if visible; ensure it remains a summary widget and not a duplicate KPI. |
| Gift Aid widget | Optional Gift Aid summary | `giftAidSummary` optional widget | Useful, but should be action-oriented and show empty state when all values are zero. | Improve empty/action state and preserve Manage link. |
| To Do & Alerts | Workflow and finance prompts | `todoItems` + `financialOverview.alerts` | Already merged, but only has Workflow and Finance Prompts groups. Compliance actions are mixed into finance prompts. | Keep and add Compliance grouping for Gift Aid, restricted fund, and month-end style action items. |
| Cash Position | Account/category breakdown | `financialOverview.cashPosition` | Explains Total Cash by account category, but lacks reconciliation context and helper states for missing statement/reconciliation data. | Keep; add source summary, statement/import helper text, and reconciliation prompts where source is opening/ledger balance. |
| Restricted Fund Tracker | Fund-level restricted balances | `financialOverview.restrictedFundTracker` | Distinct and useful; can become too long. | Keep; cap to top 10 rows and add “View all restricted funds”. |
| Monthly Income vs Expenses table | Monthly table | `financialOverview.monthlyIncomeExpense` | Distinct from KPI if used as trend table; currently no insights. | Keep; add concise trend insight row/summary. |
| Month-End Close | Close process progress | `guidance.monthEnd` | Distinct process card. | Keep. |
| Financial Health | Risk diagnosis | `guidance.indicators` | Distinct from To Do when framed as risk explanation. | Keep. |
| Previous Year Comparison | Year-on-year comparison | `financialOverview.previousYearComparison` | Useful only when compare toggle is enabled; not duplicate because it shows variance. | Keep when available. |
| Breakdown / Month timeline optional widgets | Configurable breakdown/timeline | Legacy dashboard layout widgets | May be useful when visible, but can overlap with chart/table context. | Keep optional; do not force into main structure. |

## Duplicated Information Found

- `YTD Income`, `YTD Expenses`, and `Net Position` appear as KPI cards and again as mini-cards inside the main `Monthly Income vs Expenses` chart card.
- `Restricted Funds Remaining` appears as a KPI and is related to the `Restricted Fund Tracker`, but the tracker provides fund-by-fund donated/used/remaining/status, so it should stay.
- `Total Cash` appears as a KPI and is related to `Cash Position`, but Cash Position is useful if it explains the total by account type/source and reconciliation state.
- Financial alerts and To Do items overlap in theme, but they can remain together if grouped by action category and not repeated in `Financial Health`.

## Cards To Keep

- Top KPI Snapshot: Total Cash, Restricted Funds Remaining, Loans Outstanding, YTD Income, YTD Expenses, Net Position.
- Cash Position, as the explanation of the Total Cash KPI.
- Restricted Fund Tracker, as the fund-level risk/status view.
- Monthly Income vs Expenses chart/table, as the trend view.
- To Do & Alerts, as the action queue.
- Month-End Close, as a close-process tracker.
- Financial Health, as risk diagnosis.
- Gift Aid, as an action-oriented optional card.

## Cards To Merge

- Keep `To Do & Alerts` merged rather than reintroducing a separate Alerts card.
- Do not merge `Financial Health` into To Do because Financial Health explains risk while To Do shows actions.

## Cards To Improve

- Main chart: remove duplicate YTD mini-cards and replace with monthly trend insights.
- Cash Position: add source/reconciliation context and better helper states for no imported statement or no reconciliation.
- Restricted Fund Tracker: cap dashboard rows and add “View all restricted funds”.
- To Do & Alerts: add Compliance group.
- Gift Aid: add empty/action state when all values are zero.

## Cards To Remove

- No whole card is currently genuinely useless after the previous cleanup. The remaining issue is duplicated content inside cards, not the existence of the cards themselves.
