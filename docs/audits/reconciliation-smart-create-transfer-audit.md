# Reconciliation Smart Create and Transfer Audit

## Scope

This audit covers the current bank reconciliation UI, server actions, posting model, donor/Gift Aid integration, supplier integration, income/expense register model, internal transfer support, bank rules, matching, RLS, reports, dashboard effects, and audit logging.

## Files Found

### Active reconciliation workflow

- `src/app/(app)/reconciliation/page.tsx`
- `src/app/(app)/reconciliation/reconciliation-workspace-client.tsx`
- `src/lib/banking/reconciliation-workspace-actions.ts`
- `src/lib/banking/reconciliation-matching.ts`

The active route renders `ReconciliationWorkspaceClient`. It loads bank accounts, funds, reconciliation accounts, income streams, donors, and suppliers before rendering the workspace.

### Legacy reconciliation workflow

- `src/app/(app)/reconciliation/reconciliation-client.tsx`
- `src/lib/reconciliation/actions.ts`
- `src/lib/reconciliation/matching.ts`
- `src/components/finance/reconciliation-card.tsx`

The legacy client is not used by the active `/reconciliation` route, but it contains richer donation state including donor quick-create, Gift Aid eligibility, declaration selection, anonymous donations, and saving bank references as donor aliases.

### Posting and transaction records

- `src/lib/transactions/posting.ts`
- `src/lib/transactions/types.ts`
- `src/lib/transactions/actions.ts`
- `supabase/migrations/00075_transactions_feature.sql`

Manual transactions are the existing pre-ledger record for income, expense, transfer, and adjustment entries. They become reportable once posted to journals.

### Related modules

- Donors and Gift Aid: `src/lib/giftaid/actions.ts`, `src/lib/giftaid/self-service-declarations.ts`
- Suppliers: `src/lib/suppliers/actions.ts`, `src/lib/suppliers/types.ts`
- Bank rules: `src/lib/banking/bank-rules-actions.ts`, `src/lib/banking/bank-rules-engine.ts`
- Reports and dashboard: `src/lib/reports/summaryReports.ts`, `src/lib/reports/dashboard.ts`, `src/lib/cache.ts`

### Schema

- Donors, donations, Gift Aid: `00016_donations_donors.sql`, `00060_gift_aid_production_model.sql`, `00061_gift_aid_donor_matching.sql`, `00062_gift_aid_donor_declaration_management.sql`, `00082_gift_aid_self_service_declarations.sql`, `00083_gift_aid_donor_alias_matching.sql`, `00088_gift_aid_declaration_reminders.sql`
- Suppliers: `00013_suppliers_bills.sql`, `00034_suppliers_enhancement.sql`, `00035_supplier_integration.sql`
- Banking and reconciliation: `00008_phase3_banking_foundation.sql`, `00021_bank_reconciliation.sql`, `00033_reconciliations.sql`, `00089_banking_schema_foundation.sql`, `00090_bank_rules_automation.sql`, `00093_banking_downstream_integration.sql`
- Manual transactions: `00075_transactions_feature.sql`
- Registers and income streams: `20260429104502_income_expense_registers.sql`, `20260429133100_expense_register_categorisation.sql`, `00071_funds_control_centre.sql`
- Audit log: `00028_audit_log.sql`

## Current Reconciliation Form Structure

The active create-and-reconcile card is static. It always shows:

- transaction type
- description
- account
- fund
- income stream
- donor
- supplier

Current type values:

- `income`
- `expense`
- `donation`
- `transfer`
- `adjustment`

The UI does not hide irrelevant fields. Donor fields are visible for expenses, supplier fields are visible for donations, and transfer still shows income/donor/supplier-related controls.

## Current Data Sources

`src/app/(app)/reconciliation/page.tsx` loads:

- `bank_accounts` where status is active
- `getReconciliationWorkspaceData()`
- `getFundsList({ activeOnly: true })`
- `getAccountsList({ activeOnly: true, availableInReconciliation: true })`
- `listIncomeStreams({ activeOnly: true })`
- active donors from `donors`
- active suppliers from `suppliers`

## Current Backend Flow

`createAndReconcileBankTransaction` accepts `CreateAndReconcileInput`:

- `bankTransactionId`
- `type`
- `description`
- optional `accountId`
- optional `fundId`
- optional `incomeStreamId`
- optional `donorId`
- optional `supplierId`
- optional split lines

Donation flow delegates to `reconcileBankLineAsDonation`.

Income, expense, transfer, and adjustment flows insert:

- `manual_transactions`
- `manual_transaction_lines`
- `transaction_matches`
- posted journal via `postManualTransactionToLedger`
- `bank_reconciliation_matches`
- reconciled bank line flags

