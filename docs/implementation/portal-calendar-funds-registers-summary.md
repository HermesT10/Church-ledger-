# Portal Calendar, Funds, And Registers Summary

## Overview
The invited user portal now has full limited views for calendar, restricted funds, income register, and expense register. Each page uses server-side portal loaders so permissions and assignment scopes are enforced before data reaches the client.

## Calendar
Portal calendar events are loaded from the shared `calendar_events` table, so portal and admin calendar data stay in sync. A portal user can see events they created, events where they are an attendee, events linked to their assigned tasks, and workspace-visible events when they have all-workspace scope.

Portal users can create events only when `calendar:create` is enabled. Created events are written to `calendar_events` and the creator is added as an organiser attendee. Inviting organisation users is guarded by the calendar comment permission and writes to `calendar_event_attendees`.

Task status updates reuse the portal task update path and remain limited to the assigned user.

## Restricted Funds
The portal funds page reads `user_fund_assignments` and only shows funds assigned to the current user. Restricted funds are shown by default. Unrestricted or designated funds appear only when explicitly assigned or when the user has all-workspace scope.

Fund totals are calculated from posted journal lines:

- Donated: income credits less debits.
- Used: expense debits less credits.
- Remaining: opening balance plus donated less used.

Fund transaction drilldowns require the same assigned-fund or all-workspace scope.

## Income Register
The portal income register wraps the existing register calculations and applies portal scope before returning data.

Supported scopes:

- All workspace: normal income register view.
- Assigned funds: only a permitted fund scope is shown.
- Assigned categories: rows are grouped by account and limited to assigned category/account IDs.

The view is read-only.

## Expense Register
The portal expense register supports:

- All workspace.
- Assigned budgets, resolved through budget lines to permitted accounts and funds.
- Assigned funds.
- Own submitted expenses, using `portal_expense_submissions`.

The view is read-only by default. If the user can submit expenses, the register links to `/portal/expenses` rather than creating a second submission flow.

## Live Updates
The portal refresh hook now listens for changes across calendar, funds, journals, journal lines, budget lines, portal permissions, fund assignments, budget assignments, and category assignments. Realtime changes trigger a server refetch, and the loaders reapply scope rules.

## Tests
`tests/portalCalendarFundsRegisters.test.ts` covers:

- Calendar visibility and admin-table sync.
- Calendar creation and attendee invite permission checks.
- Task status update wiring.
- Restricted fund scope and transaction access.
- Income register scope.
- Expense register scope.
- Live update subscriptions.
- Cross-workspace isolation in portal loaders.

## Deployment Notes
No database migration is required for this phase. It builds on existing portal permission, assignment, calendar, fund, journal, register, and portal expense submission tables.
