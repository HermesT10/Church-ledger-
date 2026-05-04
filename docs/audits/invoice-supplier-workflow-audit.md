# Invoice & Supplier Workflow Audit

## Current Files Found

### Invoice / Bill UI

- `src/app/(app)/workflows/invoices/page.tsx` loads invoice submissions, suppliers, funds, and expense accounts for the staff workflow page.
- `src/app/(app)/workflows/invoices/invoices-client.tsx` renders the staff invoice submission workflow, including submit/review/approve/reject/request-changes/void/convert-to-bill actions.
- `src/app/(app)/portal/invoices/page.tsx` loads portal invoice submissions and options.
- `src/app/(app)/portal/invoices/portal-invoices-client.tsx` renders portal invoice submission and draft/resubmission flows.
- `src/app/(app)/bills/page.tsx` lists supplier bills but labels them as "Invoices".
- `src/app/(app)/bills/new/page.tsx` creates a supplier bill but labels it "New Invoice".
- `src/app/(app)/bills/[id]/page.tsx` displays a supplier bill.
- `src/app/(app)/bills/bill-form.tsx` is the main supplier bill form with supplier, invoice number/date/due date, evidence upload, and bill lines.

### Supplier UI

- `src/app/(app)/suppliers/page.tsx` lists suppliers with basic stats and filters.
- `src/app/(app)/suppliers/new/page.tsx` renders supplier creation.
- `src/app/(app)/suppliers/[id]/page.tsx` renders supplier detail with contact/default settings, match rules, invoices, and tagged expenses.
- `src/app/(app)/suppliers/[id]/edit/page.tsx` renders supplier edit.
- `src/app/(app)/suppliers/supplier-edit-form.tsx` edits supplier contact/default fields.
- `src/app/(app)/suppliers/[id]/match-rules-client.tsx` manages supplier auto-match rules.

### Server Actions / Types

- `src/lib/workflows/actions.ts` manages `invoice_submissions`, review lifecycle, file upload linkage, and conversion to `bills`.
- `src/lib/workflows/types.ts` defines `InvoiceSubmissionRow` and related portal workflow types.
- `src/lib/bills/actions.ts` manages supplier bill CRUD, approval, posting, payment runs, supplier helper actions, and evidence links.
- `src/lib/suppliers/actions.ts` manages supplier listing/detail/edit/archive, invoice stats, expenses, and match rules.
- `src/lib/suppliers/types.ts` defines supplier and supplier invoice types.
- `src/lib/accounts/actions.ts` creates/updates accounts and already derives the active organisation server-side.

## Current Data Model

### Supplier Bills / Payables

- `supabase/migrations/00013_suppliers_bills.sql`
  - `suppliers`: `organisation_id`, `name`, `email`, `bank_details`, `created_at`.
  - `bills`: `organisation_id`, `supplier_id`, `bill_number`, `bill_date`, `due_date`, `status`, `total_pence`, `journal_id`, `created_by`, `created_at`.
  - `bill_lines`: `bill_id`, `account_id`, `fund_id`, `description`, `amount_pence`.
  - Bill statuses are `draft`, `approved`, `posted`, `paid`.
  - A trigger blocks moving to approved/posted when there are no lines or line total differs from bill total.

- `supabase/migrations/00034_suppliers_enhancement.sql`
  - Adds supplier `contact_name`, `phone`, `address`, `default_account_id`, `default_fund_id`.

- `supabase/migrations/00051_post_bill_atomic.sql`
  - Posts approved bills by creating posted journals with `source_type = 'bill'`.
  - Debits expense bill lines and credits the configured creditors/AP account.

- `supabase/migrations/00052_post_payment_run_atomic.sql`
  - Posts approved payment runs with `source_type = 'payment'`.
  - Debits creditors/AP and credits the bank GL account.
  - Marks included bills as `paid`.

### Invoice Submissions

- `supabase/migrations/00047_workflows.sql` creates `invoice_submissions` for submitted supplier invoices.
- `supabase/migrations/20260430083100_portal_invoice_submissions.sql` expands lifecycle fields, attachment metadata, payment sync, and RLS.
- `invoice_submissions` is an intake/review table, not a normalized invoice header/line model.

### Customers / Hirers

- `supabase/migrations/00095_lettings_feature.sql`
  - `lettings_hirers` are the closest existing customer/hirer model.
  - Fields include `name`, `contact_name`, `email`, `phone`, `default_fund_id`, `default_income_account_id`, `status`, `notes`.
  - Missing for this workflow: `address`.

### Documents / PDF

- `src/lib/evidence/config.ts` maps `bills` and `invoice-submissions` to the `financial-evidence` bucket.
- There is no dedicated receivable invoice PDF generator.
- Existing PDF patterns are in other modules, such as Gift Aid declarations and reconciliation certificates.

## Are Invoices Only Supplier Bills Today?

