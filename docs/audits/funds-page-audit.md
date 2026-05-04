# Funds page — codebase audit

**Generated:** audit pass against Church Ledger repo (Next.js / Supabase / Postgres).

**Naming:** This product uses **`organisation_id`** referencing **`public.organisations(id)`**. There is **no `workspace_id`**. Future docs and UX may say “organisation” interchangeably with “church workspace”, but schema and policies use `organisation_id`.

---

## 1. Routes and UI

| Area | Paths |
|------|--------|
| Funds list | `src/app/(app)/funds/page.tsx` → `funds-client.tsx` |
| New fund | `src/app/(app)/funds/new/page.tsx` |
| Fund detail | `src/app/(app)/funds/[id]/page.tsx` → `fund-detail-client.tsx` |
| Edit fund | `src/app/(app)/funds/[id]/edit/page.tsx`, `edit-form.tsx` |
| Server actions wrapper | `src/app/(app)/funds/actions.ts` |
| Core fund logic | `src/lib/funds/actions.ts`, `src/lib/funds/types.ts` |

---

## 2. Current database schema (`public.funds`)

**Origin:** `supabase/migrations/00004_funds.sql`, `00005_funds_hardening.sql`.

**Incremental columns (later migrations):**

- `reporting_group` — `00030_funds_reporting_group.sql`
- `demo_batch_id` — `00027_demo_batch_id.sql`

**Core columns (pre-upgrade):**

- `id`, `organisation_id`, `name`, `type` (`fund_type`: `restricted | unrestricted | designated`)
- `purpose_text`, `is_active`, `created_at`
- Constraint: `UNIQUE (organisation_id, name)`

**Gaps vs charity fund control-centre specification:**

- Missing: `code`, `description` (beyond purpose), structured `restriction_notes`, `opening_balance` / opening date on record, **default income/expense account** FKs, **min balance warning**, **allow_negative_balance**, **`created_by`**, **`updated_at`**, **`archived_at`** (vs boolean-only archive).
- Tenant column is **`organisation_id`**, not `workspace_id`.

---

## 3. Ledger and balances (source of truth)

**`journal_lines`** includes `fund_id` (`00007_journals.sql`). Posted journals drive balances.

**RPCs** (`00042_fund_period_stats.sql`):

- `get_fund_balance_stats(p_org_id)` — all-time posted aggregates per fund
- `get_fund_period_stats(p_org_id, start, end)`
- `get_fund_account_breakdown(...)`
- `get_fund_transactions(...)` — paginated journal-derived lines

**Application:** `getFundsWithStats`, `getFundDetailStats`, `getFundTransactions` in `src/lib/funds/actions.ts`.

There is **no approved pattern for manually overwriting** a “current balance” column on `funds`; balances are **derived** from ledger lines (plus planned opening entries after schema extension).

---

## 4. Income streams

**Prior state:** No `income_streams` table. Giving/donations carry **`fund_id`** (`00043_giving_upgrade.sql`, `donations`). No separate analytic dimension for “Sunday giving” vs “Lettings” at DB level beyond narrative/categories.

---

## 5. Fund transfers and adjustments (prior state)

No dedicated **`fund_transfers`** or **`fund_adjustments`** tables before the control-centre migration pack. Inter-fund movement implied **posted journals** and existing posting workflows (allocation, payroll, bills, donations).

---

## 6. Integrations referencing `fund_id`

| Domain | Evidence |
|--------|----------|
| Donations | `src/lib/donations/actions.ts`, `donations.fund_id` |
| Bills | `bill_lines.fund_id` (`00013_suppliers_bills.sql`) |
| Banking / allocation | `allocations.fund_id`, `post_bank_allocation_atomic`, `banking/actions.ts` |
| Payroll | `payroll` / run lines (`00022_payroll_runs.sql`) |
| Budgets | `budget_lines`/`budgets` with `fund_id` (`00009_phase4_budgeting.sql`) |
| Cash management | `00041_cash_management.sql` |
| Gift Aid org settings | `gift_aid_default_fund_id` (`00040_gift_aid_upgrade.sql`) |
| Org settings workflows | `00047_workflows.sql` FK to funds |

---

## 7. RLS (`funds`)

- **Enable RLS:** yes (`00004_funds.sql`)
- **Read:** `is_org_member(organisation_id)`
- **Write:** `is_org_treasurer_or_admin(organisation_id)` for insert/update/delete

Extended tables must replicate this pattern (`select` member, `write` treasurer/admin unless a narrower rule is justified).

---

## 8. Reports using fund data

- Fund RPCs above; reporting routes under `src/app/(app)/reports/` (e.g. fund movements, dashboards).
- Report shell KPI tone cards use semantic colours separately from fund entity colours.

---

## 9. Risks and constraints

1. **Additive migrations** must default new columns nullable or safe so existing tenants keep working.
2. **Opening balance** introducing **double counting** risk if implemented both as manual field and duplicated journal postings — documented in upgrade summary after implementation.
3. **`journal_status`** enum today is **`draft | approved | posted`** (`00007_journals.sql`). Transfer/adjustment **`reversed`** status may be modelled against **entity rows** (`fund_transfers`, `fund_adjustments`) linked to reversing journals rather than widening `journal_status` without a dedicated migration audit.
4. **Archive semantics:** inactive funds referenced by FKs elsewhere must remain non-deletable; posting rules depend on **`is_active` / `archived_at`** enforced in actions and triggers.

---

## 10. Recommended implementation sequence

1. Author migration pack: extend `funds`; add `income_streams`, `fund_transfers`, `fund_adjustments`; optional `journal_lines.income_stream_id`; views/RPC wrappers for single-fund balance.
2. RLS policies for all new tables; document manual SQL checks for cross-org denial.
3. Server actions / Zod validation; audit logging for destructive operations.
4. Funds UI: control-centre landing + structured fund detail tabs.
5. Banking/reconciliation UX: choose fund + income stream; heuristic hints in `smartFeatures` (or sibling).
6. Extend donations/import paths with `income_stream_id` once column exists.
7. Tests + `docs/implementation/funds-page-upgrade-summary.md`.

---

## 11. Future hooks (design-only)

Stable facades (`getFundSummary`, `getFundActivity` with cursors) to support trustee summaries, AI classification of bank text, recurring transfers, pledges — without replacing the ledger as source of truth.
