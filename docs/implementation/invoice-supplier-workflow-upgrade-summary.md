# Invoice & Supplier Workflow Upgrade Summary

## Payable vs Receivable Model

The upgrade separates product language and storage responsibilities:

- **Bills to Pay** are supplier bills the church needs to pay. They continue to use the existing `bills` and `bill_lines` model so current payment runs, supplier spend, expense registers, and reports keep working.
- **Invoices Owed to Us** are customer/hirer invoices created by the church. These use new receivable invoice tables so the feature can evolve without destabilising the payable workflow.

The UI uses `payable` and `receivable` direction values:

- `payable`: church owes money.
- `receivable`: money is owed to the church.

## Inline Supplier Creation

Inline supplier creation must:

- Derive `organisation_id` from `getActiveOrg()`.
- Enforce create permissions server-side.
- Never accept a client-supplied workspace id.
- Check for likely duplicates before inserting.
- Write `audit_log` with `action = 'create_supplier_inline'`.
- Return the created supplier so the form can select it immediately.

## Inline Customer / Hirer Creation

The first implementation reuses `lettings_hirers` as the customer/hirer table because it already supports contact details, default income account, default fund, status, and audit-ready timestamps.

Inline hirer creation must:

- Derive `organisation_id` server-side.
- Create an active hirer/customer.
- Make the row available to Lettings.
- Write `audit_log` with `action = 'lettings_hirer_create'` or a more specific inline action.

## Inline Account Creation

Inline account creation uses the existing chart-of-accounts model:

- Bills to Pay may only create/select `expense` accounts.
- Invoices Owed to Us may only create/select `income` accounts.
- New inline invoice accounts should set `available_in_invoices = true`.
- Actions should detect duplicate names/codes and return a clear warning/error.
- Audit logging should use `entityType = 'account'`.

## Invoice PDF Generation

Receivable invoice documents should include:

- Church name, charity number, address/contact.
- Invoice number, dates, status/watermark.
- Billed-to hirer/customer.
- Line items and total.
- Payment instructions and configured bank details when available.
- Notes/message to recipient.

Initial implementation can generate a PDF response on demand. Persisting generated exports can be added by storing a document path/metadata on `receivable_invoices`.

## Reconciliation Integration

Reconciliation should suggest:

- Outgoing bank transactions: unpaid/scheduled supplier bills by supplier, amount, due date, and reference.
- Incoming bank transactions: unpaid receivable invoices by hirer/customer, amount, due date, invoice number/reference.

Receivable invoice payments must not be treated as donations unless the user explicitly chooses a donation match.

## Supplier UI Redesign

Supplier list should use premium app patterns already present in the app:

- `PageShell`, `PageHeader`, `StatCard`, rounded cards, badges, and clean table spacing.
- Top cards: total suppliers, active suppliers, spend this year, outstanding bills, overdue bills.
- Filters/search/sort for active, archived, outstanding, high spend, name/spend/last payment.
- Table: supplier name, default account, default fund, spend YTD, outstanding, last payment, status, actions.

Supplier detail should be organised into tabs:

1. Overview
2. Bills
3. Payments
4. Bank Rules / Aliases
5. Documents
6. Audit History

## Permission Rules

All write paths must:

- Derive `organisation_id` server-side.
- Enforce role/module permissions.
- Respect RLS and avoid service-role exposure client-side.
- Use admin/service clients only in server-only helpers where necessary.
- Write audit events for create/update/approve/send/post/match actions.

## Safe Rollout Strategy

1. Add schema and server-side helpers additively.
2. Keep existing payable bill functionality intact.
3. Introduce tabs and clearer copy without changing underlying payable accounting.
4. Add receivable invoice creation in draft/sent/paid lifecycle.
5. Add PDF preview/download.
6. Add reconciliation suggestions once receivable data exists.
7. Harden tests and permissions before enabling more automation.
