# Reconciliation Smart Create and Transfer Summary

## Feature Overview

The Bank Reconciliation workspace now starts by asking what the selected bank line represents. The create-and-reconcile form is context-aware, so users see donation fields only for donations, supplier fields only for expenses, and transfer fields only for internal transfers.

## Dynamic Form Behaviour

The active reconciliation UI is still `ReconciliationWorkspaceClient`, but the create card now delegates to reusable form sections:

- `ReconciliationTypeSelector`
- `DonationReconcileForm`
- `IncomeReconcileForm`
- `ExpenseReconcileForm`
- `TransferReconcileForm`
- `ExcludeReconcileForm`
- `ReconciliationSummaryPreview`

Changing transaction type resets irrelevant stale values.

## Donor Quick Create and Gift Aid

Donation reconciliation can now submit:

- selected donor
- quick-created donor
- anonymous giving
- Gift Aid eligibility assessment
- Gift Aid declaration follow-up request
- Gift Aid declaration link generation
- donor bank reference alias saving

The implementation uses the existing shared `donors` table and `gift_aid_declarations` model. No duplicate Gift Aid donor table was introduced.

If a donation is reconciled to a donor without a declaration and follow-up is selected, a row is created in `gift_aid_declaration_requests`. If link generation is selected and the donor has an email address, a secure self-service declaration link is generated and linked to the request.

The reconciliation form now loads donor email and active declaration state. Gift Aid follow-up controls are hidden for anonymous donations, default on for donors without an active declaration, default off for donors with an active declaration, and disable declaration link generation when no email address is available.

Email sending remains limited by the current product state: declaration link email delivery is not configured, so generated links may need to be copied or sent by a later email workflow.

## Supplier Quick Create

Expense reconciliation can now submit:

- selected supplier
- quick-created supplier
- supplier bank alias
- expense account
- fund

`manual_transactions` now has `supplier_id`, allowing expenses created from reconciliation to remain linked to supplier records. Supplier spend stats include posted supplier-linked manual expense transactions.

## Income and Expense Creation

Other income and expenses continue to use the existing `manual_transactions` and posted journal flow. This keeps Income Register, Expense Register, reports, and dashboard data driven by posted journals rather than duplicate reconciliation-only records.

When “remember bank reference” is selected, reconciliation creates a non-auto-apply `bank_rules` row that can drive future suggestions.

## Internal Transfer Rules

Internal transfers now use a dedicated transfer form with:

- from account
- to account
- direction-aware summary

The server validates:

- both accounts are present
- accounts are different
- both accounts belong to the active workspace
- both accounts are active asset accounts

Posting creates balanced asset-to-asset lines and does not use income, expense, donor, supplier, fund, or income stream fields. This prevents transfers from inflating income or expenses.

## Schema Changes

Migration:

- `supabase/migrations/20260502152000_reconciliation_smart_create_transfer.sql`
- `supabase/migrations/20260502123428_one_open_gift_aid_request_per_donor.sql`

Adds:

- donor address/reference convenience fields
- `manual_transactions.supplier_id`
- transfer account metadata on `manual_transactions`
- `manual_transactions.reconciliation_metadata`
- `supplier_matching_aliases`
- `gift_aid_declaration_requests`
- donor/workspace-level uniqueness for open `gift_aid_declaration_requests`
- `donor_matching_aliases.created_by`
- `donor_matching_aliases.source = 'reconciliation'`

## Posting Logic

The implementation keeps the existing guardrails:

- bank line must still be open
- confirmed matches block duplicate posting
- manual transaction posting still blocks reposting by `posted_journal_id`
- donation reconciliation checks existing bank matches and transaction matches

## Reporting Impact

Donation, income, and expense branches post journals and invalidate report cache. Internal transfers post asset-to-asset journals only and do not affect income or expense registers.

## Known Limitations

- Lettings income, Gift Aid HMRC payments, and payroll payments are still intended to be confirmed from suggestions rather than directly created from the form.
- Transfer pair matching for both sides of a bank-to-bank transfer is not yet implemented.
- Gift Aid declaration emails are not sent automatically because the existing email provider hook is not configured.
- The create-and-reconcile process is still a multi-step server action rather than a single database transaction/RPC.

## Future Improvements

- Add transfer-pair matching to prevent double-posting both bank lines.
- Promote saved mappings into a richer reviewable automation queue.
- Add receipt upload directly in expense reconciliation.
- Add a Gift Aid follow-up tab that lists `gift_aid_declaration_requests`.
- Move complex reconciliation posting flows into atomic RPCs.
