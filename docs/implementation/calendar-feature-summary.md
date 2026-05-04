# Calendar Feature Summary

## Feature Overview

The Calendar module adds a shared operational calendar for church events,
finance deadlines, reminders, trustee meetings, lettings, payroll dates, Gift Aid
dates, and month-end tasks.

The feature uses a hybrid model:

- Manual calendar records are stored in `calendar_events`.
- Existing finance and operational dates remain authoritative in their source
  modules and are projected into the calendar as read-only derived events.

## Schema Changes

The migration adds:

- `calendar_events`
- `calendar_event_attendees`
- `calendar_reminders`
- `calendar_resources`
- `calendar_event_links`

All tables are scoped by `workspace_id`, which is the active organisation id in
application code. Server actions derive it from `getActiveOrg()` and never trust
client-submitted tenant scope.

## Event Categories

Supported categories include general events, worship, trustee meetings, lettings,
finance deadlines, payroll, Gift Aid, month-end close, payment runs, budget review,
bank reconciliation, and reminders.

## Permission Rules

- Active workspace members can read workspace-visible events.
- Private and selected-user events are visible to the creator and attendees.
- Admins, treasurers, and finance users can create, update, cancel, and delete
  operational calendar events.
- Invited users can update their own attendee response.

## Integration Points

Derived feeds reference:

- Bills
- Lettings charges
- Payroll runs
- Payment runs
- Gift Aid claim batches
- Month-end reviews
- Budgets
- Bank reconciliation reminders

Derived events expose stable ids such as `bill:<id>` and include source metadata
for linking back to the source module.

## Recurrence Limitations

MVP recurrence stores a simple `recurrence_rule` value: `none`, `daily`, `weekly`,
`monthly`, or `yearly`. Recurring events are expanded during date-range reads
without creating every occurrence. Exception dates and partial-series editing are
future enhancements.

## Reminder Behaviour

Reminders are stored and surfaced in-app/dashboard. No email or SMS delivery is
implied by this implementation.

## Resource Booking

Calendar resources are seeded with common church rooms. Manual scheduled events
block double booking by default using an overlap check on `workspace_id`,
`resource_id`, `start_at`, and `end_at`.

## Future Sync Hooks

Future work can add outbound iCal feeds, Google/Microsoft calendar sync, email
notifications, recurring-event exceptions, source-date editing with confirmation,
and richer document linking.
