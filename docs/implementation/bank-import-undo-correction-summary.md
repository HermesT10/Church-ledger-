# Bank statement import — undo and correction (implementation summary)

## Database

- Migration `supabase/migrations/20260503140000_correction_events.sql` adds `public.correction_events` with `event_type` initially constrained to `bank_statement_import_removed`, tenant sync trigger, indexes, and RLS (`select` for org members, `insert` for `is_org_treasurer_or_admin`).

## Server

- `src/lib/banking/correction-events.ts`: `listCorrectionEventsForStatementImport`, `insertBankStatementImportRemovalEvent`.
- `src/lib/banking/import-actions.ts`:
  - `getBankStatementImportDetail` — import row, bank account label, aggregates (including `lines_needing_undo` and Gift Aid–locked donation counts), and correction events.
  - `createBankStatementImportSignedDownloadUrl` — short-lived signed URL for the stored evidence file.
  - `removeBankStatementImportWithOptions` — treasurer/admin only; clears **match-only stray** lines; unreconciles remaining blocked lines through `unreconcileBankTransaction`; verifies the import is safe to delete; deletes lines and import; optional storage removal; writes `correction_events` + audit `bank_statement_import_removed_orchestrated`; revalidates banking, reconciliation, donations, Gift Aid, journals, dashboard, and reports.

## UI

- `src/app/(app)/banking/[bankAccountId]/imports/[importId]/page.tsx` — detail + metrics + correction history.
- `statement-import-removal-wizard.tsx` — reason, Gift Aid acknowledgement when needed, optional file deletion, typed confirmation `REMOVE IMPORT`.
- `statement-import-download-button.tsx` — client download trigger.
- `statement-delete-action.tsx` — link to the wizard when delete is blocked.
- `src/app/(app)/banking/[bankAccountId]/page.tsx` — **Details** column → import detail route.

## Tests

- `tests/bankImportUndoCorrection.test.ts` — static wiring checks for migration, correction-events helper, and import-actions surface.
