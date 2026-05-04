# Dashboard Card Purpose Refinement Summary

## Goal

Refine the dashboard information architecture without changing the overall visual system. The dashboard keeps the existing cards, spacing, sidebar, and layout rhythm, but removes repeated totals and makes each retained card answer a different user question.

## Card Responsibilities

- Top KPI Snapshot shows headline totals only: cash, restricted funds, loans, YTD income, YTD expenses, and net position.
- Cash Position explains the Total Cash KPI by account/category/source and prompts users to upload statements or reconcile when supporting data is missing.
- Restricted Fund Tracker shows fund-level risk/status, donated, used, and remaining balances.
- Monthly Income vs Expenses shows trend and movement, not duplicate YTD totals.
- To Do & Alerts groups operational workflow, finance prompts, and compliance items in one action queue.
- Month-End Close remains the close-process tracker.
- Financial Health remains the risk/diagnosis card.
- Gift Aid remains an action card with a clear empty state when no claim value exists.

## Duplicate Reduction

- Removed duplicate `YTD income`, `YTD expenses`, and `Net position` mini-cards from the main chart card.
- Replaced those mini-cards with trend insights: strongest income month, highest expense month, current month net, and biggest net movement.
- Kept Cash Position and Restricted Fund Tracker because they add breakdown, source, and risk/status context beyond the KPI totals.

## Data Rules

- Financial totals shown as totals continue to come from posted ledger, active bank account, and statement-derived dashboard data.
- Unallocated bank lines and missing claim/declaration work remain prompts in To Do & Alerts rather than becoming final finance totals.
- Missing imported statement or reconciliation context is shown as a helper/prompt in Cash Position, not hidden or treated as confirmed data.

## Drill-Down Behaviour

- KPI cards remain linked to their underlying areas.
- Cash Position rows link to the relevant banking or account page.
- Restricted fund rows link to the fund detail page and the card links to the restricted funds list.
- Monthly table rows continue linking to income and expense registers for the selected year/month.
- Gift Aid empty/action state links to claim preparation.
