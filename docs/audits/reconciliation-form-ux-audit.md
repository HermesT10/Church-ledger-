# Reconciliation Form UX Audit

## Scope

This audit covers the active bank reconciliation form after the first smart-reconciliation implementation. It focuses on transaction type handling, conditional field rendering, donor/supplier dropdowns, Gift Aid follow-up controls, and create-and-reconcile payload construction.

## Files Found

- `src/app/(app)/reconciliation/page.tsx`
- `src/app/(app)/reconciliation/reconciliation-workspace-client.tsx`
- `src/app/(app)/reconciliation/components/reconciliation-smart-forms.tsx`
- `src/app/(app)/reconciliation/reconciliation-form-model.ts`
- `src/lib/banking/reconciliation-workspace-actions.ts`
- `src/lib/reconciliation/actions.ts`

## Current Component Structure

The active page is `src/app/(app)/reconciliation/page.tsx`. It renders `ReconciliationWorkspaceClient` and passes:

- bank reconciliation workspace data
- donors
- suppliers
- funds
- reconciliation accounts
- income streams

`ReconciliationWorkspaceClient` owns state for the selected bank line and create-and-reconcile form values. It renders a type selector and delegates the form body to component sections in `components/reconciliation-smart-forms.tsx`.

Current reusable form components:

- `ReconciliationTypeSelector`
- `DonationReconcileForm`
- `IncomeReconcileForm`
- `ExpenseReconcileForm`
- `TransferReconcileForm`
- `ExcludeReconcileForm`
- `ReconciliationSummaryPreview`

## Current Field Rendering

The form is already context-aware:

- Donation shows donor, new donor, fund, income account, income stream, Gift Aid, and donor alias controls.
- Income shows income account, fund, income stream, and future matching controls.
- Expense shows supplier, new supplier, expense account, fund, and supplier matching controls.
- Transfer shows from and to accounts.
- Exclude shows exclusion reason and notes.

This is a major improvement over the original static form that always showed donor, supplier, account, fund, and income stream together.

## Current Transaction Type Handling

Current top-level values:

- `donation`
- `income`
- `expense`
- `transfer`
- `lettings_income`
- `gift_aid_hmrc_payment`
- `payroll_payment`
- `adjustment`
- `exclude`

The latest requested UX wants top-level values:

- `income`
- `expense`
- `transfer`
- `match_existing`
- `exclude`

And an income subtype:

- `donation`
- `lettings`
- `grant`
- `other`

This has not yet been implemented. Donation still exists as a top-level type.

## Donor and Supplier Dropdowns

Current donor data passed to the form contains only:

- `id`
- `name`

This is not enough to drive Gift Aid follow-up defaults. The form needs donor metadata:

- `email`
- `hasActiveGiftAidDeclaration`

Supplier data is currently enough for dropdown display, but supplier quick-create remains lightweight.

## Gift Aid Follow-Up Logic Gaps

Current backend supports:

- `addGiftAidFollowUp`
- `generateGiftAidDeclarationLink`
- `gift_aid_declaration_requests`
- declaration link generation

Current UI gaps:

- Gift Aid follow-up controls show for anonymous donations.
- Follow-up checkbox does not default based on donor declaration status.
- Link checkbox is not disabled when donor has no email.
- Helper text is missing for anonymous, no email, or already-declared donors.
- The requested title and description are missing.

## Create and Reconcile Payload

`buildCreateInput` submits:

- `giftAidEligible`
- `addGiftAidFollowUp`
- `generateGiftAidDeclarationLink`
- `rememberBankReference`

The latest requested names are snake_case, but the codebase consistently uses camelCase for TypeScript action payloads. Keeping camelCase is acceptable if the server action treats these fields as internal API, but it should explicitly ignore them for non-donation types.

## Logic Gaps

- Donor declaration state is not loaded in `page.tsx`.
- Gift Aid follow-up controls need conditional visibility.
- Link generation needs to respect donor/quick-create email availability.
- The open request uniqueness rule should be one open request per donor/workspace, not one per donor/donation.
- Follow-up creation/link generation should be extracted into helpers for testability and reuse.

## Where to Inject Dynamic Behaviour

- Load donor email and active declaration state in `src/app/(app)/reconciliation/page.tsx`.
- Extend `DonorOption` in `src/app/(app)/reconciliation/reconciliation-form-model.ts`.
- Update `DonationReconcileForm` in `src/app/(app)/reconciliation/components/reconciliation-smart-forms.tsx`.
- Extract Gift Aid follow-up helpers in `src/lib/reconciliation/actions.ts`.
- Add a migration to enforce one open Gift Aid request per donor/workspace.

## Recommended Next Steps

1. Add donor metadata to reconciliation page data loading.
2. Hide Gift Aid follow-up for anonymous donations.
3. Default follow-up checked only when the selected/new donor lacks an active declaration.
4. Disable declaration link generation unless an email is available.
5. Extract server follow-up/link helpers.
6. Add unique open-request protection.
7. Add tests and update implementation documentation.
