# Annual Accounts Production Audit

## Files Found

- `src/app/(app)/reports/annual/page.tsx`
- `src/app/(app)/reports/annual/annual-report-client.tsx`
- `src/app/(app)/reports/agm/page.tsx`
- `src/app/(app)/reports/agm/agm-client.tsx`
- `src/app/(app)/reports/export-pack/page.tsx`
- `src/app/(app)/reports/export-pack/export-pack-client.tsx`
- `src/lib/reports/actions.ts`
- `src/lib/reports/types.ts`
- `src/lib/exports/actions.ts`
- `src/lib/reports/engine/*`

## Current Sections Generated

The current Annual Report includes:

- Income statement.
- Balance sheet.
- Fund movements.
- Budget vs actual summary.
- Prior-year income statement and balance sheet comparisons where data exists.
- Browser print/save-as-PDF action.

The current AGM report includes:

- Total income.
- Total expenses.
- Net result.
- Restricted fund balances.
- Unrestricted and designated fund balances.
- Treasurer commentary placeholder.
- Browser print/save-as-PDF action.

The current export pack generates CSV working papers for key reports.

## Missing Sections

The current implementation does not yet provide a complete trustee-ready accounts pack with:

- Cover page.
- Contents.
- Charity information.
- Trustees' Annual Report.
- Independent examiner/auditor placeholder page.
- Full SOFA with current/prior year fund columns.
- Upgraded balance sheet/statement of financial position.
- Cashflow section inside the pack.
- Notes to the accounts.
- Fund movement note.
- Restricted funds note.
- Accounting policies.
- Debtors and creditors notes.
- Payroll/staff costs note.
- Fixed assets note.
- Related parties note.
- Reserves policy.
- Public benefit statement.
- Approval/signature page.
- Appendices/evidence index.

## Data Sources

Current and required sources include:

- `organisations`: charity name, legal name, charity number, address fields, country, logo.
- `organisation_settings`: reporting settings and account mappings.
- `memberships`, `profiles`, `employees`: trustees, officers, preparers, treasurer placeholders.
- `accounts`, `funds`, `journals`, `journal_lines`: core ledger statements.
- `budget_lines`: budget comparison schedules.
- `bank_accounts`, `bank_lines`: cash and reconciliation validation.
- `bills`: creditors and supplier liabilities.
- `donations`, Gift Aid claim/batch/declaration tables: Gift Aid note and evidence.
- `payroll_runs`: staff costs and payroll note.
- `report_versions`, `report_exports`, `report_approval_events`: professional report versioning and export records.
- Evidence storage and evidence metadata for the appendix index.

## Export Formats

Current exports:

- Browser print/save-as-PDF for annual and AGM pages.
- CSV export pack through `src/lib/exports/actions.ts`.
- Gift Aid has PDF generation patterns using `@react-pdf/renderer`.
- `exceljs` is available in dependencies.

Missing:

- Purpose-built PDF final accounts pack.
- Word/DOCX editable version.
- Excel supporting schedules workbook.
- Evidence index PDF/Excel.
- Draft/final watermarking and approval-page export metadata.

## Quality Gaps

- No guided annual accounts builder.
- No persisted annual accounts draft state.
- No structured note builder.
- No editable trustee narrative sections.
- No independent examiner/auditor details.
- No full validation checklist before export.
- No final approval/signature gate.
- SOFA and balance sheet are not yet formatted to annual accounts standard.
- Current annual report is a useful board pack, not a Charity Commission-ready accounts pack.

## Implementation Plan

1. Add `annual_accounts_drafts` for reusable builder state.
2. Add annual accounts TypeScript contracts.
3. Compose annual accounts data from existing report loaders.
4. Add upgraded SOFA and balance sheet builders.
5. Add notes and trustee annual report narrative builders.
6. Add annual accounts validation.
7. Add export foundations for PDF, DOCX, Excel, and evidence index.
8. Add guided builder route under `/reports/annual/accounts-builder`.
9. Link the existing Annual Report page to the builder.
10. Add tests and documentation.
