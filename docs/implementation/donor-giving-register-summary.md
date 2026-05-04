# Donor Giving Register Summary

## Feature Overview

The Donations page now has a tab structure for the donor-focused giving workflow:

1. Overview
2. Donors
3. Giving Register
4. Unmatched Donations
5. Gift Aid Status
6. Statements

The first implemented stage is the Giving Register tab. It shows a spreadsheet-style annual grid with donors down the left, months across the page, yearly totals, Gift Aid status, and last donation date.

## Data Source

The register is derived from existing `donations` records. It does not introduce a new monthly-total table, so it cannot drift from the real giving records.

Current inputs:

- `donations`
- `donors`
- `funds`
- `gift_aid_status`
- `bank_transaction_id`
- `channel`
- `provider_reference`

The implementation uses:

- `src/lib/donations/giving-register.ts` for Supabase-backed loading.
- `src/lib/donations/giving-register-summary.ts` for pure register aggregation.
- `src/app/(app)/donations/giving-register-client.tsx` for the interactive register UI.

## Current Capabilities

- Year selector
- Fund filter
- Gift Aid status filter
- Payment method filter
- Donor search
- Anonymous giving show/hide
- CSV export
- Alphabetical donor ordering by last name, then first name
- Monthly and yearly totals
- Anonymous giving row
- Gift Aid issue indicators in monthly cells
- Drill-down sheet per donor/month cell
- Links to donation detail, donor profile, Gift Aid, and reconciliation areas

## Reconciliation Flow

This stage reads `donations.bank_transaction_id` to show whether a donation is linked to a bank transaction. The next stage should wire the Donations page into the existing reconciliation actions so users can:

- select an existing donor,
- create a donor,
- mark anonymous,
- save a bank alias,
- assign fund/income account,
- assess Gift Aid eligibility.

## Gift Aid Integration

The register surfaces donation-level `gift_aid_status` and flags known attention statuses such as:

- `missing_declaration`
- `matched_no_declaration`
- `invalid_donor_details`
- `needs_review`
- `not_assessed`
- `rejected`

Gift Aid correction currently links users to the existing Gift Aid control centre. A later stage should provide direct donor/declaration actions in the drill-down.

## Annual Statements

The Statements tab currently points to the existing Gift Aid statements area. The current statement engine should be reused rather than duplicated.

Future improvement: persist statement line snapshots if generated statements must be reproducible from an immutable record of included donations.

## Privacy Rules

This stage relies on existing RLS and application permissions. Donor data is still sensitive. Future stages should add a stricter permission boundary for named donor visibility and named donor exports, especially for limited roles.

## Future Enhancements

- Donations-native donor profile tabs.
- Reconciliation donor matching wrapper: `suggestDonorForBankTransaction(bankTransactionId)`.
- Donor alias management from bank references.
- Annual statement generation directly from Donations.
- Donor archive/anonymise workflow.
- Duplicate donor merge.
- Recurring giving commitments and missed donation alerts.
- Donor Giving Summary report and dashboard metrics.
