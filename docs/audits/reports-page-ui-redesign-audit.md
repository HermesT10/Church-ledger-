# Reports Page UI Redesign Audit

## Files Found

- `src/app/(app)/reports/page.tsx` renders the Reports landing page.
- `src/app/(app)/reports/layout.tsx` renders the Reports sidebar navigation.
- `src/components/finance/report-summary-card.tsx` renders the current landing page report cards.
- `src/components/finance/trustee-summary-card.tsx` renders the current right-side guidance card.
- `src/components/reports/report-shell.tsx` provides the common shell for individual reports.
- `src/components/reports/report-tabs.ts` provides in-report switching links.
- `src/lib/reports/engine/service.ts` generates snapshots and exports.
- `src/lib/document-production/actions.ts` and `src/lib/document-production/versioning.ts` read/write `export_versions`.
- `src/components/reports/trustee-packs/charts.tsx` shows existing Recharts usage and chart tokens.
- `src/components/stat-card.tsx`, `src/components/section-card.tsx`, and `src/components/ui/*` provide existing soft-card design patterns.

## Current UI Structure

The Reports landing page is a flat card grid with a right panel:

- `REPORT_CARDS` is a static array in `src/app/(app)/reports/page.tsx`.
- Each report is rendered with `ReportSummaryCard`.
- The right panel contains `TrusteeSummaryCard` and a plain suggested flow card.
- There is no search, filtering, featured report area, preview visual, status badge, or recent exports panel.

The current card style is functional and consistent with the design system, but it is text-heavy and does not communicate report type, audience, readiness, or workflow.

## Current Report List

The landing page currently links to:

- Monthly Dashboard
- Income Statement
- Income & Expense Summary
- Balance Sheet
- SOFA
- Cash Flow
- Trial Balance
- Budget vs Actual
- Fund Movements
- Bank Reconciliation
- Gift Aid Summary
- Lettings Income
- Forecast
- Cash Position
- Supplier Spend
- Trustee Snapshot
- Leadership Snapshot
- Quarterly Report
- Annual Report
- Charity Accounts Assistant
- Year-End Close
- AGM Pack
- Export Pack

The sidebar currently links to most of the same report routes but does not include Income & Expense Summary, Lettings Income, Charity Accounts Assistant, or Year-End Close.

## Reusable Components Available

- `Card`, `CardHeader`, `CardContent`, `CardTitle`
- `Badge`
- `Button`
- `PageShell`
- `PageHeader`
- `ReportShell`
- `ReportSummaryCard`
- `TrusteeSummaryCard`
- Recharts components already used elsewhere
- Soft-card tokens such as `rounded-2xl`, `border-border/70`, `bg-card`, `shadow-card`, `bg-muted/35`, `text-muted-foreground`

## Export And Status Data

Report generation/export exists in:

- `src/lib/reports/engine/service.ts`
- `src/lib/document-production/actions.ts`
- `src/lib/document-production/versioning.ts`

The `export_versions` table stores source report ID/type, format, file path, status, version, and generated timestamp. The landing page does not currently read this table.

For this redesign, status can safely default to `Not generated yet` while the UI is made ready for recent export data. This avoids heavy report generation on the landing page.

## Redesign Plan

1. Replace the flat card list with structured report metadata.
2. Add a premium hero with action buttons for export pack and year-end/report pack workflows.
3. Add featured reports for Monthly Dashboard, Trustee Snapshot, Annual Report, and AGM Pack.
4. Group remaining reports into Financial Statements, Management & Analysis, Compliance & Controls, Church Operations, and Packs & Snapshots.
5. Add lightweight preview visuals without loading heavy report data.
6. Add a right panel with Recommended Report Flow, Report Health, and Recently Generated/empty state.
7. Add client-side search and filters over static metadata.
8. Preserve every existing report route.

## Risks

- Removing or renaming routes would break the sidebar, report tabs, and user bookmarks.
- Loading full report data for previews could slow the landing page.
- Duplicating reports across groups would recreate the current navigation clutter.
- Recent export status may be incomplete for reports not yet versioned through `export_versions`.
- Search and filter UI should remain lightweight and not become another reporting engine.
