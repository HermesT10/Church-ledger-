# Calendar Feature Audit

## Existing Files Found

- `src/app/(app)` contains the authenticated Next.js App Router pages.
- `src/app/(app)/layout.tsx` wraps authenticated pages in the app shell.
- `src/components/app-sidebar.tsx` defines grouped sidebar navigation and role visibility.
- `src/lib/org.ts` resolves the active organisation and user membership.
- `src/lib/permissions.ts` centralises role/action/module checks.
- `src/lib/audit.ts` writes immutable audit entries with the admin client.
- `src/lib/reports/dashboard.ts` builds dashboard todo items from operational tables.
- `src/app/(app)/month-end/page.tsx` and `src/lib/insights/actions.ts` power month-end close.
- `src/lib/lettings/actions.ts` and `supabase/migrations/00095_lettings_feature.sql` manage lettings and charge due dates.
- `supabase/migrations/00013_suppliers_bills.sql` defines bills with `due_date`.
- `supabase/migrations/00014_payment_runs.sql` defines payment runs with `run_date`.
- `supabase/migrations/00022_payroll_runs.sql` defines payroll runs with `payroll_month`.
- `supabase/migrations/00086_gift_aid_claim_payment_reconciliation.sql` adds Gift Aid expected payment dates.
- `supabase/migrations/00047_workflows.sql` defines invoice submissions, expense requests, and messages.
- `src/components/ui` contains shadcn-style primitives used throughout the app.

## Integration Points

- Bills can appear as finance deadlines from `bills.due_date`.
- Lettings can appear from `lettings_charges.due_date`, joined to hirer details.
- Payroll can appear from `payroll_runs.payroll_month`.
- Payment runs can appear from `payment_runs.run_date`.
- Gift Aid can appear from `gift_aid_claim_batches.expected_payment_date` and lifecycle dates.
- Month-end can appear from current month close dates and `month_end_reviews`.
- Budget reviews can appear from `budgets.created_at` and draft status.
- Workflows can link to invoice submissions and expense requests.
- Dashboard can surface upcoming calendar events and overdue reminders as todo items.

## Schema Gaps

There is no existing first-class calendar module. The app has Gift Aid-specific
reminders, but no generic in-app notification queue. There are no calendar event,
attendee, reminder, resource, or linked-record tables.

The product uses `organisation_id` for most core finance tables. The requested
calendar schema uses `workspace_id`; calendar server actions must derive this from
`getActiveOrg().orgId` and never trust a client-submitted workspace.

## RLS And Security

Existing RLS patterns use:

- `is_org_member(...)` for member reads.
- `is_org_treasurer_or_admin(...)` for finance/admin writes.
- `auth.uid()` for user-specific rows like conversations and message reads.

Calendar visibility needs an additional policy layer:

- `workspace` events visible to active workspace members.
- `private` events visible to creator and invited attendees.
- `selected_users` events visible to creator and invited attendees.

## Implementation Sequence

1. Add calendar tables, constraints, indexes, RLS policies, and default resources.
2. Add calendar permissions and typed calendar services/actions.
3. Add derived event feeds from bills, lettings, payroll, payment runs, Gift Aid,
   budgets, month-end, and reconciliation reminders.
4. Add `/calendar` UI with month, week, day, and agenda modes.
5. Add forms, attendee responses, reminders, resource booking, and linked records.
6. Add dashboard todo integration for upcoming events and overdue reminders.
7. Add tests and implementation documentation.

## Risks

- Duplicating source deadlines can make calendar dates stale. The safer approach is
  storing manual events and projecting source records read-only.
- Recurrence can become complex quickly. MVP recurrence should expand simple rules
  and document limitations.
- Resource double-booking requires reliable overlap checks.
- Reminder delivery should not imply email sending until an email service exists.
- Dashboard queries must stay bounded by date ranges to avoid slow scans.
