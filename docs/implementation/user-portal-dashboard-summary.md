# User Portal Dashboard Summary

## Routes

The invited user portal now lives under `/portal` with a separate limited shell and permission-aware navigation:

- `/portal/dashboard`
- `/portal/budgets`
- `/portal/invoices`
- `/portal/cash-collections`
- `/portal/expenses`
- `/portal/calendar`
- `/portal/funds`
- `/portal/income-register`
- `/portal/expense-register`

Each page performs server-side portal permission checks before loading data.

## Schema

The migration `20260429231500_portal_dashboard.sql` adds:

- `portal_tasks` for admin-assigned portal tasks linked optionally to calendar events.
- `portal_notifications` for user-facing portal updates.
- RLS policies so admins can manage workspace rows and invited users can only read or update their own task/notification rows.
- Indexes for assigned task and notification lookups.
- Best-effort Supabase Realtime publication entries for the new portal tables.

## Data Sources

Portal dashboard data is loaded through `src/lib/portal/dashboard.ts`, which deliberately avoids the full organisation-wide dashboard loader. It scopes data to the current user through:

- `portal_user_permissions`
- `user_budget_assignments`
- `user_fund_assignments`
- user-owned invoice submissions, expenses, and cash collections
- assigned portal tasks
- visible calendar events
- user-specific notifications

## Dashboard

The dashboard shows:

- My Assigned Budgets
- My Tasks
- Upcoming Events
- Pending Submissions
- Approved/Paid Updates
- Restricted Funds Summary when permitted
- Admin Notifications

The UI uses the existing card styling and app design language while keeping the portal separate from admin finance dashboards.

## Live Updates

The portal dashboard uses a client refresh hook with:

- Supabase Realtime subscriptions for portal tasks, notifications, permissions, and assignment tables.
- `router.refresh()` on relevant changes.
- Fallback refresh on window focus, tab visibility changes, and a 45-second interval.

## Notifications

Portal notifications are created from:

- invoice approval/rejection/conversion
- expense approval/rejection/conversion
- cash collection posting/review
- calendar event assignment
- calendar reminder assignment
- Portal Access permission/assignment updates

## Remaining Notes

The first rollout is intentionally conservative. Portal register pages are read-only and scoped by page permission; deeper category-level register filtering should continue in a later hardening pass where each row can be tied to assigned categories consistently.
