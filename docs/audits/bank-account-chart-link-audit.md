# Bank account → chart of accounts link audit

## Scope

This audit documents how operational `bank_accounts` rows connect to General Ledger `accounts` (chart of accounts), where reconciliation and posting fail when that link is missing, and how bank accounts are created today. It is based on inspection of the current migrations and TypeScript sources (not assumptions).

## Key files

| Area | Path |
|------|------|
| Donation reconciliation / GL balance | `src/lib/reconciliation/actions.ts` |
| Reconciliation workspace (create & reconcile) | `src/app/(app)/reconciliation/reconciliation-workspace-client.tsx`, `src/lib/banking/reconciliation-workspace-actions.ts` |
| Manual transaction posting | `src/lib/transactions/posting.ts` |
| Bank account create | `src/lib/banking/bankAccounts.ts`, `src/app/(app)/banking/bank-account-form.tsx` |
| Bank account update | `src/lib/banking/actions.ts` (`updateBankAccount`) |
| Bank hub / linkage badge | `src/app/(app)/banking/[bankAccountId]/page.tsx` |
| Statement import UI | `src/app/(app)/banking/[bankAccountId]/import/import-form.tsx` |
| Active org | `src/lib/org.ts` |

## Executive summary

- The link column **already exists**: `public.bank_accounts.linked_account_id` references `public.accounts(id)` (`ON DELETE SET NULL`). The codebase does **not** standardise on `linked_ledger_account_id` or `chart_account_id`; extending the schema with a second nullable FK would duplicate meaning unless followed by a full rename.
- Reconciliation and manual-transaction posting both resolve the **bank leg** of journals from `linked_account_id`. When it is null, users see errors such as *“This bank account is not linked to a chart-of-accounts bank account.”* (donation reconciliation) or *“The selected bank account is not linked to a GL account.”* (manual transaction posting).
- **New bank accounts** are inserted via `createBankAccount` without setting `linked_account_id`, so they often remain unlinked until data is repaired or a future UI/server flow sets it.
- A server action `updateBankAccount` can set `linked_account_id`, but **no client call sites** were found in the repo at audit time; the bank detail page only **displays** linkage status.

## Current schema

### Chart of accounts: `public.accounts`

Defined in `supabase/migrations/00006_accounts.sql`. Tables use `organisation_id`, `code`, `name`, `type` (`account_type` enum: `income`, `expense`, `asset`, `liability`, `equity`), and `is_active`.

### Operational bank record: `public.bank_accounts`

Foundation in `supabase/migrations/00008_phase3_banking_foundation.sql`: `organisation_id`, `name`, optional `account_number_last4`, `sort_code`, `currency`, `is_active`, `created_at`, uniqueness on `(organisation_id, name)`.

### Link field

`supabase/migrations/00036_gl_bank_allocation.sql` adds:

- `linked_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL`
- Partial index `idx_bank_accounts_linked_account` where `linked_account_id IS NOT NULL`

Later migrations (e.g. `supabase/migrations/00089_banking_schema_foundation.sql`) add `workspace_id`, `status`, `account_type`, and related production metadata; **`linked_account_id` remains the GL link**.

**Naming recommendation for new work:** use **`linked_account_id`** consistently. Only add `linked_ledger_account_id` if the project explicitly migrates away from `linked_account_id` (not currently justified by code).

## Exact error sources

### 1) Donation reconciliation (`reconcileBankLineAsDonation`)

File: `src/lib/reconciliation/actions.ts`

After loading the bank line with nested `bank_accounts(linked_account_id, name)`, if `linked_account_id` is null the function returns:

`This bank account is not linked to a chart-of-accounts bank account.`

### 2) Manual transaction posting

File: `src/lib/transactions/posting.ts`

`resolveBankAccountLine` selects `bank_accounts.linked_account_id` for `expected_bank_account_id` (or resolves it via matched bank line). If missing:

`The selected bank account is not linked to a GL account.`

### 3) GL balance helper

File: `src/lib/reconciliation/actions.ts` (`getBankGLBalance`)

If `linked_account_id` is null:

`Bank account has no linked GL account.`

## Reconciliation and posting dependency

- **Donation from bank line:** builds a journal that **debits** the GL account referenced by `linked_account_id` (bank/asset side) and **credits** the selected income account. Without the link, the bank leg cannot be posted.
- **Reconciliation workspace** (`src/lib/banking/reconciliation-workspace-actions.ts`): internal transfers default one leg from `bank_accounts.linked_account_id` when the user does not supply both accounts; null linkage forces explicit selection or fails validation.
- **Legacy allocation RPC** (`supabase/migrations/00068_post_bank_allocation_atomic.sql`): GL journal creation is guarded by `if v_bank_account.linked_account_id is not null`. Allocations can exist without a bank-side journal if the link is missing—an accounting consistency risk.

