# Income Stream vs Income Account Audit

## Scope

Church Ledger uses:

- **`accounts`** (chart of accounts) — GL **income account** for posting and statutory reporting.
- **`income_streams`** — optional **analytic / internal grouping** (`00071_funds_control_centre.sql`), with optional `default_income_account_id` and `default_fund_id`.
- **`journal_lines.income_stream_id`** — nullable FK to `income_streams`.

## Lettings: Schema vs UI

|`lettings_charges` columns|Source|
|---|---|
|`default_fund_id`, `default_income_account_id`|Present (`00095_lettings_feature.sql`)|
|`income_stream_id`|**Not** on `lettings_charges`. Stream is applied only when **posting** a lettings payment journal on `journal_lines`.|

**Main Lettings page** (`src/app/(app)/lettings/page.tsx`): “Add Monthly Charge” exposes **fund** and **income account** only (no income stream dropdown).

**Bank reconciliation — Lettings Income** (`src/app/(app)/reconciliation/components/lettings-reconcile-panel.tsx`): Previously showed **Category (income stream)** and **Income account** together, causing duplicate “Lettings” mental model. Server-side `resolveLettingsPostingDefaults` (`src/lib/lettings/actions.ts`) also resolves **`code = 'LETTINGS'`** stream for the **credit** line when posting.

## Where `income_stream_id` Is Used

- **DB**: `journal_lines`, `donations`, `bank_rules`, `register_category_mappings`, manual transactions (`00071`, `00075`, `00089`, register migrations, portal cash collections).
- **Registers**: `src/lib/registers/actions.ts` — loads line `income_stream_id`; mappings can optionally match on stream; **null stream is safe** (`mappingMatches` treats stream as optional on the mapping row).
- **Reconciliation**: workspace client/actions, smart forms, lettings posting overrides.
- **Donations / Gift Aid**: optional stream on donation row and reporting labels.
- **Receivable invoices** (`src/lib/invoices/*`): **no** `income_stream_id` usage.

## Where Income `account_id` Is Used (Lettings)

- Hirer/charge defaults: `default_income_account_id` on `lettings_hirers` / `lettings_charges`.
- `reconcileLettingsChargeFromBankLine`: credit line **`account_id = defaults.incomeAccountId`** (charge → hirer → income account heuristics → user override).

## Duplication Risks

1. **UX**: Stream label “LETTINGS” + income account named “Lettings” felt like choosing the same thing twice.
2. **Model**: `income_streams.default_income_account_id` parallels picking a GL income account directly.

## Reports

- **Income register** can **group by account** (`groupBy === 'account'` in `src/lib/registers/actions.ts`).
- No `income_stream` string matches under `src/lib/reports/` from audit grep; impact is mainly **journal lines + registers + donations/Gift Aid**.

## RLS / Tenancy

- `income_streams`: organisation-scoped RLS (`00071`).
- Lettings tables: `organisation_id` tenant key (`00095`).

## Cleanup Decision (Product)

- **Required for normal flows**: income **account** + **fund**.
- **Income stream**: optional; **auto-derived** (e.g. LETTINGS code) where useful; **hidden** from default forms; **advanced** only when still needed.

## Implementation Plan (executed in codebase)

1. Require **fund + income account** on **create lettings charge** (Zod + UI defaults).
2. **Lettings reconcile**: required income account + fund for “create new letting”; income stream only under **Advanced classification**; server requires `accountId` when creating charge from bank line.
3. **General / Donation reconciliation** forms: income stream under **Advanced** `<details>`.
4. **Income register** manual add: income stream under **Advanced** `<details>`.
5. Bank reconciliation page passes **income-only** account list for lettings + default lettings income account id.
6. Optional **inline income account** on lettings reconcile panel via existing `createInvoiceAccountInline`.
