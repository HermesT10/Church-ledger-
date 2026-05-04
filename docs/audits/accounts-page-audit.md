# Accounts (Chart of Accounts) — codebase audit

**Date:** 2026  
**Tenant column:** **`organisation_id`** referencing `public.organisations(id)`. The product specification uses “workspace”; in this codebase that maps **`workspace_id` → `organisation_id`**.

---

## A. Routing and UI

| Item | Finding |
|------|---------|
| **List / index** | [`src/app/(app)/accounts/page.tsx`](../../src/app/(app)/accounts/page.tsx) — server component; `PageHeader` “Chart of Accounts”; five `StatCard` counts by **`account_type`**; `FilterBar` (type + active-only); grouped `Card`s by type then **`reporting_category`**; table: Code, Name, Category, Status, Transactions, Balance. |
| **New account** | [`src/app/(app)/accounts/new/page.tsx`](../../src/app/(app)/accounts/new/page.tsx) + [`new-account-form.tsx`](../../src/app/(app)/accounts/new/new-account-form.tsx) |
| **Edit / detail** | [`src/app/(app)/accounts/[id]/page.tsx`](../../src/app/(app)/accounts/[id]/page.tsx) — narrow **`max-w-lg`** edit layout only; **`[id]/edit-form.tsx`** — no tabs, no activity ledger, no fund breakdown. |
| **Server actions** | [`src/lib/accounts/actions.ts`](../../src/lib/accounts/actions.ts) — FormData redirects; no Zod; no **`logAuditEvent`**. |

---

## B. Database schema

### Initial (`00006_accounts.sql`)

- Enum **`public.account_type`**: **`income` \| `expense` \| `asset` \| `liability` \| `equity`**.
- **`public.accounts`**: `id`, **`organisation_id`**, `code`, `name`, `type`, **`is_active`**, **`created_at`**, unique **`(organisation_id, code)`**.

### Hierarchy (`00029_accounts_hierarchy.sql`)

- **`parent_id`** (self-FK), **`reporting_category`** `text`; indexes on `parent_id` and `(organisation_id, reporting_category)`.
- Backfill updates for seeded codes (Tithes & Offerings, Bank Accounts, Payroll Liabilities, **General Reserves**, **Restricted Reserves**, etc.).

### Missing vs product ambition (before upgrade migration)

| Desired (spec) | Current |
|----------------|---------|
| **`fund_balance` / reserves** distinct from generic “equity” | **`equity` only** |
| **`subtype`**, **`description`**, **`normal_balance`** | Not present |
| **`status`** (active/inactive/archived) | **`is_active` boolean only** |
| **`is_system_account`**, **`allow_direct_posting`**, module flags | Not present |
| **`default_fund_id`** | Not present on accounts |
| **`created_by`**, **`updated_at`**, **`archived_at`** | Only **`created_at`** |

### Related tables referencing accounts

- **`journal_lines.account_id`** (ledger truth).
- **`bill_lines.account_id`**.
- **`organisation_settings`** / **`giving_platforms`**: numerous `*_account_id` FKs.
- **Bank** `linked_account_id` style links (see banking actions).

---

## C. Ledger and balances

### **`getAccountsWithStats`** ([`src/lib/accounts/actions.ts`](../../src/lib/accounts/actions.ts))

- Loads `journal_lines` for org + `account_id IN (...)`.
- Sums **`debit_pence − credit_pence`** per account; counts lines.
- **Does not filter** by **`journals.status = 'posted'`** — includes drafts if lines exist attached to draft journals (depending on FK usage).

### **`getTrialBalance`** ([`src/lib/reports/glReports.ts`](../../src/lib/reports/glReports.ts))

- Loads journals with **`status = 'posted'`** and aggregates lines — **authoritative for posted TB**.

### **Gap**

- **posted vs draft inconsistency** between list balances and TB — **risk** for user trust and compliance.

---

## D. Safe editing and audit

| Rule | Current |
|------|---------|
| Delete when unused | **`deleteAccount`** checks **`hasLinkedTransactions`** (`journal_lines` + `bill_lines`). |
| Type change after use | **`updateAccount`** always accepts new **`type`** — **gap**. |
| Audit trail | **`logAuditEvent`** exists ([`src/lib/audit.ts`](../../src/lib/audit.ts)); **accounts actions do not call it.** |

---

## E. Seeds and templates

