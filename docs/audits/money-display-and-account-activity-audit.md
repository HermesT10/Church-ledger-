# Audit: money display & account activity

## Goals

- One canonical GBP formatter and consistent success/danger semantics for money-in vs money-out where applicable; **transfers** use info/neutral styling; **trial balance** and liability normal balances may invert “good/bad” — UI uses **`ledger_net`** on account detail as “sign of net movement for this account”, not global P&L semantics.
- Account pages must not imply raw journal lines are “transactions” in the business sense; **Transaction summary** vs **Journal lines** separates these views.

## Data

- Reversal metadata: **`journals.reversal_of`**, **`reversal_of_journal_id`**, **`reversed_by`** (original vs reversal journal).

## Donations / registers

- Giving register queries already omit reversal journals unless explicitly included; account activity lists **posted** lines only — reversal journals appear when they hit the same GL account (expected for audit trail).

## Follow-ups (optional)

- Pagination / “load more” for accounts with >100 posted lines on first page.
- Broader adoption of **`MoneyAmount`** on accounts list, banking, reconciliation workspace, dashboard widgets.
