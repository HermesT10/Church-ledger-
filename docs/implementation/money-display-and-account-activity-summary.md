# Money display & account activity — implementation summary

## Shared modules (`src/lib/money/`)

- **`formatMoney`**: Canonical `en-GB` GBP string from signed pence; `null`/`NaN` → `—`; optional `showPlusForPositive`.
- **`getMoneyTone` / `moneyToneClass`**: Maps amount + optional `direction` / `semantic` to Tailwind tone classes (`text-success`, `text-danger`, `text-info` for transfers, `text-warning`, `text-muted-foreground`). Default: positive → green, negative → red. Income/expense semantics force favourable tones for non-zero amounts. **`ledger_net`**: tone follows the sign of the amount (trial-balance nuances may differ; see audit).
- **`MoneyAmount`** (`src/components/money/money-amount.tsx`): Displays formatted money with optional `toneMode: 'neutral'` for raw debit/credit columns.

## Account detail

- **`getAccountActivity`** loads posted journals with **`reference`**, **`reversal_of`**, **`reversal_of_journal_id`**, **`reversed_by`** for drill-down and labelling.
- **`buildAccountTransactionSummaryRows`** groups lines by **`journal_id`**; **`journalKindLabel`** maps `source_type` (donation, bank, manual, lettings, payroll, etc.) and reversals.
- **`AccountDetailActivityClient`**: Tabs — **Transaction summary** (default) and **Journal lines**; warnings for missing fund (income/expense/fund-like) and unusual debit/credit patterns; links to reversal/original journals.

## Related

- **`FinanceAmount`**: Now delegates numeric formatting to **`formatMoney`**; prefer **`MoneyAmount`** for new screens.

## Tests

- **`tests/money-display.test.ts`**: `formatMoney`, `getMoneyTone`, `journalKindLabel`, summary grouping.
