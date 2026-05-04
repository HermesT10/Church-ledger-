# Cash collection & budget errors — audit

## Executive summary

| Issue | Root cause | Fix |
|-------|------------|-----|
| Cash: `invalid input syntax for type uuid: ""` | `cash_collection_lines.fund_id` / `income_account_id` are `NOT NULL uuid`; client could send `""` (empty funds/accounts or unselected selects) and server passed values through. | Shared UUID helpers; server validates every line; client requires fund/account per line, confirmations, empty states; broaden income account loader; optional inline income account. |
| Budget: `no unique or exclusion constraint matching the ON CONFLICT specification` | Only uniqueness was index on `(budget_id, account_id, coalesce(fund_id, …))`, not plain `(budget_id, account_id, fund_id)` required by `upsert(..., onConflict: 'budget_id,account_id,fund_id')`. | Migration: drop old index; add `UNIQUE NULLS NOT DISTINCT (budget_id, account_id, fund_id)` (PostgreSQL 15+). |

---

## Cash collection — files

| Path | Role |
|------|------|
| `src/app/(app)/cash/collections/new/page.tsx` | Loads funds, income accounts, donors |
| `src/app/(app)/cash/collections/new/new-collection-client.tsx` | Form, lines, validation, inline account |
| `src/lib/cash/actions.ts` | `createCashCollection`, `postCashCollection`, `createCashSpend` |
| `src/lib/validation/uuid.ts` | `emptyStringToNull`, `normaliseOptionalUuid`, `parseRequiredUuid` |
| `supabase/migrations/00041_cash_management.sql` | `cash_collections`, `cash_collection_lines` schema |
| `src/lib/portal/cash-collection-submissions.ts` | Portal conversion path (separate) |

### Root cause (UUID)

- `createCashCollection` inserted `fund_id` and `income_account_id` without normalising `""`.
- `donor_id` used `l.donor_id \|\| null`, so anonymous was safe.
- UI defaulted `fund_id` / `income_account_id` to `''` when `funds[0]` or `incomeAccounts[0]` missing; income loader previously required `available_in_donations`, hiding many income accounts.

---

## Budget — files

| Path | Role |
|------|------|
| `src/lib/budgets/actions.ts` | `saveBudgetGrid`, `addBudgetItem` — `.upsert(..., { onConflict: 'budget_id,account_id,fund_id' })` |
| `supabase/migrations/00009_phase4_budgeting.sql` | Original expression unique index |
| `supabase/migrations/20260503130000_budget_lines_upsert_unique.sql` | Replace with constraint matching upsert |

### Root cause (ON CONFLICT)

- Expression index `uq_budget_lines_budget_account_fund` on `(budget_id, account_id, coalesce(fund_id, '00000000-…'))` cannot serve as the conflict target for `(budget_id, account_id, fund_id)`.

### Migration

- Drops the old index; adds `UNIQUE NULLS NOT DISTINCT (budget_id, account_id, fund_id)` so `NULL` fund is unique per `(budget, account)` once, matching app `lineKey` / `fundId ?? null`.

**Note:** Requires **PostgreSQL 15+** (Supabase hosted typically satisfies this). If duplicate `(budget_id, account_id, fund_id)` rows exist, the migration will fail until data is deduplicated.

---

## Implementation plan (completed in repo)

1. `src/lib/validation/uuid.ts` — shared normalisation/validation.
2. `createCashCollection` — date + counter checks; per-line UUID + amount + Gift Aid vs donor rules; normalised insert rows.
3. `createCashSpend` — `parseRequiredUuid` for fund and expense account.
4. New collection UI — placeholders, confirmations required, empty states, `+ Add income account`, Gift Aid only when donor selected.
5. Income accounts query — `available_in_donations` **or** ` available_in_reconciliation`.
6. `saveBudgetGrid` / `addBudgetItem` — `emptyStringToNull` on `fund_id` where applicable.
7. Migration `20260503130000_budget_lines_upsert_unique.sql`.
8. Tests + this document.