- **Single inline chart**: [`src/app/(app)/onboarding/setup/actions.ts`](../../src/app/(app)/onboarding/setup/actions.ts), [`src/app/(app)/settings/seed/actions.ts`](../../src/app/(app)/settings/seed/actions.ts) — duplicated constant arrays (~INC/EXP/AST/LIA/EQU).
- **Demo data**: [`demo-data/actions`](../../src/app/(app)/settings/demo-data/actions.ts) partial overlap.

---

## F. Reporting usage

- **`buildIncomeExpenditureReport`** ([`src/lib/reports/incomeExpenditure.ts`](../../src/lib/reports/incomeExpenditure.ts)) — **`income`** vs **`expense`** by `accounts.type`; does not use **`reporting_category`** for headings (category rollup is elsewhere in UI).
- **Balance sheet** ([`src/lib/reports/balanceSheet.ts`](../../src/lib/reports/balanceSheet.ts), [`src/lib/reports/actions.ts`](../../src/lib/reports/actions.ts)) — sections **assets**, **liabilities**, **equity**; filters accounts **`.in('type', ['asset','liability','equity'])`**.
- **`getTrialBalance`** — posted lines, **`accounts.type`** on rows.
- **Dashboard** [**`reports/dashboard.ts`**] aggregates by account for tiles.

---

## G. Integration touchpoints

- **Donations / settings**: `default_donations_income_account_id`, bank, fee accounts ([`donations/actions.ts`](../../src/lib/donations/actions.ts)).
- **Gift Aid**: income + bank IDs from **`organisation_settings`** ([`giftaid/actions.ts`](../../src/lib/giftaid/actions.ts)).
- **Giving platforms**: clearing, fee, income accounts ([`giving/actions.ts`](../../src/lib/giving/actions.ts)).
- **Banking allocation**: **`accounts`** lookups for labels; postings via RPC ([`banking/actions.ts`](../../src/lib/banking/actions.ts)).
- **Settings page**: selects liability/expense/income **`accounts`** for configuration ([`settings/page.tsx`](../../src/app/(app)/settings/page.tsx)).

---

## H. RLS

- **`00006_accounts.sql`**: **select** if **`is_org_member(organisation_id)`**; write if **`is_org_treasurer_or_admin(organisation_id)`**.

---

## I. Risky assumptions

1. **`equity` → `fund_balance`**: Migrating reserves requires updating **balance sheet** builders and exports that refer to **`equity`** type and **`sections.equity`**.
2. **Enum extension** `ALTER TYPE ... ADD VALUE` on production requires compatible lock strategy.
3. **Module flags** incorrectly defaulted could hide accounts from reconciliation/donation pickers until backfilled **`true`** for existing operational accounts.

---

## J. Implementation plan (repository-aligned)

1. **Additive migration `00072`** — **`fund_balance` enum value**; **`UPDATE`** existing **`equity` → `fund_balance`** where appropriate (all rows or code-prefixed; align with migration file); add columns (**subtype**, **description**, **normal_balance**, flags, **`default_fund_id`**, timestamps, **`archived_at`**); indexes.
2. **Align balances** — `getAccountsWithStats` (and new **`getAccountBalance`**) uses **posted** journals only; shared helper/RPC optional.
3. **Services** — **`getAccountActivity`**, **`getAccountFundBreakdown`**, **`getChartOfAccountsSummary`** with pagination/date filters as needed.
4. **Actions** — Zod validation; block type/subtype misuse when **`hasLinkedTransactions`**; **`logAuditEvent`**; merge (**reassign** FKs where safe).
5. **Templates** — extract seed rows to **`src/lib/accounts/templates/*.ts`**; **`importAccountTemplate`**.
6. **UI** — control-centre layout, tabs, filters, wizard, detail tabs; **`accounts-client.tsx`** + detail client.
7. **Integrations** — filter **`getAccountsList`** / selectors by **`available_in_*`** where applicable.
8. **Reports** — include **`fund_balance`** in BS filters (**`equity` section label** → “Fund balances / reserves” in UI copy); **`incomeExpenditure`** unchanged (income/expense only).
9. **Tests & docs** — Vitest helpers; **`docs/sql/accounts_rls_smoke.sql`**; **`accounts-page-upgrade-summary.md`**.

---

## K. Explicit non-goals in first pass

- Full **SOFA/CC** statutory mapping automation (beyond **`reporting_category`** text tightening).
- **VAT** splits.
- **AI** hints (hooks reserved in summary doc).

