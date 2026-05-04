# Donor Giving Register Audit

## Scope

This audit covers the current Donations, donor, Gift Aid, reconciliation, reporting, RLS, and audit-log surfaces that will support a donor-focused Giving Register. It is based on the current code and migrations rather than assumptions.

## Files Found

### Donations routes and UI

- `src/app/(app)/donations/page.tsx`
- `src/app/(app)/donations/[id]/page.tsx`
- `src/app/(app)/donations/new/page.tsx`
- `src/app/(app)/donations/new/new-donation-client.tsx`
- `src/app/(app)/donations/recurring/page.tsx`
- `src/app/(app)/donations/recurring/recurring-client.tsx`

The Donations page is currently an overview page with dashboard cards, recent donations, and links to recurring donations and manual donation creation. It does not currently have tabs, a donor list, a spreadsheet-style register, unmatched donations, Gift Aid status, or statement views.

### Donations server code

- `src/lib/donations/actions.ts`
- `src/lib/donations/types.ts`
- `src/lib/donations/validation.ts`
- `src/lib/donations/candidate-ingestion.ts`

`createDonation` creates and posts a journal, inserts a donation, invalidates report cache, and logs `create_donation`. `listDonations`, `getDonation`, `getDonationsDashboard`, and recurring donation actions are already present.

### Gift Aid donor and statement UI

- `src/components/gift-aid/workspace-shell.tsx`
- `src/app/(app)/gift-aid/page.tsx`
- `src/app/(app)/gift-aid/gift-aid-overview-client.tsx`
- `src/app/(app)/gift-aid/donors/page.tsx`
- `src/app/(app)/gift-aid/donors/donors-client.tsx`
- `src/app/(app)/gift-aid/donors/[donorId]/page.tsx`
- `src/app/(app)/gift-aid/statements/statements-client.tsx`
- `src/components/gift-aid/donor-profile-statements.tsx`
- `src/components/gift-aid/generate-donor-statement-dialog.tsx`

Gift Aid already has donor, declaration, claim, HMRC payment reconciliation, and statement surfaces. The existing donor detail page is Gift Aid-focused rather than general Donations-focused.

### Gift Aid server code

- `src/lib/giftaid/actions.ts`
- `src/lib/giftaid/types.ts`
- `src/lib/giftaid/donation-reconciliation.ts`
- `src/lib/giftaid/bank-donor-matching.ts`
- `src/lib/giftaid/matching.ts`
- `src/lib/giftaid/donor-statements-actions.ts`
- `src/lib/giftaid/donor-statement-pdf.tsx`
- `src/lib/giftaid/donor-statement-rows.ts`
- `src/lib/giftaid/donor-statement-periods.ts`

### Reconciliation and matching

- `src/lib/reconciliation/actions.ts`
- `src/lib/reconciliation/matching.ts`
- `src/lib/banking/reconciliation-workspace-actions.ts`
- `src/lib/banking/reconciliation-matching.ts`
- `src/app/(app)/reconciliation/page.tsx`
- `src/app/(app)/reconciliation/reconciliation-workspace-client.tsx`

There are both legacy reconciliation actions and a newer banking reconciliation workspace. Donation-specific matching exists through Gift Aid donor matching and reconciliation donation assessment.

### Reports, dashboard, and exports

- `src/lib/registers/actions.ts`
- `src/app/(app)/income/register/page.tsx`
- `src/components/registers/register-page.tsx`
- `src/app/api/registers/export/route.ts`
- `src/lib/reports/summaryReports.ts`
- `src/lib/reports/dashboard.ts`
- `src/lib/reports/types.ts`
- `src/lib/reports/engine/registry.ts`
- `src/lib/reports/engine/exports.ts`
- `src/app/(app)/reports/gift-aid-summary/gift-aid-summary-client.tsx`
- `src/app/(app)/dashboard/widgets/gift-aid-summary-widget.tsx`

Income register and reports derive primarily from posted journals and journal lines. Donation records are linked to journals, funds, income streams, Gift Aid declarations, claims, and bank transactions.

### Schema and migrations

- `supabase/migrations/00016_donations_donors.sql`
- `supabase/migrations/00017_gift_aid_claims.sql`
- `supabase/migrations/00043_giving_upgrade.sql`
- `supabase/migrations/00060_gift_aid_production_model.sql`
- `supabase/migrations/00061_gift_aid_donor_matching.sql`
- `supabase/migrations/00062_gift_aid_donor_declaration_management.sql`
- `supabase/migrations/00071_funds_control_centre.sql`
- `supabase/migrations/00077_gift_aid_donation_status_values.sql`
- `supabase/migrations/00078_gift_aid_donation_reconciliation.sql`
- `supabase/migrations/00083_gift_aid_donor_alias_matching.sql`
- `supabase/migrations/00085_gift_aid_gasds.sql`
- `supabase/migrations/00086_gift_aid_claim_payment_reconciliation.sql`
- `supabase/migrations/00087_donor_annual_giving_statements.sql`
- `supabase/migrations/00088_gift_aid_declaration_reminders.sql`
- `supabase/migrations/00089_banking_schema_foundation.sql`

