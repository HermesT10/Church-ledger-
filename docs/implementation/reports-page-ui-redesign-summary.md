# Reports Page UI Redesign Summary

## Before

The Reports page was a flat grid of text-heavy cards plus a simple trustee summary panel. It was functional, but it did not show report purpose, audience, output type, recommended workflow, or report readiness.

## After

The Reports page is now a reporting command centre with:

- Premium hero section.
- Primary actions for report pack, export pack, and year-end assistant.
- Featured reports for Monthly Dashboard, Trustee Snapshot, Annual Report, and AGM Pack.
- Grouped report sections.
- Visual report cards with mini previews.
- Search and filters for category, output type, and audience.
- Right panel with recommended workflow, report health, and recent generated empty state.

## Report Grouping

Reports are grouped as:

- Financial Statements
- Management & Analysis
- Compliance & Controls
- Church Operations
- Packs & Snapshots

Featured reports are shown only in the featured area to avoid duplicate card placement.

## Components Added

- `ReportsCommandCentre`
- `ReportCard`
- `MiniPreview`
- `ReportsRightPanel`

These live in `src/app/(app)/reports/reports-command-centre.tsx` and use existing shadcn/Tailwind card, badge, button, and input primitives.

## Routes Preserved

The redesign preserves all existing links from the previous Reports page:

- `/reports/monthly-dashboard`
- `/reports/income-statement`
- `/reports/income-expense-summary`
- `/reports/balance-sheet`
- `/reports/sofa`
- `/reports/cash-flow`
- `/reports/trial-balance`
- `/reports/budget-vs-actual`
- `/reports/fund-movements`
- `/reports/bank-reconciliation-summary`
- `/reports/gift-aid-summary`
- `/reports/lettings`
- `/reports/forecast`
- `/reports/cash-position`
- `/reports/supplier-spend`
- `/reports/trustee-snapshot`
- `/reports/leadership-snapshot`
- `/reports/quarterly`
- `/reports/annual`
- `/reports/charity-accounts-assistant`
- `/year-end-close`
- `/reports/agm`
- `/reports/export-pack`

## Future Improvements

- Wire the right panel to recent `export_versions` rows.
- Add true report readiness counts from validation snapshots.
- Add per-card export actions once report-version IDs are available on the landing page.
- Share report metadata with the sidebar and in-report tabs to remove future drift.