Yes. The current product uses "invoice" language for supplier bill intake and payment workflows. There is no model for invoices created by the church and sent to customers/hirers.

The existing database concepts are:

- `bills` / `bill_lines`: payable supplier bills.
- `invoice_submissions`: supplier invoice submissions awaiting review/conversion to bills.
- No `invoice_direction`, no receivable invoice header table, and no receivable invoice lines.

## Integration Surface

### Payment Status / Payment Runs

- `src/lib/bills/actions.ts`
  - `approveBill`, `postBill`, `createPaymentRun`, `approvePaymentRun`, `postPaymentRun`.
- `payment_runs` / `payment_run_items` are payable-only and only include posted bills.

### Bank Reconciliation

- `src/lib/banking/reconciliation-matching.ts`
  - Suggestions currently cover manual transactions, journals, donations, lettings charges, Gift Aid claim payments, and bank rules.
  - The union includes `invoice_payment` and `supplier_payment`, but there is no first-class unpaid bill or receivable invoice suggestion pipeline yet.
- `src/lib/banking/unreconcile-bank-transaction.ts`
  - `invoice_payment` is not fully supported for unreconcile.

### Registers

- `src/lib/registers/actions.ts`
  - Income/expense registers are based on posted `journal_lines`.
  - Posted supplier bills affect the expense register through posted bill journals.
  - Receivable invoices do not affect the income register because they do not exist yet.

### Reports

- `src/lib/reports/glReports.ts`
  - Supplier spend is aggregated from posted journal lines tagged with `supplier_id`.
- `src/lib/reports/dashboard.ts`
  - Uses bills and workflow submissions for dashboard signals.
- Report engine supports a `basis` filter in places, but there is no clear workspace-wide accounting-basis setting that currently drives invoice recognition.

### RLS / Workspace Scoping

- Existing financial tables are scoped by `organisation_id`.
- Some newer tables use `workspace_id` for the same tenant concept.
- Current RLS generally permits reads for org members and writes for treasurer/admin style roles.
- Server actions generally derive `orgId` from `getActiveOrg()`.
- Inline create actions should not accept client-provided workspace/organisation ids.

### Audit Logging

- `src/lib/audit.ts` writes immutable audit entries with the admin client.
- Suppliers, bills, payment runs, and invoice submission workflow actions already write audit events in several places.

## Schema Gaps

- No `invoice_direction` or receivable invoice model.
- No receivable invoice lines.
- No generated invoice document metadata for receivable invoices.
- No receivable payment tracking separate from lettings charges.
- No hirer/customer address field.
- Supplier does not have `bank_reference_alias` or `notes` directly.
- Bill statuses do not include `submitted`, `scheduled_for_payment`, `overdue`, or `voided` directly.
- `bill_lines.fund_id` is nullable; requested approval rules require funds before approval/posting.
- Account type enforcement for bill/invoice lines is mostly UI/server-action driven, not enforced in the database.

## UI Gaps

- The current "Invoices" page is actually supplier bills.
- The new invoice form blocks when no supplier or expense account exists.
- Supplier/account dropdowns are native selects or datalist inputs with no inline create.
- There is no invoice type selector.
- There is no receivable invoice form.
- Supplier detail is useful but not structured into the requested premium tabs.
- Supplier list does not include all requested cards, filters, sorting, or import/export actions.

## Required Data Model Changes

Recommended safe path:

1. Keep existing `bills` and `bill_lines` for payables to avoid breaking payment runs and supplier reports.
2. Add `receivable_invoices` and `receivable_invoice_lines`.
3. Reuse `lettings_hirers` as the first customer/hirer table, adding `address`.
4. Add document-generation metadata to receivable invoices.
5. Add optional supplier fields `bank_reference_alias` and `notes`.
6. Add RLS policies matching existing org membership and treasurer/admin write patterns.

## Implementation Plan

1. Add product-language tabs:
   - Bills to Pay
   - Invoices Owed to Us
   - All
   - Drafts
   - Overdue

2. Add a direction-aware new invoice page:
   - `payable` uses existing supplier bill storage.
   - `receivable` uses new receivable invoice storage.

3. Add inline create flows:
   - Supplier inline create.
   - Hirer/customer inline create.
   - Expense account inline create.
   - Income account inline create.

4. Add generated invoice document support:
   - Preview/download PDF for receivable invoices.
   - Mark as sent.
   - Store generated document path/metadata when persisted storage is wired.

5. Add reconciliation suggestions:
   - Outgoing payments suggest unpaid supplier bills/payment runs.
   - Incoming payments suggest unpaid receivable invoices and existing lettings charges.

6. Refresh supplier UI:
   - Premium list cards and richer table.
   - Detail tabs for Overview, Bills, Payments, Bank Rules/Aliases, Documents, Audit History.

7. Add targeted tests:
   - Validation and direction switching.
   - Inline create permissions/scoping.
   - Receivable invoice creation/PDF metadata.
   - Reconciliation suggestions for payables/receivables.