## Donor and Gift Aid Integration Gaps

The app already has a shared `donors` table. A duplicate Gift Aid donor table is not required.

Current gaps:

- The active workspace UI does not quick-create donors.
- The active workspace UI hardcodes donation `giftAidEligible` to false.
- The active workspace UI does not expose declaration selection, declaration follow-up, or declaration link generation.
- The active workspace UI does not expose saving bank reference as a donor alias.
- `gift_aid_declaration_links` exists and `generateGiftAidDeclarationLink` works, but email sending is not configured.
- There is no `gift_aid_declaration_requests` queue with the requested lifecycle.

Existing reusable pieces:

- `assessDonationGiftAidForReconciliation`
- `donor_matching_aliases`
- `generateGiftAidDeclarationLink`
- `gift_aid_declaration_links`
- `gift_aid_reminders`

## Supplier Integration Gaps

The active UI collects `supplierId`, and `CreateAndReconcileInput` includes it, but the backend does not persist it.

Current gaps:

- No supplier quick-create from reconciliation.
- No supplier alias table equivalent to donor aliases.
- Supplier is not linked to `manual_transactions`.
- Supplier spend cannot reliably include bank-created expenses unless inferred from text or future linkage.

## Income and Expense Creation Gaps

Income and expenses are created as `manual_transactions`, which is a good foundation because posted journals feed registers and reports.

Current gaps:

- No contextual form by type.
- No quick-create income stream.
- No quick-create income account.
- No supplier linkage for expenses.
- No receipt upload in reconciliation.
- No “remember reference” mapping from the active form.
- No summary preview before posting.

## Internal Transfer Support Gaps

`manual_transactions.type` supports `transfer`, but there is no dedicated transfer UX.

Current risk:

- The active form can create a single-line transfer, but `postManualTransactionToLedger` requires transfer/adjustment lines to be balanced. This can fail or confuse users.

Missing:

- From account
- To account
- direction-aware current bank account autofill
- same-account validation
- active asset-account validation
- paired bank-line transfer matching

## Posting Risks

Existing protections:

- `getOpenBankLine` blocks posted, allocated, reconciled, and excluded lines.
- `assertNoExistingBankMatch` checks confirmed bank reconciliation and transaction matches.
- `postManualTransactionToLedger` blocks reposting when `posted_journal_id` exists.
- `bank_lines` is marked reconciled after successful posting.

Risks:

- Create-and-reconcile is multi-step and not fully transactional.
- Some failures after inserting manual transactions or lines can leave partial records.
- Donation reconciliation uses older match insertion fields and should be aligned with the newer generic match schema.
- `excludeBankTransaction` does not invalidate report cache.
- `skipBankTransaction` only logs audit and does not persist queue state.

## Duplicate Record Risks

- Bank lines can be matched through `bank_reconciliation_matches` and `transaction_matches`; both must remain coordinated.
- Donations have a bank transaction link and matching rows; duplicate protection must check both.
- Transfer pairs may appear as two separate bank lines and could be double-posted without a pairing model.
- Supplier and donor quick-create can create duplicates without search/confirmation.

## RLS and Workspace Scoping

The route restricts UI access to admin and treasurer. Server actions use `getActiveOrg`, `assertCanPerform`, and table filters by `organisation_id` or `workspace_id`.

Implementation must continue to:

- derive workspace server-side
- validate all submitted IDs belong to the active workspace
- avoid trusting client-submitted workspace IDs
- use admin client only server-side
- respect RLS and permission helpers

## Reports and Dashboard Impact

Income and expense entries should continue to appear through posted journals and register calculations. Internal transfers must be asset-to-asset journals only and should not affect income, expenses, SOFA income, or SOFA expenditure.

Report cache invalidation should happen for:

- create and reconcile
- donation reconciliation
- internal transfers
- exclusions
- unmatch/remove actions
- bank rule applications that create or alter postings

## Implementation Plan

1. Refactor the static UI into type-specific components.
2. Replace the broad backend input shape with discriminated input types.
3. Add schema support for Gift Aid follow-up requests, supplier linkage, and supplier aliases.
4. Enhance donation reconciliation with quick-create donor, Gift Aid status, alias saving, follow-up request, and declaration link generation.
5. Enhance expense reconciliation with quick-create supplier and supplier linkage.
6. Enhance income/expense mapping through bank rules.
7. Implement a dedicated internal transfer branch.
8. Harden rollback and duplicate checks.
9. Add audit events, cache invalidation, and implementation documentation.
10. Add targeted tests for UI logic, payload building, Gift Aid follow-up, supplier linkage, transfer validation, and duplicate blocking.