## Current Data Model

### Donors

`public.donors` starts in `00016_donations_donors.sql` with:

- `id`
- `organisation_id`
- `full_name`
- `email`
- `address`
- `postcode`
- `created_at`

Later migrations add:

- `workspace_id` generated from `organisation_id`
- `updated_at`
- `created_by`
- `updated_by`
- `reference_code`
- `title`
- `first_name`
- `last_name`
- `display_name`
- `house_name_or_number`
- `phone`
- `donor_reference_code`
- `notes`
- `is_active`

Important current constraint:

- `donors_unique_name unique (organisation_id, full_name)`

This can block two distinct donors with the same display name.

### Donations

`public.donations` starts with:

- `id`
- `organisation_id`
- `donor_id`
- `donation_date`
- `amount_pence`
- `fund_id`
- `source`
- `status`
- `journal_id`
- `created_by`
- `created_at`

Later migrations add:

- `workspace_id` generated from `organisation_id`
- `channel`
- `gross_amount_pence`
- `fee_amount_pence`
- `net_amount_pence`
- `provider_reference`
- `import_batch_id`
- `fingerprint`
- `income_stream_id`
- `bank_transaction_id`
- `matched_declaration_id`
- `gift_aid_status`
- `gift_aid_claim_batch_id`
- `gift_aid_estimated_claim_pence`
- `review_reason`
- `included_in_claim_at`
- `submitted_to_hmrc_at`
- `updated_by`
- `updated_at`
- `giving_import_row_id`

Current application type `DonationRow` exposes `status` as `draft | posted`, but later Gift Aid status fields are richer than the current Donations UI uses.

### Gift Aid

Gift Aid has a production model for:

- donor declarations
- declaration links
- donation Gift Aid statuses
- claim batches
- claim lines
- GASDS small donation batches
- HMRC payment reconciliation
- declaration reminders
- donor annual giving statements

The current donor statement tables are:

- `donor_statement_runs`
- `donor_statements`

`donor_statements` stores period, PDF path, status, and aggregate totals. The reviewed schema does not show a persisted statement line-item table or hash of the underlying donation set.

### Donor aliases and matching

Requested table: `donor_bank_aliases`.

Current table: `donor_matching_aliases`.

Current fields:

- `id`
- `donor_id`
- `workspace_id`
- `alias_text`
- `normalized_alias`
- `source`
- `confidence`
- `created_from_bank_transaction_id`
- `created_at`

Current source values:

- `bank_reference`
- `manual`
- `imported`
- `system`

This is close to the requested alias model but lacks `created_by`, uses `confidence` rather than `confidence_score`, and uses `imported` instead of `reconciliation`.

### Funds, accounts, and income streams

Funds use `organisation_id` and are available to donations through `donations.fund_id`.

Income streams are added by `00071_funds_control_centre.sql` and linked to donations through `donations.income_stream_id`.

Donation posting currently uses organisation settings:

- `default_donations_income_account_id`
- `default_donations_bank_account_id`
- `default_donations_fee_account_id`

The donation record itself does not currently store `account_id`.

## Integration Points

### Donations and GL posting

`src/lib/donations/actions.ts` creates a draft journal, inserts journal lines, posts the journal, inserts the donation, links the journal source back to the donation, invalidates report cache, and logs an audit event.

This means the Giving Register should use `donations` as the donor-facing source of truth while financial reports continue to flow from posted journals.

### Bank reconciliation

`src/lib/reconciliation/actions.ts` includes donation reconciliation paths and donor matching helpers. The newer banking workspace in `src/lib/banking/reconciliation-workspace-actions.ts` also supports multi-source matching and confirmation.

`donations.bank_transaction_id` links donations to bank lines. The current unique index on `donations.bank_transaction_id` means one bank line can only be associated with one donation.

### Donor matching

`src/lib/giftaid/bank-donor-matching.ts` already scores donor suggestions using:

- donor names
- donor reference codes
- donor aliases
- previous confirmed matches
- historical donations
- recurring patterns
- surname/initial matching
- fuzzy text similarity

This already satisfies most of the requested MVP matching service. The missing piece is a Donations-facing `suggestDonorForBankTransaction(bankTransactionId)` wrapper with a stable return shape.

### Gift Aid

`donations.gift_aid_status`, `matched_declaration_id`, and claim batch/line tables already support donor-level and donation-level Gift Aid reporting.

The Donations page currently displays only `gift_aid_eligible`, not the richer `gift_aid_status` lifecycle.

