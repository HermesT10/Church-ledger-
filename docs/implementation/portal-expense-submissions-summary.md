# Portal Expense Submissions Summary

## Lifecycle
Portal expense submissions now use `portal_expense_submissions` as a dedicated invited-user intake table. Statuses are `draft`, `submitted`, `changes_requested`, `approved`, `rejected`, `awaiting_bank_match`, `paid`, `reconciled`, and `voided`.

## Fields And Policy
Portal users submit an expense date, amount, detail, method, budget/category, fund, account/category, and receipt. Supplier/payee, reimbursement flag, and card assignment are optional except that card assignment is required for `card` expenses.

Workspace settings control whether receipts are required and whether overspend submissions are allowed:

- `organisation_settings.portal_expense_receipts_required`
- `organisation_settings.allow_portal_expense_overspend_submission`

The server enforces both settings, so the UI warning is not the source of truth.

## Security
The migration enables RLS on `portal_expense_submissions`. Submitters can read their own submissions, insert their own drafts/submissions, and update only their own draft/change-requested records. Admins and treasurers can review workspace rows.

Portal server actions enforce `expenses` permissions plus `own_records`, `assigned_budgets`, `assigned_funds`, and `assigned_categories` scopes. Card payments must reference an active `user_card_assignments` row owned by the submitter.

## Receipts
Receipts are stored in the private `financial-evidence` bucket under:

`{workspaceId}/portal-expense-submissions/{submissionId}/{timestamp}-{safeName}`

Downloads go through `/api/evidence`, which allows submitters to view only their own receipts while admins and treasurers can view workspace receipts.

## Budget And Overspend
Submission checks compare the selected budget/account/fund against budget lines and posted journal actuals. If the expense exceeds remaining budget, the warning is persisted for admin review. Workspaces can either allow the submission with a warning or block it.

## Admin Review
Admins can review submissions at `/workflows/portal-expenses`, approve, reject, request changes, void, convert to a manual transaction, and link to a bank transaction. The existing workflow expenses page links to the portal queue.

## Accounting Sync
Approved expenses convert into `manual_transactions` with an expense line using the selected fund and account. Duplicate prevention checks for similar manual transactions before conversion. Linked manual transaction and bank-line status changes update portal submission status toward `awaiting_bank_match`, `paid`, and `reconciled`.

## Dashboard And Realtime
The portal dashboard now reads expenses from `portal_expense_submissions`. Realtime refresh subscribes to `portal_expense_submissions` filtered by submitter, and notifications cover submitted, changes requested, approved, rejected, awaiting bank match, paid, reconciled, and voided states.

## Verification
Added `tests/portalExpenseSubmissions.test.ts` for migration, RLS, actions, receipts, budget rules, UI, dashboard, realtime, notification, and accounting sync coverage. Targeted Vitest, ESLint, TypeScript, and migration verification should be run after implementation.
