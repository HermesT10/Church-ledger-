# Global demo data cleanup — audit

This document lists where demo-like or default financial data is created or surfaced, which tables are affected, why resets sometimes appear ineffective, and what is **database-backed** vs **UI-only**.

## 1. Where financial or “sample” data is created

| Source | Location | What is created | Persisted? |
|--------|----------|-----------------|------------|
| Demo generator | **Removed** (was `settings/demo-data/`); legacy demo rows still deletable via **Data Management** → `delete_workspace_demo_data` RPC | — | — |
| Clear demo | [`src/app/(app)/settings/data-management/actions.ts`](../src/app/(app)/settings/data-management/actions.ts) `deleteDemoDataAction` → RPC `delete_workspace_demo_data` | Deletes demo-tagged / registered rows only | Yes (DB) |
| Settings seed | **Removed** (was `settings/seed/`); use **Guided setup** for consented structure | — | — |
| Starter bank accounts | [`src/lib/banking/bankAccounts.ts`](../src/lib/banking/bankAccounts.ts) `seedBankAccounts` | **Bank Account 1/2/3** upsert — **blocked in production** (`NODE_ENV === 'production'`) | Yes (DB, dev only) |
| Account templates | [`src/lib/accounts/templates/starter.ts`](../src/lib/accounts/templates/starter.ts) | Definitions used by seed / onboarding (includes Bank Account 1–3 as **GL** accounts) | When seed/guided runs |
| Guided setup | [`src/app/(app)/onboarding/setup/actions.ts`](../src/app/(app)/onboarding/setup/actions.ts) `createGuidedSetupStructure` | General Fund (+ optional restricted), accounts, `register_categories` | Yes (DB); not `demo_batch_id` |
| Org bootstrap | [`src/app/(app)/onboarding/actions.ts`](../src/app/(app)/onboarding/actions.ts) `onboard` | `organisations`, `memberships`, `onboarding_progress`, `workspace_setup_progress` only | Shell only |
| Signup | [`src/app/signup/actions.ts`](../src/app/signup/actions.ts) | Auth metadata only | No finance rows |
| SQL seed script | [`supabase/seed.ts`](../../supabase/seed.ts) | Optional org “My Church” — **dev-only** unless `ALLOW_SUPABASE_SEED=true` | Yes if run |
| Migration: registers | [`supabase/migrations/20260429104502_income_expense_registers.sql`](../../supabase/migrations/20260429104502_income_expense_registers.sql) | `register_categories` + mappings for **every org that existed at migration time** | Yes (historical) |
| Perf / tests | `scripts/`, `tests/` | Synthetic rows | Non-prod / isolated |

**Note:** “Unity Trust” and similar names are **not** defined in source; they come from user entry, imports, or historical data.

## 2. Deletion order and tables (canonical)

Financial/demo reset uses `workspace_reset_table_order()` in [`supabase/migrations/20260501121200_workspace_data_reset_repair.sql`](../../supabase/migrations/20260501121200_workspace_data_reset_repair.sql). Deletion runs **child-before-parent** in this order (truncated list — see migration for full order):

Reports/documents/dashboard/calendar → gift aid / giving / banking (lines, imports, accounts) → portal/workflows → cash → payables → payroll → lettings → manual transactions → journals → **register_category_mappings**, **register_categories**, **income_streams** → budgets → **accounts**, **funds**.

**Demo-only mode** deletes rows matching `demo_seed_records` **or** `demo_batch_id IS NOT NULL` (where column exists). **Financial mode** deletes **all** rows for the workspace in those tables (subject to options for documents/report exports).

## 3. Why the UI says “deleted” but data remains

1. **Invalid `SUPABASE_SERVICE_ROLE_KEY`** — `createAdminClient()` in [`src/lib/supabase/admin.ts`](../src/lib/supabase/admin.ts) cannot authenticate; RPCs fail with errors like `Invalid API key`.
2. **Demo-only vs financial** — “Delete demo” does **not** remove manually created banks/transactions (no `demo_batch_id`). Only **financial reset** clears the full ledger for that workspace.
3. **Preview masking** — `getWorkspaceDataResetPreview` historically returned an **empty preview** when `preview_workspace_data_reset` errored, which looks like “zero rows” instead of failure (fixed in implementation pass).
4. **Archive vs delete** — Banking “Remove” in Settings archives a row (`status` / `is_active`); without setting `status = 'archived'`, trigger `sync_bank_account_status_fields` in [`supabase/migrations/00089_banking_schema_foundation.sql`](../../supabase/migrations/00089_banking_schema_foundation.sql) could re-activate `is_active` (Settings path now delegates to shared archive; see banking actions).
5. **Migration-time seeds** — `register_categories` seeded for old orgs are **real rows**, not demo-tagged; they clear only under **financial** reset or global clean RPC.

## 4. Database vs frontend “defaults”

| Mechanism | Location | Behaviour |
|-----------|----------|-----------|
| Register fallbacks | [`src/lib/registers/defaults.ts`](../src/lib/registers/defaults.ts) | Virtual category lists when DB has no rows (used by register UX — not persisted). |
| Dashboard loaders | Various `src/lib/reports/*`, `dashboard.ts` | Should use DB; empty states when counts are zero. |

## 5. Implementation plan reference

1. **Per-workspace**: [`reset_workspace_financial_data` / `delete_workspace_demo_data`](../../supabase/migrations/20260501113600_workspace_data_reset.sql) via [`src/app/(app)/settings/data-management/actions.ts`](../src/app/(app)/settings/data-management/actions.ts).
2. **Global (all orgs)**: `admin_global_clean_financial_data(...)` in a new migration — **manual `SELECT` only**; see [`global-clean-slate-data-reset-summary.md`](../implementation/global-clean-slate-data-reset-summary.md).
3. **Prevention**: Settings demo/seed/starter-bank entry points **removed or dev-gated**; **blank onboarding** does not auto-seed; guided setup remains **explicit user consent**.

## 6. Preserved by design (reset / global RPC)

- `auth.users` (Supabase Auth — not touched by app SQL)
- `organisations`, `memberships`, `profiles` (and typical role tables)
- Non-financial `organisation_settings` / payroll settings columns may be **nulled** where they reference deleted FKs (see `workspace_reset_prepare_financial_references`)

---

*Audit completed as part of global demo data cleanup initiative.*
