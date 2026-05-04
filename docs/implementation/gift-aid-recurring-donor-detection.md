# Gift Aid recurring donor detection

## Purpose

Identify donors who tend to give on a repeatable cadence (monthly, weekly, quarterly, or irregular-but-consistent series). Use the results for:

- richer donor profiles and stewardship signals;
- boosting bank-line donor suggestions when amounts and references match a known pattern;
- Gift Aid forecasting (rough next-month reclaim from repeating gifts);
- control-centre alerts (missed expected gift after grace window, declaration gaps, eligible-but-unclaimed items linked to recurring donors).

## Detection model

The pure service (`detectRecurringDonorPatterns`) groups **posted donations** per donor plus a normalised bank/standing-order reference (`provider_reference` or linked `bank_lines.reference/description`). Within each slice it prefers the strongest interpretable rhythm:

1. Monthly — consecutive gaps roughly 26–36 days with at least **three** occurrences and amounts clustered around a median (\(\pm\max(50\text{p},5\%)\)).
2. Weekly — gaps roughly 5–10 days with the same amount rules.
3. Quarterly — gaps roughly 82–115 days.
4. Irregular — four or more gifts with clustered amounts where gaps do **not** look like weekly/monthly/quarterly rhythms.

Signatures are stable (`pattern_type | normalised ref | rounded amount`) so refreshed runs can upsert cleanly.

Dismissed signatures are never regenerated on sync—the row remains `dismissed` and skipped when inserting fresh `active` rows.

## Database

`public.recurring_donor_patterns` holds detected rows with workspace scoping (`workspace_id`), expected amount tolerance, cadence hints, grace days, next expected date, occurrence counts, and status (`active`, `paused`, `dismissed`). RLS follows other Gift Aid artefacts (members read; treasurers/admins manage).

Sync replaces `active` and `paused` rows on each organisational run (`runRecurringDonorPatternSync`). Dismissed rows persist.

## Product surfaces

- **Gift Aid control centre** — inserts additional metrics/alerts derived from insights (`buildGiftAidRecurringControlInsights`) after syncing.
- **Donor Gift Aid profile** — badge plus pattern history excluding dismissed statuses.
- **Bank reconciliation donor suggestions** — active patterns that match incoming amount/ref add a high-precision reason chip.
- **Settings tab** — manual refresh button invokes `syncGiftAidRecurringDonorPatterns()` for treasurer/admin rebuilds outside automatic runs.

Automatic sync runs whenever `getGiftAidControlCentreData()` loads so treasurers see fresh maths without exporting SQL.

## Alerts

Alerts fire when analytics counts exceed zero:

| Alert | Meaning |
| --- | --- |
| Expected recurring donations overdue | `next_expected_date + grace_days` passed with no tolerant follow-up donation. |
| Recurring donors without a valid declaration | Active pattern donor IDs missing `status === active` declaration rows. |
| Recurring-eligible Gift Aid not yet claimed | Review-queue rows flagged eligible + unblocked + no claim id belonging to repeating donors. |

## Tests

Vitest suites cover deterministic detection thresholds, reconciliation scoring boosts with recurring hints, and migration presence for schema governance.
