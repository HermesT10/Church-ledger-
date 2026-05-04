# Document Production Audit

## Files Found

### CSV Exports

- `src/lib/exports/actions.ts`
- `src/lib/exports/csvExport.ts`
- `src/app/(app)/reports/export-pack/export-pack-client.tsx`

The current CSV system is the strongest export surface. It builds downloadable CSV strings for trial balance, income and expenditure, balance sheet, SOFA, fund movements, supplier spend, cash position, cash flow, Gift Aid summary, bank reconciliation summary, leadership snapshot, budget vs actual, and trustee snapshot.

### Professional Reporting Engine

- `src/lib/reports/engine/types.ts`
- `src/lib/reports/engine/exports.ts`
- `src/lib/reports/engine/service.ts`
- `src/components/reports/professional/index.tsx`
- `supabase/migrations/20260430133100_professional_reporting_engine.sql`

The engine already has `report_versions`, `report_exports`, approval events, validation, traceability, and a saved snapshot contract. CSV exports are generated from the snapshot. PDF, DOCX, and Excel currently return placeholder JSON payloads rather than binary documents.

### Annual Accounts And Trustee Packs

- `src/lib/annual-accounts/exports.ts`
- `src/lib/annual-accounts/data.ts`
- `src/components/annual-accounts/index.tsx`
- `src/lib/reports/trustee-packs/exports.ts`
- `src/lib/reports/trustee-packs/data.ts`
- `src/components/reports/trustee-packs/index.tsx`

Annual accounts and trustee packs expose export descriptors for PDF, DOCX, Excel, and evidence indexes. The evidence index CSV is real. The PDF/DOCX exports are currently hook strings, and Excel exports are structured JSON rather than `.xlsx` workbooks.

### Year-End Filing Pack

- `src/lib/year-end-close/filing-pack.ts`
- `src/lib/year-end-close/actions.ts`
- `src/app/(app)/year-end-close/[runId]/year-end-close-client.tsx`

The filing pack composer includes annual accounts, trustee report, Excel schedules, evidence index, Annual Return Assistant, trial balance, SOFA, fund movements, bank reconciliation, Gift Aid, payroll summary, audit log reference, and examiner checklist. The document records currently reference placeholder export content rather than stored binary files.

### Secure Storage And Signed URLs

- `src/lib/evidence/actions.ts`
- `src/app/api/evidence/route.ts`
- `src/lib/evidence/config.ts`
- `src/lib/giftaid/actions.ts`
- `supabase/migrations/00066_private_financial_evidence.sql`

Private storage exists for financial evidence. Evidence downloads validate active organisation membership and permissions, then issue short-lived signed URLs. Report exports do not yet use this storage pattern.

## Current Persistence

- `report_versions` stores the approved or draft report snapshot.
- `report_exports` stores export events, format, file name, checksum, generated user, and optional `storage_path`.
- `report_exports.storage_path` exists but is not populated by the current export flow.
- There is no dedicated `export_versions` table.
- There is no report export download API that checks source visibility and returns a signed URL.

## Gaps

- PDF exports are placeholders, not print-ready documents.
- DOCX exports are placeholders, not editable Word documents.
- Excel exports are JSON strings, not real workbooks.
- No reusable document template system exists for cover, contents, statements, notes, appendices, approvals, evidence indexes, or footers.
- No canonical export metadata model exists across reports, annual accounts, trustee packs, Gift Aid schedules, audit logs, funds, payroll, bank reconciliation, and evidence indexes.
- No stored `export_versions` lifecycle exists.
- No private `document-exports` bucket exists.
- No signed download URL route exists for document exports.
- Professional report export links are not fully wired to stored document generation.
- Draft/final status, watermarking, page footers, generated-by metadata, versioning, validation snapshots, and checksum tracking are inconsistent across export surfaces.

## Implementation Sequence

1. Add `export_versions` and private document export storage.
2. Add a shared document-production model and template registry.
3. Add PDF, DOCX, Excel, and CSV renderers.
4. Add storage upload, checksums, export versioning, and signed download authorisation.
5. Add source adapters for report versions, annual accounts, trustee packs, annual reports, AGM packs, Gift Aid schedules, audit logs, funds, payroll, bank reconciliation certificates, and evidence indexes.
6. Wire the report engine, annual accounts, trustee packs, year-end filing pack, and export UIs to the new layer.
7. Add tests and implementation documentation.
