# Workspace Data Reset Audit

## Scope

This audit covers the current demo data deletion, seed data, bank account archive, cache/revalidation, and reset-related code paths. The goal is to identify why the UI can report success while records remain visible, then define the implementation surface for reliable workspace data management.

## Files Found

### Current demo data implementation

- `src/app/(app)/settings/demo-data/page.tsx`
- `src/app/(app)/settings/demo-data/demo-data-client.tsx`
- `src/app/(app)/settings/demo-data/actions.ts`
- `src/app/(app)/settings/demo-data/types.ts`

### Current settings/reset implementation

- `src/app/(app)/settings/actions.ts`
- `src/app/(app)/settings/settings-client.tsx`
- `src/app/(app)/settings/seed/actions.ts`
- `src/app/(app)/settings/seed/page.tsx`

### Current banking delete/archive implementation

- `src/lib/banking/actions.ts`
- `src/lib/banking/bankAccounts.ts`
- `src/app/(app)/banking/page.tsx`
- `src/app/(app)/settings/settings-client.tsx`

### Demo/schema support

- `supabase/migrations/00027_demo_batch_id.sql`
- `supabase/migrations/00024_data_integrity.sql`
- `supabase/migrations/00017_gift_aid_claims.sql`
- `supabase/migrations/00089_banking_schema_foundation.sql`
- `supabase/migrations/20260501101600_blank_canvas_onboarding.sql`

### Cached dashboard/report surfaces

- `src/lib/cache.ts`
- `src/lib/reports/dashboard.ts`
- `src/lib/reports/actions.ts`
- `src/lib/reports/actuals.ts`
- `src/app/(app)/dashboard/page.tsx`
- `src/app/(app)/reports/monthly-dashboard/page.tsx`

## Current Broken Behaviour

Users can click "Clear Demo Data" and see a success message even though some records remain visible. The current clear flow only deletes rows where `demo_batch_id is not null` in a hard-coded list of tables. It does not remove all seed/demo-like records and does not invalidate all cached dashboard/report data.

The settings page also contains a misleading "reset workspace" action. `resetMyWorkspace()` only resets the current user's profile preferences; it does not reset financial workspace data.

## Why The UI Says Deleted But Data Remains

1. `DemoDataClient` treats a successful `clearDemoData()` result as authoritative and locally sets `batchInfo` to zero.
2. `clearDemoData()` only removes rows in `DELETE_ORDER`; it omits `accounts`, even though `generateDemoData()` writes `demo_batch_id` to accounts.
3. `seedBankAccounts()` creates `Bank Account 1`, `Bank Account 2`, and `Bank Account 3` without `demo_batch_id`, so demo-looking bank accounts are not removable by the demo clear action.
4. Current cleanup ignores newer modules such as statement imports, register mappings, banking suggestions, report exports, document exports, lettings, payroll completeness tables, calendar finance-linked events, and dashboard task records.
5. `clearDemoData()` does not call `invalidateOrgReportCache()` or broad `revalidatePath()` calls. Cached dashboard/report results can remain visible for up to their configured TTL.
6. Some child-table deletion is not tenant-scoped because those tables lack `organisation_id`; current code deletes them by `demo_batch_id is not null` only.

## Current Security Risks

`generateDemoData(orgId)` and `clearDemoData(orgId)` accept an `orgId` from the client and then use `createAdminClient()`. They use `getActiveOrg()` for role/user checks but do not verify the supplied `orgId` matches the active organisation. This creates an IDOR risk for admins who can tamper with client calls.

The rebuilt actions must derive the workspace id server-side from `getActiveOrg()` and never trust a client-submitted workspace id.

## Current Demo Tagging

The project uses `demo_batch_id uuid`, not `is_demo`.

`supabase/migrations/00027_demo_batch_id.sql` adds `demo_batch_id` to:

- `funds`
- `journals`
- `journal_lines`
- `bank_accounts`
- `bank_lines`
- `suppliers`
- `bills`
- `bill_lines`
- `payment_runs`
- `payment_run_items`
- `donors`
- `donations`
- `gift_aid_claims`
- `giving_imports`
- `giving_import_rows`
- `payroll_runs`
- `payroll_run_splits`
- `bank_reconciliation_matches`

There is no generic demo registry table today.

## Current RLS And Trigger Behaviour

Several tables have RLS delete policies, but current demo deletion uses `createAdminClient()` and bypasses RLS. The hard-delete triggers were modified to allow deletion of rows where `demo_batch_id is not null`:

