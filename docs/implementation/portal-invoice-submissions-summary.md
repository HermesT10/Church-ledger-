# Portal Invoice Submissions Summary

## Overview

Portal invoice submissions now extend the existing workflow invoice queue instead of creating a separate portal ledger. Invited users submit invoices through `/portal/invoices`; admins review the same records in `/workflows/invoices`; approved submissions can be converted into supplier bills and then follow the existing bill posting and payment-run process.

## Lifecycle

The invoice submission lifecycle is:

`draft -> submitted -> under_review -> approved | rejected | change_requested | voided`

After approval and bill conversion, payment state is reflected as:

`approved -> scheduled_for_payment -> paid`

`scheduled_for_payment` and `paid` are synced from linked supplier bills and payment-run items so the portal mirrors the accounting pipeline rather than creating duplicate payment records.

## Database And Security

The migration `20260430083100_portal_invoice_submissions.sql` adds lifecycle fields, budget/payment-run links, attachment metadata, indexes, and an `invoice_submission_attachments` table.

RLS has been tightened so:

- A submitter can insert only their own `draft` or `submitted` invoice.
- A submitter can edit only their own `draft` or `change_requested` invoice.
- Treasurer/admin users can review and progress organisation submissions.
- Attachment rows are visible only to the owner or treasurer/admin.

## Attachments

Portal invoice files are uploaded to the private `financial-evidence` bucket under the `invoice-submissions` evidence type. The app stores a `/api/evidence?path=...` URL rather than a stable public storage URL, so downloads go through the authenticated evidence route and are audited.

## Portal Permissions

Portal submission actions enforce `submit_invoices:submit`, `documents:upload`, ownership scope, and any selected assigned budget, fund, or category scope. The portal form shows assignment-scoped funds, budgets, and expense categories for non-privileged users.

## Admin Workflow

The admin invoice queue now supports the expanded statuses, mark-under-review, approve, reject, request changes, void, convert-to-bill, and linked bill visibility. Users are notified when invoices move under review, are approved/rejected, need changes, are scheduled, paid, or voided.

## Verification Notes

Run the targeted Vitest suite and TypeScript/lint checks from the app root:

```bash
npx vitest run tests/portalInvoiceSubmissions.test.ts tests/userPortalDashboard.test.ts
npx tsc --noEmit
npx eslint src/lib/workflows/actions.ts src/lib/bills/actions.ts src/lib/evidence/config.ts src/app/api/evidence/route.ts src/app/(app)/portal/invoices/page.tsx src/app/(app)/portal/invoices/portal-invoices-client.tsx src/app/(app)/workflows/invoices/invoices-client.tsx
```
