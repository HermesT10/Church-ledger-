# Admin User Monitoring Summary

## Admin-only access model

Admin monitoring is loaded only from the employee detail route and only when the active organisation role is `admin`. The loader validates that the employee belongs to the active workspace before using the admin client for read-only monitoring queries. Non-admin users receive `null` monitoring data and cannot see the monitoring tabs.

## Data sources by tab

- Overview combines portal user link state, latest invite status, enabled permission counts, budget assignments, and card assignments.
- Portal Access remains the management tab for invites, permissions, scopes, and assignment editing.
- Budgets uses `user_budget_assignments`, `budgets`, `budget_lines`, posted `journal_lines`, `portal_expense_submissions`, and `invoice_submissions`.
- Submissions uses `invoice_submissions`, `portal_expense_submissions`, and `cash_collection_submissions`.
- Transactions uses manual transactions created by the user, manual transactions linked from portal expenses, and linked `bank_lines`.
- Cards uses `user_card_assignments`, linked bank accounts, and card-linked portal expense spend.
- Calendar uses `calendar_events`, `calendar_event_attendees`, and `portal_tasks`.
- Activity / Audit combines invites, submissions, notifications, calendar/task records, and `audit_log`.

## Budget usage calculations

Each assigned budget/category row totals monthly `budget_lines` into an annual allocation, adds posted actuals from matching journal lines, and adds pending amounts from submitted/approved portal expenses and invoice submissions. Remaining balance is calculated as:

```ts
allocation - used - pending
```

Overspend risk is marked as `overspent` when remaining is negative, `attention` when remaining falls below 10% of the allocation, and `ok` otherwise.

## Submission and transaction linking

The monitoring tabs are read-only. Submission rows include links back to the existing review queues instead of duplicating approval actions. Transaction rows include manual transactions and linked bank lines so admins can inspect reconciliation state from the central transaction or banking screens.

## Card assignment monitoring

Assigned cards are enriched with linked bank account names, spending limits, spend from card-linked portal expenses, remaining limit, and related manual/bank transaction rows.

## Timeline mapping

The activity timeline normalizes invite sent/accepted records, portal submissions, portal notifications, calendar/task records, and audit log entries into a single descending list with source type, source ID, severity, and optional href.

## Tests and deployment notes

Added `tests/adminUserMonitoring.test.ts` and extended `tests/userPortalPermissions.test.ts` for the new tabs. No database migration or Supabase push is expected for this feature because it uses existing tables and audit data.
