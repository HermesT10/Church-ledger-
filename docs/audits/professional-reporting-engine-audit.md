# Professional Reporting Engine Audit

## Report Inventory

Current report routes live under `src/app/(app)/reports/`:

- `monthly-dashboard`
- `income-statement`
- `income-expense-summary`
- `balance-sheet`
- `sofa`
- `cash-flow`
- `trial-balance`
- `budget-vs-actual`
- `fund-movements`
- `bank-reconciliation-summary`
- `gift-aid-summary`
- `lettings`
- `forecast`
- `cash-position`
- `supplier-spend`
- `trustee-snapshot`
- `leadership-snapshot`
- `quarterly`
- `annual`
- `agm`
- `export-pack`

## Report Data Services Found

- `src/lib/reports/actions.ts` contains most server report loaders, including budget vs actual, dashboard, forecast, income/expenditure, balance sheet, fund movements, trustee snapshot, cash flow, quarterly, annual, AGM, and drill-down transactions.
- `src/lib/reports/glReports.ts` contains trial balance, SOFA, supplier spend, and cash position loaders.
- `src/lib/reports/types.ts` contains report-specific serializable data contracts.
- `src/lib/reports/framework.ts` contains lightweight UI metadata helpers and formatting utilities, but not report lifecycle metadata or versioning.
- Supporting calculation helpers exist in `actuals.ts`, `budgetVsActual.ts`, `fundMovements.ts`, `incomeExpenditure.ts`, `balanceSheet.ts`, `trusteeSnapshot.ts`, `dashboard.ts`, `dashboard-financial-overview.ts`, `summaryReports.ts`, and `insights.ts`.

## Report UI Components Found

- `src/components/reports/report-shell.tsx`
- `src/components/reports/report-filter-bar.tsx`
- `src/components/reports/report-table-card.tsx`
- `src/components/reports/report-empty-state.tsx`
- `src/components/reports/report-section.tsx`
- `src/components/reports/drill-down-dialog.tsx`

These components are useful presentation primitives, but they do not provide report versioning, approval, export orchestration, complete metadata, or validation panels.

## Export Utilities Found

- CSV export logic is duplicated in client components such as balance sheet, forecast, and fund movements.
- `src/app/api/registers/export/route.ts` exports income/expense registers as CSV.
- Gift Aid has PDF-related tooling through `@react-pdf/renderer`, especially donor statements and declaration PDFs.
- Gift Aid schedule export writes CSV files to Supabase Storage.
- No central report PDF export engine was found.
- No central report Excel export engine was found.
- No central report Word/DOCX export engine was found.

## Current SOFA Logic

`src/lib/reports/glReports.ts` implements SOFA by:

- Loading active income and expense accounts.
- Loading posted journals in the calendar year.
- Loading journal lines for those journals.
- Loading fund types.
- Aggregating income and expenditure by unrestricted, restricted, and designated funds.

Risks:

- SOFA has no standard report metadata, validation result, approval status, version, or export snapshot.
- Traceability is not attached to each material line.
- Basis and accounting period metadata are implicit.

## Current Balance Sheet Logic

Balance sheet logic is split across:

- `src/lib/reports/actions.ts` for server loading and serialization.
- `src/lib/reports/balanceSheet.ts` for pure aggregation and accounting equation checks.

Risks:

- Balance sheet imbalance is calculated but not part of a standard approval-blocking validation result.
- Traceability is not attached to material lines.
- Export metadata and version status are not persisted.

## Current Annual Report And AGM Pack Logic

- `src/app/(app)/reports/annual/page.tsx` calls `getAnnualReport`.
- `src/app/(app)/reports/agm/page.tsx` calls `getAGMReport`.
- `getAnnualReport` composes existing report data.
- `getAGMReport` builds a simplified pack-style summary and commentary.

Risks:

- No professional report notes workflow exists.
- No prepared/reviewed/approved lifecycle exists.
- Missing prior-year data is not surfaced as a standard validation warning.
- No professional PDF/Word pack export orchestration is present.

## Payroll Reporting

Payroll appears in dashboard/reporting summaries through report action imports and payroll modules, but no dedicated professional payroll reporting pack was found in the central reports folder. Payroll source data is available through payroll actions and payroll run tables.

## Funds, Accounts, And Ledger Sources

Main accounting sources used by reports:

- `accounts`
- `funds`
- `journals`
- `journal_lines`
- `budget_lines`
- `bank_accounts`
- `bank_lines`
- `bills`
- `donations`
- Gift Aid claim/batch tables
- payroll run tables
- lettings tables

Most core accounting reports correctly filter to posted journals, but the implementation repeats posted-journal lookup and journal-line aggregation in multiple places.

## Approval And Review Workflow

Approval/review workflows exist for bills, payment runs, portal invoices, portal expenses, portal cash collections, and other operational modules. There is currently no report version approval workflow with `draft`, `review`, `approved`, `exported`, and `archived` statuses.

## Audit Logs

`src/lib/audit.ts` writes immutable `audit_log` events with organisation scope, user, action, entity type, entity ID, metadata, and environment. This can be reused for report lifecycle events.

## RLS And Workspace Context

Existing report loaders use either `getActiveOrg()` or explicit `organisationId`/`orgId` parameters. Most queries include `organisation_id` filters, but workspace scoping is not represented in a central report engine. New persisted report tables must include `workspace_id` and RLS policies.

## Duplicated Calculation Logic

Repeated patterns include:

- Loading posted journal IDs for a period.
- Loading `journal_lines` for those IDs.
- Aggregating debit/credit values by account/fund.
- Building CSV content and browser downloads.
- Building report metadata manually per page.

## Missing Metadata

Reports do not consistently include:

- `report_id`
- `workspace_id`
- `report_type`
- `period_start`
- `period_end`
- `financial_year`
- `basis`
- `funds_included`
- `filters_applied`
- `generated_by`
- `generated_at`
- `prepared_by`
- `reviewed_by`
- `approved_by`
- `status`
- `version`

## Export Gaps

- No central `exportReport(reportId, format)` flow.
- No persisted export records.
- CSV exports do not always include professional metadata.
- Professional packs do not have Word/DOCX support.
- PDF support is not shared across reports.

## Quality Gaps

- No central validation model.
- No approval blockers for trial balance or balance sheet imbalance.
- No standard warnings for unreconciled bank activity or missing mappings.
- No standard traceability structure for report lines.
- No report version history.
- No standard trustee-friendly narrative layer.

## Implementation Sequence

1. Add persisted report version/export tables with RLS.
2. Add central report engine types and registry.
3. Add validation and traceability utilities.
4. Add shared report engine service actions.
5. Add professional report UI components.
6. Integrate the engine into trial balance, balance sheet, SOFA, annual report, and AGM pages first.
7. Add tests for registry, metadata, validation, traceability, versioning, approval, exports, and RLS.
8. Document the implementation and remaining conversion roadmap.
