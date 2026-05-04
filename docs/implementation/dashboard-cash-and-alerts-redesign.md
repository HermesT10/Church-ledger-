# Dashboard Cash And Alerts Redesign

## Before

- `Total Cash` appeared as a standalone stat card in the dashboard KPI grid.
- `Cash Position` separately listed bank/cash accounts, causing users to scan two areas for one cash story.
- `To Do & Alerts` mixed operational tasks and finance prompts with limited hierarchy.

## After

- The standalone `Total Cash` card has been removed.
- `Cash Position` is now the single source of truth for total cash.
- `Cash Position` shows:
  - Total Cash as the primary value.
  - Available Cash, Restricted Cash, and Cash in Hand as secondary values.
  - Current, savings, restricted, and cash account breakdowns.
- `To Do & Alerts` is now grouped into:
  - Workflow
  - Finance Risks
  - Compliance

## Hierarchy Reasoning

Cash is the first question treasurers and trustees ask, so the total now sits inside the card that explains where cash is held. This removes duplication and keeps totals and account detail together.

Alerts are grouped by the type of decision the user needs to make. Workflow items are operational tasks, Finance Risks are reporting or control concerns, and Compliance covers evidence, Gift Aid, and restricted fund checks.

## UX Improvements

- Strong primary cash value with supporting breakdown.
- Account rows remain clickable and use existing dashboard links.
- Negative balances are highlighted with `text-danger`.
- Larger positive balances receive subtle positive emphasis.
- Alerts use consistent status language and tags.
- Sections cap visible rows and expose a `View all` path when needed.

## Data Integrity

`Total Cash` still comes from the existing dashboard source of truth:

- `src/lib/reports/dashboard.ts`
- `financialOverview.cashPosition`
- `financialOverview.kpis.totalCashPence`

The UI no longer duplicates the value in a separate card.

## Future Enhancements

- Add deeper alert drill-down pages for each grouped section.
- Add per-account reconciliation status directly into the cash account rows.
- Use a single reusable command-centre row component across dashboard and month-end.
