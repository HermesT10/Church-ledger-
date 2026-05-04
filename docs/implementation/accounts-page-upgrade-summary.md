# Accounts (Chart of Accounts) upgrade — summary

## Tenancy wording

Supabase tables use **`organisation_id`** referencing **`public.organisations`**. Where product language says “workspace”, the implementation uses **`organisation_id`** (never `workspace_id`).

## Schema migration `00072_accounts_control_centre.sql`

- **Enum:** adds **`fund_balance`** to **`public.account_type`**. Postgres does not allow assigning a new enum value in the same transaction as **`ALTER TYPE ADD VALUE`**, so the **`equity` → `fund_balance`** **`UPDATE`** and related **`normal_balance`** backfill live in **`00073_fund_balance_account_type_backfill.sql`** instead.
- **Columns (additive):** `subtype`, `description`, `normal_balance`, `is_system_account`, `allow_direct_posting`, **`available_in_reconciliation`** / **`donations`** / **`invoices`** / **`payroll`**, **`default_fund_id`**, **`created_by`**, **`updated_at`**, **`archived_at`**, **`touch_updated_at`** trigger on **`accounts`**.
- **Indexes:** `organisation_id` + performance helpers for lookups.

## Migration `00074_account_module_flags_backfill.sql`

After **`00072`**, boolean module flags defaulted to conservative values. **`00074`** bumps common rows so pickers stay usable until each account is curated in the Accounts UI (for example, all **`expense`** lines get **`available_in_invoices`**, **`income`** rows get **`available_in_donations`**, payroll-related rows use **`subtype`** heuristics, and finance-cost expenses get **`available_in_donations`** for card/fee mappings on Giving Platforms).

## Module-flag pickers (where enforced)

| Flag | Typical use |
|------|----------------|
| **`available_in_reconciliation`** | Banking allocation (`/banking/[bankAccountId]`), asset GL Gift Aid bank pick in Settings |
| **`available_in_invoices`** | Bills, supplier defaults, workflows (invoices/expenses), cash spends, default creditors in Settings |
| **`available_in_donations`** | Cash collections income, Gifts / Giving Platforms (income, fee expense, reconciliation assets per client-side filter), donation + Gift Aid income in Settings |
| **`available_in_payroll`** | Payroll expense + liability selectors in Settings |
| **`getAccountsList`** in **`accounts/actions`** | Optional filters for integrations that call it |

General journals still load all active accounts (no module gate).

## Accounting rules

- **Balances** shown on chart / detail / summaries use **`getPostedAccountNetMap`**: **`journal_lines`** restricted to **`journals.status = 'posted'`** (aligned with **`getTrialBalance`**).
- **Type change blocked** once **`journal_lines` or `bill_lines`** reference the account (**`hasLinkedTransactions`**).
- **`mergeAccounts`** relocates **`journal_lines`**, **`bill_lines`**, **`budget_lines`**, deletes the source (`admin` client) — ensure no stray FK refs (settings / platforms) reference the discarded id in production merges.

## App layer

| Area | Highlights |
|------|------------|
| **Types** | **`AccountType`** includes **`fund_balance`**; **`equity`** retained for stale reads |
| **Templates** | **`src/lib/accounts/templates/starter.ts`** — starter/larger/charity merge; onboarding + settings seed sourced from **`STARTER_ACCOUNTS_CHART`** |
| **Import** | **`importAccountTemplateAction`** POST form on Accounts header |
| **Cleanup** | **`buildAccountCleanupSuggestions`** heuristic list + **Cleanup** tab |
| **Detail** | Fund breakdown + paginated-ish activity (**`getAccountActivity`**) |

## Reporting

- **Balance sheet** ([`balanceSheet.ts`](../src/lib/reports/balanceSheet.ts)) nets **`equity` and `fund_balance`** into the “equity” section struct (presentation label still manageable in UI).
- **`reports/actions`** balance-sheet query includes **`fund_balance`** in **`IN`**.

## Future hooks

- AI-assisted classification against **`subtype`** / **`reporting_category`**.
- Stronger **`merge_accounts`** rewriting organisation_settings / banking links.
- SOFA/CC statutory mapping tiers beyond **`reporting_category`**.