## Bank account creation flow

- UI: `src/app/(app)/banking/bank-account-form.tsx` — collects name, type, bank metadata, opening balance fields; **no GL account picker**.
- Server: `src/lib/banking/bankAccounts.ts` — `createBankAccount` inserts into `bank_accounts` with `organisation_id`, `workspace_id`, etc., and **does not set `linked_account_id`**.
- Dev seed: `seedBankAccounts` inserts starter rows also without `linked_account_id`.

## Bank account edit / update

- `src/lib/banking/actions.ts` — `updateBankAccount` accepts optional `linked_account_id`.
- Grep for `updateBankAccount(` at audit time found **only the definition**, no components calling it. The detail header shows linkage badges in `src/app/(app)/banking/[bankAccountId]/page.tsx` but there is no wired edit form for the GL link in the surveyed files.

## Bank statement upload flow

- `src/app/(app)/banking/[bankAccountId]/import/import-form.tsx` and `src/lib/banking/import-actions.ts` (and related parsers) handle upload, mapping, and `bank_lines` creation. **Linkage to GL is not a prerequisite for import**; failures surface when posting or reconciling.

## Ledger / journal posting service

- Manual posting: `src/lib/transactions/posting.ts` (`postManualTransactionToLedger` path uses linked bank GL account for income/expense bank leg).
- Donation reconciliation: `src/lib/reconciliation/actions.ts` (`reconcileBankLineAsDonation`) inserts `journals` and `journal_lines` via admin client after validating `linked_account_id`.
- Older path: `post_bank_allocation_atomic` RPC (see migration above) posts bank leg only when linked.

## Workspace / tenant context

- `src/lib/org.ts` — `getActiveOrg()` returns `orgId` from active membership (and demo mode bypass). Banking inserts often set `workspace_id` to the same id as `organisation_id` for compatibility (`bankAccounts.ts`).

## RLS (directional)

- `public.accounts`: member read; treasurer/admin write (`00006_accounts.sql` policies).
- `public.bank_accounts`: historically org-scoped policies from `00008_phase3_banking_foundation.sql`; later `00089_banking_schema_foundation.sql` forces RLS and aligns newer banking tables with `workspace_id`. **Any bulk backfill via application roles must respect RLS**; migrations run as superuser typically bypass RLS.

## Migrations folder

- Primary location: `Church-ledger-/supabase/migrations/`
- Mix of legacy numeric migrations (`000xx_...`) and dated migrations (`2026...`).

Relevant files for this topic:

- `supabase/migrations/00006_accounts.sql`
- `supabase/migrations/00008_phase3_banking_foundation.sql`
- `supabase/migrations/00036_gl_bank_allocation.sql`
- `supabase/migrations/00068_post_bank_allocation_atomic.sql`
- `supabase/migrations/00089_banking_schema_foundation.sql`

## Backfill plan (recommended)

1. **Report:** count `bank_accounts` per `organisation_id` (or `workspace_id`) where `linked_account_id IS NULL` and `status` / `is_active` indicate the account is still in use.
2. **For each unlinked row:** ensure an `accounts` row exists with `type = 'asset'`, unique `code` per org (respect `unique (organisation_id, code)`), and a clear `name` (e.g. echo bank account name + last four).
3. **Update** `bank_accounts.linked_account_id` to that `accounts.id`.
4. **Opening balances:** if the product stores `opening_balance` on `bank_accounts`, decide whether to post an opening-balance journal vs. rely on statement running balance—this is the main accounting risk.
5. **Idempotency:** skip rows already linked; use deterministic codes or idempotent upserts to avoid duplicate asset accounts on reruns.

## Migration and product risks

- **Duplicate asset accounts** if backfill always inserts without deduplication.
- **Code collisions** on `accounts.code` unique constraint.
- **RLS:** app-level repair may need service role or a privileged RPC for treasurers.
- **Silent partial state:** legacy allocation path can leave allocations without GL bank journals when `linked_account_id` is null.
- **Reporting:** GL vs bank comparisons (`glReports` and similar) assume linkage; missing links skew dashboards.

## Recommended next implementation steps (out of scope for this audit doc)

1. Optional DB migration: only if adding constraints (e.g. NOT NULL for active bank accounts) after backfill—avoid breaking existing rows.
2. Server: on `createBankAccount`, auto-create or select default asset GL account and set `linked_account_id`.
3. UI: bank account edit dialog with GL account picker calling `updateBankAccount`.
4. Reconciliation UI: when selected bank account has null link, block primary actions and link to banking settings with copy explaining the requirement.
