# Journal Edit, Delete, Reversal, And Amendment Audit

## Scope

This audit covers the current General Journal system and the changes needed to allow safe draft editing/deletion and posted-journal correction workflows without silently rewriting accounting history.

## Files Found

| Area | Files / Symbols |
| --- | --- |
| Journals list | `src/app/(app)/journals/page.tsx` |
| New journal route | `src/app/(app)/journals/new/page.tsx` |
| Journal detail route | `src/app/(app)/journals/[id]/page.tsx` |
| Journal form/client | `src/app/(app)/journals/journal-form.tsx` |
| Route server-action wrappers | `src/app/(app)/journals/actions.ts` |
| Journal server logic | `src/lib/journals/actions.ts` |
| Reversal helpers | `src/lib/journals/reversal.ts` |
| Journal shared types | `src/lib/journals/types.ts` |
| Period locks | `src/lib/periods/actions.ts`, `supabase/migrations/00038_financial_periods.sql`, `supabase/migrations/00050_phase2_controls.sql` |
| Reconciliation links | `supabase/migrations/00021_bank_reconciliation.sql`, `supabase/migrations/00089_banking_schema_foundation.sql` |
| Audit logging | `src/lib/audit.ts`, `supabase/migrations/00028_audit_log.sql` |
| Report consumers | `src/lib/reports/glReports.ts`, `src/lib/reports/actions.ts`, `src/lib/reports/actuals.ts`, `src/lib/reports/balanceSheet.ts`, `src/lib/reports/fundMovements.ts`, `src/lib/reports/dashboard.ts`, `src/lib/registers/actions.ts`, `src/lib/accounts/balances.ts` |

## Current Schema

`journals` is created in `00007_journals.sql` with:

- `organisation_id`
- `journal_date`
- `memo`
- `status public.journal_status default 'draft'`
- `posted_at`
- `created_by`
- `created_at`

Later migrations add:

- `reference`
- `source_type`, `source_id`
- `period_id`
- `reversal_of`
- `reversed_by`
- `approved_by`, `approved_at`
- `attachment_url`
- `reversal_reason`
- `demo_batch_id`

`journal_lines` has:

- `journal_id`
- `organisation_id`
- `account_id`
- `fund_id`
- `supplier_id`
- `description`
- `debit_pence`
- `credit_pence`

Current `journal_status` enum is `draft`, `approved`, `posted`.

## Current Lifecycle

1. Users create journals as `draft`.
2. Drafts can be edited through `updateJournal`.
3. Drafts can be approved through `approveJournal`.
4. Approved journals can be posted through `postJournal`.
5. Draft journals can be deleted through `deleteJournal`.
6. Posted journals can be reversed by `reverseJournal`, but the UI does not currently expose this action.

`reverseJournal` creates a new journal with debit/credit swapped, posts it, and sets `reversed_by` on the original. The original journal remains `posted`, which is important because current reports sum `status = 'posted'` journal lines. If original rows were changed to `reversed` without report changes, the reports would show only the reversal.

## Current Safeguards

- RLS allows journal select for workspace members.
- Journal insert/update/delete policies are limited to treasurer/admin style roles and draft journals.
- Journal line insert/update/delete policies require the parent journal to be `draft`.
- `journal_is_balanced` verifies posted journals have at least two balanced lines.
- `handle_journal_post` blocks unbalanced posting.
- `block_posted_mutation` blocks direct posted journal update/delete except narrow reversal-link metadata.
- `block_posted_journal_line_mutation` and `prevent_posted_journal_line_mutation` block direct posted line mutation.
- App actions use `isDateInLockedPeriod` to block locked-period create/edit/approve/post/delete.

## Risks

1. `updateJournal` did not explicitly verify `status = 'draft'` before deleting/reinserting lines; it relied on RLS/triggers.
2. `postJournal` uses the service-role admin client to update status, so server-side validation must remain strict.
3. `handle_journal_post` enforces balance but not locked periods.
4. `reverseJournal` existed server-side but had no UI, no required reason UI, and defaulted the reversal date to today.
5. Reversal reporting is date-window sensitive. A reversal dated after a report period will not cancel the original in that prior report period.
6. `bank_reconciliation_matches.journal_id` uses `on delete cascade`; draft delete must guard against reconciliation matches and other external links.
7. `createJournal` and `updateJournal` had no audit events.
8. No amendment workflow existed.
9. Current UI uses one form for edit and read-only detail; posted journal detail lacks correction-chain context and correction actions.

## Missing Safeguards

- Explicit draft-only checks in `updateJournal`.
- Reconciled/external dependency guard before deleting a journal.
- Required reversal reason/date in the UI.
- Amendment chain fields and action.
- Posted-by, void, amendment, and correction metadata.
- Audit events for draft edit and amendment start.
- Status/type support for `reversed`, `correcting`, and `voided`.

## Reporting Impact

Most reports read posted `journal_lines` joined to `journals` with `status = 'posted'`. This means:

- draft edits/deletes have no reporting impact until posting
- reversal journals affect reports as normal posted journals
- amendment replacement drafts have no impact until posted
- report cache must be invalidated on post, reverse, amend, and draft delete where downstream screens may show journal counts

## Implementation Plan

1. Extend journal lifecycle schema with posted/reversal/amendment/void metadata and enum statuses.
2. Keep original reversed journals as `posted` with `reversed_by` metadata for report compatibility, while displaying an effective reversed state in the UI.
3. Strengthen `updateJournal` with explicit workspace, draft, locked-period, and audit checks.
4. Strengthen `deleteJournal` with dependency preview/guards and audit metadata.
5. Add reversal date and reason to the UI and server action.
6. Add `amendJournal` that creates a reversal and a corrected replacement draft linked to the original.
7. Add journal list/detail actions: view, edit draft, delete draft, post, reverse, amend.
8. Add implementation tests and documentation.
