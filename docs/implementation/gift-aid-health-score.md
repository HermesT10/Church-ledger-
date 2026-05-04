# Gift Aid health score

## Purpose

Treasurers get a single **0–100 composite score** plus **grade**, **financial signals**, **narrative strengths/risks**, and **recommended actions with deep links** into the Gift Aid control centre tabs and reconciliation route.

## Data flow

1. `getGiftAidControlCentreData` loads the review queue, claims, donors, declarations, GASDS summary, recurring insights, and runs `countUnreconciledHmrcPaymentBatches`.
2. **Periods:** `deriveTaxYearPrimaryAndComparisonPeriods()` sets the **primary** window to the current UK tax year from 6 April to today (capped at the tax year end), and the **comparison** window to the **same number of days** starting from the previous tax year’s 6 April (so the trend compares like-for-like length).
3. `computeGiftAidHealthScore({ ... })` in `src/lib/giftaid/health-score.ts` aggregates **donation-dated** review-queue rows into metrics, scores them, builds copy, and returns up to **five** recommended actions (sorted by severity).

## Outputs (`GiftAidHealthScoreResult`)

| Field | Meaning |
| --- | --- |
| `score` | Rounded 0–100. |
| `grade` | `excellent` ≥ 90, `good` ≥ 75, `needs_attention` ≥ 60, else `poor`. |
| `financial_opportunity_pence` | Sum of blocked (missing-declaration pathway) Gift Aid estimate **plus** unclaimed eligible-queue Gift Aid estimate (25p per £ donated on those rows). |
| `blocked_gift_aid_estimate_pence` | HMRC-style Gift Aid amount tied to eligible giving on the missing-declaration pathway only. |
| `previous_score` / `score_change` | Compared to the aggregation rescore on the comparison period (null if no comparison). |
| `recommended_actions[]` | `id`, `title`, `description`, **`href`** (including `/gift-aid/reconciliation`, `/gift-aid?tab=…`). |

Pure helpers such as `computeGiftAidHealthMetricsFromReviewRows` and `scoreGiftAidHealthFromAggregates` are unit-tested in `tests/giftAidHealthScore.test.ts`.

## UI

The **Gift Aid → Overview** tab renders when `GiftAidControlCentreData.health_score` is present: large score + grade badge, blocked and opportunity sterling amounts, optional **trend vs prior window**, and the top linked actions list.