### Annual statements

Annual giving statement generation already exists under Gift Aid. A Donations Statements tab should reuse the existing `donor-statements-actions.ts` workflow instead of creating a separate statement engine.

### Audit logging

`src/lib/audit.ts` is the shared helper. Donation creation logs `create_donation`. Reconciliation actions also log events.

Coverage gaps remain for donor profile changes, alias changes, statement generation, donation matching, donor archive, and donation Gift Aid fixes unless handled in the existing Gift Aid actions.

## RLS and Workspace Scoping

Tenant scoping uses `organisations.id`. Older tables use `organisation_id`; newer tables often use generated or direct `workspace_id`.

Current relevant policy pattern:

- donor and donation selects use `is_org_member`
- donor/donation writes use `is_org_treasurer_or_admin`
- Gift Aid satellite tables use member read and treasurer/admin write policies
- audit log select/insert is treasurer/admin scoped

Privacy risk: donor PII is currently available to any role covered by `is_org_member`, including roles that may not need donor names. The Giving Register should apply a stricter application-level permission boundary and should not expose named donor exports to limited users.

## Schema Gaps

### Donors

Missing or mismatched compared with the requested donor record:

- `status: active | inactive | archived`
- `archived_at`
- `address_line_1`
- `address_line_2`
- `town_city`
- `county`
- requested `donor_reference` naming

Existing equivalents:

- `is_active`
- `address`
- `postcode`
- `donor_reference_code`
- `reference_code`

### Donations

Missing or mismatched compared with the requested donation record:

- `account_id`
- `payment_method`
- `reference`
- `description`
- richer donation lifecycle status: `matched | reconciled | voided`

Existing equivalents:

- `channel`
- `provider_reference`
- `journal_id`
- `bank_transaction_id`
- `gift_aid_status`

### Donor aliases

Current `donor_matching_aliases` should probably be extended rather than replaced. Missing:

- `created_by`
- requested `reconciliation` source
- requested `confidence_score` naming

### Giving Register

There is no current persisted monthly register table. That is acceptable for MVP: the register should be derived from donation records so it does not become a second accounting source of truth.

### Statements

Statement aggregate rows exist, but no reviewed table stores individual statement line snapshots. If statements must be legally reproducible, add statement line items or a generated snapshot hash later.

## Risks

1. Donor PII may be too broadly readable under current `is_org_member` select policies.
2. `donors_unique_name` can reject real-world duplicate donor names.
3. One bank transaction maps to one donation through the current unique bank transaction link, which may not support split deposits or aggregate giving batches.
4. The Donations UI currently uses only basic Gift Aid eligibility and does not surface the full Gift Aid status lifecycle.
5. A new Giving Register must not store separate monthly totals that can drift from `donations`.
6. Current donor detail is Gift Aid-focused and may not satisfy a general donor CRM-like Donations profile without refactoring.
7. Audit logging for donor profile, alias, archive, and statement actions needs to be made explicit during implementation.

## Implementation Sequence

### Stage 1: Register from existing data

- Add a Donations tab shell.
- Add a Giving Register tab.
- Build register rows from existing `donations`, `donors`, `funds`, `income_streams`, bank links, and Gift Aid status.
- Support year, fund, Gift Aid status, payment method, search, and anonymous-row filters.
- Add monthly totals, yearly totals, donor sorting, and drill-down details.

### Stage 2: Donor page consolidation

- Add a Donors tab under Donations.
- Reuse or link to existing Gift Aid donor profiles.
- Add Donations-focused donor detail sections for giving history, aliases, statements, documents, and audit.

### Stage 3: Schema alignment

- Add donor lifecycle fields and split address fields.
- Extend alias metadata.
- Add donation fields needed for reconciliation and register display.
- Decide whether to loosen the one-bank-line-one-donation constraint.

### Stage 4: Reconciliation integration

- Add or expose `suggestDonorForBankTransaction(bankTransactionId)`.
- Support create/select donor, anonymous giving, save alias, fund/account selection, and Gift Aid assessment during reconciliation.

### Stage 5: Statements, exports, and reporting

- Reuse existing donor statement generation.
- Add register CSV export.
- Add Donor Giving Summary report and dashboard/report metrics.
- Add statement line snapshots if reproducibility is required.

### Stage 6: Privacy and safe archive

- Enforce stricter donor PII permissions in UI and, if needed, RLS.
- Add safe donor archive/anonymise rules.
- Add audit events for donor archive, alias changes, matching, statement generation, and Gift Aid fixes.

## First Safe Build Recommendation

The safest first implementation is a derived Giving Register tab on `/donations` using existing schema only. This gives users immediate spreadsheet-style visibility without changing accounting data, Gift Aid claim behaviour, or reconciliation invariants.