- `block_hard_delete()`
- `block_posted_mutation()`
- `block_posted_journal_line_mutation()`

This helps demo deletion for legacy demo-tagged rows but does not cover all modern financial tables or untagged seed records.

## Current Cache/Revalidation Behaviour

`src/lib/cache.ts` exposes `invalidateOrgReportCache(orgId)`, which invalidates:

- `reports:org:{orgId}`
- `reports:org:{orgId}:dashboard`
- `reports:org:{orgId}:dashboard-overview`
- `reports:org:{orgId}:actuals`

Current demo clear does not call this helper. It also does not revalidate affected routes such as:

- `/dashboard`
- `/banking`
- `/reports`
- `/funds`
- `/accounts`
- `/income/register`
- `/expenses/register`
- `/calendar`

## Tables Affected By Financial Reset

The reset scope should include, where present:

- Banking: `bank_reconciliation_matches`, `bank_lines`, `bank_statement_imports`, `bank_import_mappings`, `bank_rules`, `categorisation_suggestions`, `bank_transaction_mappings`, `bank_accounts`
- Ledger: `journal_lines`, `journals`, `manual_transaction_lines`, `manual_transactions`, `transactions`, `transaction_lines`
- Registers and references: `register_category_mappings`, `register_categories`, `income_streams`, `accounts`, `funds`
- Payables/workflows: `bill_lines`, `bills`, `payment_run_items`, `payment_runs`, `invoice_submissions`, `expense_requests`
- Giving/Gift Aid: `gift_aid_claim_line_edits`, `gift_aid_claim_lines`, `gift_aid_exports`, `gift_aid_claim_payment_allocations`, `gift_aid_claim_batches`, `gift_aid_claims`, `gift_aid_declaration_documents`, `gift_aid_declaration_links`, `gift_aid_reminders`, `gift_aid_small_donation_batches`, `donor_matching_aliases`, `recurring_donor_patterns`, `donations`, `gift_aid_declarations`, `donors`
- Payroll: `payroll_lines`, `payroll_run_splits`, `payroll_liability_payments`, `payroll_reversals`, `payroll_import_rows`, `payroll_import_batches`, `payroll_runs`
- Cash and lettings: `cash_collections`, `cash_spends`, `lettings_documents`, `lettings_payments`, `lettings_charges`, `lettings_hirers`
- Budgets/reports/documents: `budgets`, `budget_lines`, `report_exports`, `report_versions`, `report_review_comments`, `annual_accounts_drafts`, `year_end_close_steps`, `year_end_close_runs`, `filing_packs`, `export_versions`, `dashboard_tasks`
- Calendar: finance-linked `calendar_event_links`, `calendar_reminders`, and `calendar_events`

## Dependency Order

The safe order is children before parents:

1. Report/document exports and review/comment children.
2. Calendar reminders, event links, and dashboard tasks linked to financial records.
3. Gift Aid claim children, exports, allocations, reminders, declaration docs/links, then donations and donors.
4. Reconciliation matches, categorisation suggestions, bank transaction mappings, bank lines, statement imports, then bank accounts.
5. Portal/workflow submission links, bill lines, payment run items, payment runs, bills.
6. Payroll import rows, payroll lines, payroll splits, payroll liabilities/reversals, payroll runs.
7. Lettings documents, payments, charges, then hirers.
8. Manual transaction lines before transactions.
9. Journal lines before journals.
10. Register mappings before register categories.
11. Budgets and budget lines.
12. Accounts and funds last, after all dependent financial rows are removed or unlinked.

The current demo deletion order likely has a Gift Aid FK issue: `donations.gift_aid_claim_id` points to legacy `gift_aid_claims`, while current `DELETE_ORDER` deletes `gift_aid_claims` before `donations`.

## Implementation Plan

1. Add a reset history table and a generic demo registry.
2. Add transaction-safe RPCs for preview, demo deletion, and full financial reset.
3. Build server actions that derive workspace id from `getActiveOrg()`, require admin, enforce typed confirmation, call RPCs, log audit events, and revalidate affected routes.
4. Add Settings -> Data Management with count previews, destructive confirmation, optional document/export deletion checkboxes, result summaries, and reset history.
5. Repair demo seeding to register seeded rows and stop trusting client-submitted workspace ids.
6. Add tests for permissions, cross-workspace safety, demo deletion, full reset, preserved organisation access/settings, no orphaned child rows, confirmation phrases, and cache invalidation.
