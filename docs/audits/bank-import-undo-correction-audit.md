# Bank statement import — undo and correction (audit)

## Problem

Deleting a `bank_statement_import` was only safe when **no** imported `bank_lines` carried reconciliation state. The server action `deleteBankStatementImport` rejected imports with reconciled, posted, excluded, or matched rows, which left treasurers without an in-app path to **correct** a mistaken upload beyond manual line-by-line unreconcile in the reconciliation workspace.

## Prior behaviour

- **Simple delete** (`deleteBankStatementImport`): required banking create permission; blocked when any line had allocation, reconciliation markers, confirmed matches, or certain statuses; deleted suggestions, lines, and optionally the storage object; audited `bank_statement_import_deleted` or `bank_statement_delete_blocked`.
- **Per-line unreconcile** (`unreconcileBankTransaction`): handled reversals, donations, Gift Aid guards, lettings, exclusions, and append-only `reconciliation_corrections`; some `matched_source_type` values remain **unsupported** for unreconcile (for example several payment and transfer paths).
- **No** dedicated import-level audit table for “we removed this whole import after orchestration.”

## Decisions (2026-05)

1. Add **`correction_events`** for high-level, import-scoped events (RLS: members read, treasurer/admin insert).
2. Add **`/banking/[bankAccountId]/imports/[importId]`** with metrics, correction history, download link, and a **removal wizard** for treasurers/admins.
3. Add **`removeBankStatementImportWithOptions`**: unreconcile each blocked line via `unreconcileBankTransaction` (honouring Gift Aid override), clear **match-only stray** rows (confirmed match rows with no other markers) with controlled resets, then reuse the same physical delete steps as simple delete.
4. Keep **simple delete** for finance users when the import is already “clean,” and delegate reconciled cases to the wizard (linked from the blocked delete dialog and the statements table).

## Residual risks

- Unsupported match types still **block** orchestrated removal until manually cleared.
- Partial failure mid-loop leaves data unchanged for that attempt (no half-deleted import).
- Gift Aid–sensitive donations require explicit treasurer acknowledgement in the wizard when the import has donations in claim-locked Gift Aid statuses.
