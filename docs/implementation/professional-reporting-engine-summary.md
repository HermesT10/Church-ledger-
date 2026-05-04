# Professional Reporting Engine Summary

## Engine Architecture

The reporting engine adds a central foundation around the existing report loaders instead of replacing every report page at once.

- Registry: `src/lib/reports/engine/registry.ts`
- Types: `src/lib/reports/engine/types.ts`
- Service/lifecycle actions: `src/lib/reports/engine/service.ts`
- Validation: `src/lib/reports/engine/validation.ts`
- Traceability: `src/lib/reports/engine/traceability.ts`
- Exports: `src/lib/reports/engine/exports.ts`
- Shared UI: `src/components/reports/professional/index.tsx`

## Tables And RLS Model

The migration `20260430133100_professional_reporting_engine.sql` creates:

- `report_versions`: versioned report snapshots with metadata, filters, validation summary, traceability summary, status, and lifecycle user fields.
- `report_exports`: export event records with format, file name, checksum, and payload metadata.
- `report_approval_events`: append-only approval/review lifecycle events.

All tables are workspace-scoped through `workspace_id`, have RLS enabled, and use the existing organisation membership helpers. Admins and treasurers can manage versions and exports. Members can read approved/exported/archived report versions where policies allow.

## Report Registry

The registry covers all current report types:

- Monthly dashboard
- Income statement
- Income and expense summary
- Balance sheet
- SOFA
- Cash flow
- Trial balance
- Budget vs actual
- Fund movements
- Bank reconciliation summary
- Gift Aid summary
- Lettings
- Forecast
- Cash position
- Supplier spend
- Trustee snapshot
- Leadership snapshot
- Quarterly report
- Annual report
- AGM pack
- Export pack

Each definition includes data sources, supported filters, export formats, layout type, trustee-friendly explanation, and validation rule keys.

## Metadata Contract

Every generated professional snapshot includes:

- `report_id`
- `workspace_id`
- `report_type`
- `report_title`
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

## Validation Rules

The validation foundation currently supports:

- Trial balance debit/credit imbalance as a blocker.
- Balance sheet imbalance as a blocker.
- Missing prior year data as a warning.
- Negative restricted fund balances as a warning.
- Draft journals excluded as an informational warning.
- Unreconciled bank transactions as a warning.
- Missing fund mappings as a warning.
- Missing traceability as a warning.

The rules are deliberately structured so more report-specific checks can be layered in without changing every report page.

## Traceability Contract

The standard traceability shape includes:

- `source_type`
- `source_id`
- `amount`
- `account_id`
- `fund_id`
- `transaction_date`
- `evidence_status`
- `href`

The first helper standardizes journal-line traceability and links back to `/journals/{id}`. Future passes can extend this to bank lines, invoices, receipts, donations, Gift Aid records, payroll runs, and fund records.

## Approval Lifecycle

The lifecycle is:

1. `draft`
2. `review`
3. `approved`
4. `exported`
5. `archived`

Approval is blocked when validation includes any `blocker` severity result. Lifecycle events are written to `report_approval_events` and mirrored to `audit_log` through `logAuditEvent`.

## Export Behaviour

The export adapter supports:

- CSV with report metadata, validation summary, and payload JSON.
- PDF/DOCX/Excel placeholders using the same snapshot contract and checksums.

The placeholder adapters create a stable foundation for future rich formatting while keeping all export records traceable through `report_exports`.

## Initial Reports Integrated

The professional snapshot panel is now added to:

- Trial Balance
- Balance Sheet
- SOFA
- Annual Report
- AGM Pack

The existing report clients and tables remain intact. This keeps the initial rollout low-risk while exposing metadata, validation, approval readiness, narrative, and export affordances.

## Remaining Conversion Roadmap

Recommended next steps:

1. Convert duplicated CSV exports to the central export adapter.
2. Add rich PDF rendering for annual, AGM, SOFA, and balance sheet packs.
3. Add Excel workbook exports using the existing `exceljs` dependency.
4. Add DOCX generation for trustee and AGM packs.
5. Attach material line traceability to SOFA, balance sheet, fund movements, and budget vs actual rows.
6. Add report notes and preparer review UI.
7. Expand validations for Gift Aid, payroll, lettings, and bank reconciliation reports.

## Verification

Targeted verification should include:

- `npx vitest run tests/professionalReportingEngine.test.ts`
- Targeted ESLint for reporting engine, professional report components, pages, and tests.
- `npx tsc --noEmit`
- Local/remote migration listing before any Supabase push.

This migration has not been pushed to Supabase.
