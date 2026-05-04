# Reporting Audit

## Scope
This audit inventories the reporting implementation in `src/app/(app)/reports`, `src/lib/reports`, `src/lib/exports`, `src/lib/giftaid`, and `src/lib/reconciliation` as it stands after the Phase 3 reporting refactor work in this branch.

## Report Matrix
| Report | Status | Source Tables / Services | Filters | Export | Drill-down | Trust Risks / Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Monthly finance dashboard | Implemented | `getDashboardOverview()` using `journals`, `journal_lines`, `accounts`, `bills`, `donations`, `gift_aid_claims`, `bank_accounts`, `budgets`, `payroll_runs` | Period | Print-friendly | Links to detailed reports | Summary-first view; not intended to replace detailed finance reports |
| Income statement | Hardened | `getIncomeExpenditureReport()` from posted ledger data | Year, month, fund | CSV | Account -> journal drill-down | Uses posted journals only; monthly plus YTD scope now explicit |
| Balance sheet | Hardened | `getBalanceSheetReport()` from posted ledger balances | As-of date, fund | CSV | Account -> journal drill-down | Accounting equation surfaced; out-of-balance state explicit |
| Trial balance | Existing | `getTrialBalance()` | As-of date, fund | CSV | No | Still finance-user oriented and less trustee-friendly |
| SOFA | Existing | `getSOFAReport()` | Year | CSV | No | Good statement coverage, but interpretation layer still limited |
| Cash flow | Existing | `getCashFlowReport()` | Year, month | CSV | No | Still more finance-facing than leadership-facing |
| Budget vs actual | Hardened | `getBudgetVsActualReport()` from budget lines + actuals | Year, budget, fund, period, month | CSV | Account -> journal drill-down | Variance direction now documented |
| Fund movements | Hardened | `getFundMovementsReport()` | Year, month/YTD, fund filter | CSV | Fund -> journal drill-down | Restricted fund overspend now highlighted |
| Cash position | Hardened | `getCashPositionReport()` | Refresh only | CSV | Link to reconciliation workflow | Reconciliation notes/definitions now explicit |
| Bank reconciliation summary | Implemented | `getBankReconciliationSummaryReport()` using reconciliation and GL services | Active bank accounts | CSV | Link to reconciliation workflow | New trust report focused on cash support |
| Gift Aid summary | Implemented | `getGiftAidSummaryReport()` using `getGiftAidDashboard()` and `gift_aid_claims` | Current fiscal year | CSV | Link to Gift Aid workspace | New coverage for declarations, claims, reclaim pipeline |
| Trustee snapshot | Existing | `getTrusteeSnapshot()` | Snapshot date only | CSV | Links to underlying reports | Already trustee-friendly; still useful as concise pack section |
| Leadership snapshot | Implemented | `getLeadershipSnapshotReport()` combining trustee snapshot + dashboard overview | Period | CSV + print | Links to detailed reports | Plain-English layer added for board use |
| Supplier spend | Existing | `getSupplierSpendReport()` | Year | CSV | No | Useful analysis report but not yet deeply interpreted |
| Quarterly report | Existing | `getQuarterlyReport()` | Year | No | No | Good pack content; still sparse in definitions/insights |
| Annual report | Existing | `getAnnualReport()` | Year | Print/PDF | No | Strong board-pack base; could still adopt richer metadata blocks later |
| AGM pack | Existing | `getAGMReport()` | Year | Print/PDF | No | Presentation-oriented; commentary still basic |
| Export pack | Hardened | `generateTrusteeExportPack()` | Year / as-of date | Multi-CSV | N/A | Now includes Gift Aid, bank reconciliation, and leadership snapshot outputs |

## Architecture Inventory
- Shared shell and interpretation layer now live in `src/components/reports/report-shell.tsx`, `src/components/reports/report-empty-state.tsx`, `src/lib/reports/framework.ts`, and `src/lib/reports/insights.ts`.
- Canonical metadata now supports:
  - scope
  - comparison text
  - source-of-truth text
  - active filters
  - footnotes
  - KPI cards
  - narrative insights
  - glossary / definitions
- Shared drill-down now supports:
  - account activity drill-down
  - fund activity drill-down
  - direct navigation from drill-down rows to source journals

## Key Trust Fixes
- Fixed `src/lib/reports/dashboard.ts` to use `bill_date` instead of `issue_date` for supplier spend reporting.
- Fixed `src/lib/reports/dashboard.ts` to use `is_active` instead of `active` for Gift Aid declaration coverage.
- Standardized core report messaging around posted-ledger-only scope and explicit exclusions.

## Gaps That Remain
- `trial-balance`, `sofa`, `cash-flow`, `quarterly`, and some pack routes still use the older shell pattern and do not yet show the full metadata/glossary/insight layer.
- Export remains CSV and print focused. There is still no dedicated PDF renderer beyond browser print flows.
- Some drill-down routes still lead users to journal-level support rather than module-native source objects such as bills or payroll runs.
- Performance for the new bank reconciliation summary currently favors correctness and clarity over deep query optimization.

## Performance / Duplication Notes
- Reporting logic is still spread across `actions.ts`, `glReports.ts`, `dashboard.ts`, and the new `summaryReports.ts`.
- The new summary reports deliberately reuse existing services rather than duplicating calculations in clients.
- Heavy routes to review next if performance becomes a concern:
  - `getDashboardOverview()`
  - `getTrusteeSnapshot()`
  - `getAnnualReport()`
  - `getBankReconciliationSummaryReport()`

## Recommended Next Hardening
1. Migrate the remaining legacy report pages onto the shared metadata / glossary / insight contracts.
2. Add deeper drill-down support from journal rows into source modules where `source_type` is available.
3. Add integration coverage for server-side report queries and export generation.
4. Add a dedicated PDF/board-pack renderer if browser print output becomes insufficient.
