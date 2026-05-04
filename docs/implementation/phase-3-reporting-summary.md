# Phase 3 Reporting Summary

## Objective
Phase 3 focused on making reporting more trustworthy, interpretable, exportable, and usable by both finance users and trustee/leadership audiences.

## What Changed
- Added a shared reporting presentation framework:
  - `src/lib/reports/framework.ts`
  - `src/lib/reports/insights.ts`
  - `src/components/reports/report-shell.tsx`
  - `src/components/reports/report-empty-state.tsx`
- Hardened core reports with clearer scope, definitions, and interpretation:
  - income statement
  - balance sheet
  - budget vs actual
  - fund movements
  - cash position
- Expanded drill-down:
  - account drill-down remains supported
  - fund drill-down is now supported
  - drill-down rows now link directly to journals
- Added missing production reports:
  - monthly finance dashboard
  - bank reconciliation summary
  - gift aid summary
  - leadership snapshot
- Improved exports:
  - export pack now includes Gift Aid summary
  - export pack now includes bank reconciliation summary
  - export pack now includes leadership snapshot
  - export pack now points users to print-friendly board-pack routes
- Fixed reporting trust issues in dashboard data:
  - supplier spend now filters on `bill_date`
  - Gift Aid declaration coverage now uses `is_active`

## Files Added
- `src/lib/reports/framework.ts`
- `src/lib/reports/insights.ts`
- `src/lib/reports/summaryReports.ts`
- `src/components/reports/report-empty-state.tsx`
- `src/app/(app)/reports/monthly-dashboard/page.tsx`
- `src/app/(app)/reports/monthly-dashboard/monthly-dashboard-client.tsx`
- `src/app/(app)/reports/bank-reconciliation-summary/page.tsx`
- `src/app/(app)/reports/bank-reconciliation-summary/bank-reconciliation-summary-client.tsx`
- `src/app/(app)/reports/gift-aid-summary/page.tsx`
- `src/app/(app)/reports/gift-aid-summary/gift-aid-summary-client.tsx`
- `src/app/(app)/reports/leadership-snapshot/page.tsx`
- `src/app/(app)/reports/leadership-snapshot/leadership-snapshot-client.tsx`
- `tests/reportInsights.test.ts`
- `docs/audits/reporting-audit.md`
- `docs/implementation/phase-3-reporting-summary.md`

## Files Updated
- `src/components/reports/report-tabs.ts`
- `src/app/(app)/reports/layout.tsx`
- `src/app/(app)/reports/page.tsx`
- `src/components/reports/drill-down-dialog.tsx`
- `src/lib/reports/actions.ts`
- `src/lib/reports/types.ts`
- `src/lib/reports/dashboard.ts`
- `src/lib/exports/actions.ts`
- `src/app/(app)/reports/export-pack/export-pack-client.tsx`
- `src/app/(app)/reports/income-statement/income-statement-client.tsx`
- `src/app/(app)/reports/balance-sheet/balance-sheet-client.tsx`
- `src/app/(app)/reports/budget-vs-actual/bva-report-client.tsx`
- `src/app/(app)/reports/fund-movements/fund-movements-client.tsx`
- `src/app/(app)/reports/cash-position/cash-position-client.tsx`

## Result
- Reports now communicate scope, source, and caveats more clearly.
- Trustees have dedicated leadership-facing views instead of only finance-native reports.
- More report totals can be drilled back to source journals.
- Export coverage now better matches the reporting surface area.
- The reporting stack is closer to a canonical framework instead of page-by-page bespoke UX.

## Remaining Follow-Up
- Move the remaining legacy report pages onto the new shared metadata/insight pattern.
- Add deeper source-module drill-down beyond journals where possible.
- Add server-side integration tests for exports and report filters.
- Introduce dedicated PDF rendering if browser print output is not sufficient for board packs.
