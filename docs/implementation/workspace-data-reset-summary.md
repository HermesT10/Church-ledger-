# Workspace Data Reset Implementation Summary

## Reset Scopes And Preserved Data

Workspace data reset is scoped to the active organisation only. Server actions derive the workspace from `getActiveOrg()` and require the caller to be an admin before using the service-role client.

The reset preserves:

- `organisations`
- profiles and user accounts
- memberships, roles, and portal access
- organisation profile and non-financial settings
- audit logs
- reset history rows

The full financial reset removes financial, workflow, banking, giving, payroll, lettings, reporting, dashboard task, and finance-linked calendar data where the table exists in the current schema. It also clears financial account references in settings before deletion, including default bank account, payroll accounts, Gift Aid accounts, donation defaults, cash in hand, and payroll settings.

After a full reset, setup state is restored to a blank workspace so the dashboard can guide admins through a clean start.

## Demo Deletion Logic

Demo deletion uses two sources:

- `demo_seed_records`, a generic registry of seeded demo rows.
- Existing `demo_batch_id` values on workspace-scoped tables.

New demo generation registers rows in `demo_seed_records` after seeding. The old demo clear action now delegates to the same database RPC used by Settings -> Data Management, so cleanup is transaction-safe and workspace-scoped.

## Table And Dependency Order

The SQL function `workspace_reset_table_order()` defines the deletion order. Children are removed before parents, including report children, calendar links/reminders, Gift Aid claim children, reconciliation matches, payment run items, bill lines, payroll children, lettings children, manual transaction lines, journal lines, register mappings, budgets, accounts, and funds.

Tables that are not present in a deployment are skipped by the RPCs using `to_regclass()`.

## Permissions And Confirmation Rules

Only workspace admins can preview history or perform destructive actions from the new server actions.

The server requires exact typed confirmations:

- `DELETE DEMO` for demo deletion.
- `RESET` for full financial reset.

The client UI also requires these confirmations before enabling destructive buttons.

## Audit And History Records

Every RPC-backed destructive action creates a row in `workspace_data_reset_runs` with action type, status, requester, options, counts, errors, and timestamps. Server actions also write audit events for requested, completed, and failed reset actions through `logAuditEvent()`.

## Cache Revalidation Strategy

Successful resets call `invalidateOrgReportCache(orgId)` and revalidate the affected routes:

- `/dashboard`
- `/banking`
- `/reports`
- `/funds`
- `/accounts`
- `/income/register`
- `/expenses/register`
- `/settings/data-management`
- `/calendar`
- module routes such as Gift Aid, payroll, lettings, transactions, and reconciliation

## Troubleshooting

If a reset fails with a foreign key error, check whether a newer child table is missing from `workspace_reset_table_order()` or lacks a workspace-scoped delete path.

If rows remain visible after a successful reset, check whether they belong to preserved organisation/profile/access tables, whether the route is cached, and whether the table is included in `workspace_reset_table_order()`.

If demo rows remain after demo deletion, confirm the rows either have `demo_batch_id` on a workspace-scoped table or are present in `demo_seed_records`.
