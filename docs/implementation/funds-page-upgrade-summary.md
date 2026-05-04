# Funds control centre — implementation summary

This document records what was shipped for the **Funds Control Centre** upgrade (see also [`docs/audits/funds-page-audit.md`](../audits/funds-page-audit.md)). All tenancy uses **`organisation_id`** referencing **`public.organisations`** — there is **no `workspace_id`** column in this codebase.

## Schema (migration `00071_funds_control_centre.sql`)

- **`public.funds`** — additive columns: `code`, `description`, `restriction_notes`, opening balance/date, default income/expense account IDs, `min_balance_warning_pence`, `allow_negative_balance`, `created_by`, `updated_at`, `archived_at`, plus uniqueness on `(organisation_id, code)` where `code` is set.
- **`public.income_streams`** — per-organisation codes (`organisation_id`, `code`, `name`, optional default fund/account, `status`).
- **`public.fund_transfers`** / **`public.fund_adjustments`** — workflow rows with enums for status/direction and optional `posted_journal_id` / `reversed_journal_id` (journal posting remains a later step; UI drafts are supported server-side).
- **`journal_lines.income_stream_id`** and **`donations.income_stream_id`** — optional analytic tagging.
- **RPC `calculate_fund_balance(org_id, fund_id)`** — net position from **posted** `journal_lines` joined to `journals` (debit minus credit), consistent with ledger-as-truth; not a stored balance on `funds`.

## RLS

`income_streams`, `fund_transfers`, and `fund_adjustments` follow the same pattern as `funds`: **select** for `is_org_member(organisation_id)`; **insert/update/delete** for `is_org_treasurer_or_admin(organisation_id)`.

Manual / CI verification notes: [`docs/sql/funds_control_centre_rls_smoke.sql`](../sql/funds_control_centre_rls_smoke.sql).

## Application layer

| Area | Behaviour |
|------|-----------|
| **Funds** | Extended types and actions (`calculateFundBalance` via RPC, audit logging on fund changes, movements actions for drafts/approve). |
| **Income streams** | Zod-validated CRUD/list in `src/lib/income-streams/`. |
| **Donations** | `createDonation` accepts optional **`income_stream_id`** (validated against org + active stream); **`buildDonationJournalLines`** writes `income_stream_id` on the donations **income** credit line **with or without** `fund_id`. `listDonations` supports **`incomeStreamId`** filter and returns **`income_stream_label`**. |
| **Banking** | **`suggestIncomeStreamCodeFromBankText`** in `src/lib/banking/income-stream-hints.ts` suggests a code string to match `income_streams.code` from bank reference text. |
| **UI** | Funds landing KPIs and actions; fund detail tabs; `/funds/movements` and `/funds/income-streams`; donations new/list/detail show income stream where present. |

## Balance rules

- **Reported fund balance** remains **derived from posted journals** (plus any future explicit opening-balance journal if you formalise `opening_balance_pence` in GL).
- **Negative balance warnings** use existing fund balance RPCs / stats where wired in UI; `allow_negative_balance` and `min_balance_warning_pence` are available for policy checks.

## Hooks for later work

- Post **fund_transfers** / **fund_adjustments** to the ledger with reversal journals (status `posted` / `reversed`) when product rules and account mapping are defined.
- AI / trustee summaries can call stable read APIs: **`calculateFundBalance`**, fund activity listing, and **`listIncomeStreams`**.
