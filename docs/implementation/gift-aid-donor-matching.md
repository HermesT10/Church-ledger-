# Gift Aid Donor Matching

## Purpose
When a bank transaction is recorded as giving, the reconciliation screen suggests likely donors. Suggestions are advisory for the MVP: an admin or treasurer must confirm, choose another donor, create a donor, or mark the donation anonymous.

## Data Model
`donor_matching_aliases` stores reusable bank-reference aliases:

- `workspace_id`
- `donor_id`
- `alias_text`
- `normalized_alias`
- `source`: `bank_reference`, `manual`, `imported`, or `system`
- `confidence`
- `created_from_bank_transaction_id`
- `created_at`

Aliases are workspace-scoped and protected by RLS. They are never used across organisations.

## Matching Signals
The matching service scores candidates using:

- Exact alias matches against bank reference or description.
- Donor reference codes in bank text.
- Donor name in bank text.
- Fuzzy donor-name similarity.
- Surname or initial patterns such as `J Smith`.
- Previous confirmed matches.
- Repeated bank reference and recurring amount patterns.

Postcode and address are intentionally not primary matching signals. They remain useful for Gift Aid validation after a donor is selected.

## Confidence Labels
- `high`: score `>= 0.85`
- `medium`: score `>= 0.60`
- `low`: score below `0.60`

If multiple high-confidence donors are found, the UI warns the user and still requires manual confirmation.

## Reconciliation Flow
When “Record donation” is opened for a bank line:

1. The app loads suggested donors for that bank transaction.
2. The user reviews confidence and reasons.
3. The user confirms a suggested donor, chooses a different donor, creates a donor, or marks the donation anonymous.
4. If approved, the bank reference can be stored as an alias.
5. The donation is created and Gift Aid eligibility is assessed immediately.

## Safeguards
- No donor is auto-confirmed.
- Archived donors are excluded unless explicitly toggled in the UI.
- Matching uses the bank line’s server-resolved workspace.
- Anonymous donations do not create donor match records or aliases.
- Alias creation is optional and tied to admin confirmation.

## Tests
Focused tests cover exact aliases, fuzzy/surname matching, recurring patterns, archived donor filtering, multiple high-confidence warnings, and migration safety checks.
