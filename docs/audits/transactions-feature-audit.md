# Transactions feature — codebase audit

**Date:** 2026

**Tenant column:** Product language says `workspace_id`; this codebase uses **`organisation_id`** referencing `public.organisations(id)`. New tables and policies should use `organisation_id`, and implementation docs should record the workspace-to-organisation mapping.

---

## 1. Routing and navigation

There is no dedicated `/transactions` route today. Main app routes live under `src/app/(app)`.

| Area | Current routes / files |
|------|------------------------|
| Navigation | `src/components/app-sidebar.tsx` defines `NAV_GROUPS`; Banking currently contains Banking, Cash, Reconciliation. Structure contains Funds, Accounts, Journals. |
| Journals | `src/app/(app)/journals/page.tsx`, `new/page.tsx`, `[id]/page.tsx`, `journal-form.tsx` |
| Banking | `src/app/(app)/banking/page.tsx`, `[bankAccountId]/page.tsx`, `[bankAccountId]/import/page.tsx` |
| Reconciliation | `src/app/(app)/reconciliation/page.tsx`, `statement/page.tsx`, `history/page.tsx`, `clearing/page.tsx` |
| Cash | `src/app/(app)/cash/*` for collections, spends, deposits, ledger |
| Income / expenses | `donations`, `giving-imports`, `bills`, `payment-runs`, `payroll`, `workflows/expenses`, `workflows/invoices` |

**Recommendation:** add Transactions under the Banking nav group, because its core job is explaining manual cash movement before matching bank proof.

---

## 2. Existing database structures

### Bank import and reconciliation

| Table | Migration | Notes |
|-------|-----------|-------|
| `bank_accounts` | `00008_phase3_banking_foundation.sql`, later `00036_gl_bank_allocation.sql` | Organisation-scoped bank records; `linked_account_id` maps a bank account to a GL asset account. |
| `bank_statements` | `00008_phase3_banking_foundation.sql` | Imported statement headers with import metadata. |
| `bank_lines` | `00008_phase3_banking_foundation.sql`, `00032_banking_allocations.sql`, `00033_reconciliations.sql` | Imported bank transactions. Has `fingerprint` unique per bank account, `allocated`, `reconciled`, `reconciled_at`, `reconciliation_id`. |
| `allocations` | `00032_banking_allocations.sql` | One GL allocation per bank line (`unique (bank_line_id)`). |
| `bank_reconciliation_matches` | `00021_bank_reconciliation.sql` | Bank line to journal match table; `bank_line_id` unique. |
| `reconciliations` | `00033_reconciliations.sql` | Statement reconciliation sessions. |

### Ledger

| Table | Migration | Notes |
|-------|-----------|-------|
| `journals` | `00007_journals.sql` | `status` lifecycle is `draft`, `approved`, `posted`; reports use posted journals. |
| `journal_lines` | `00007_journals.sql` | Ledger line truth for accounts/funds; includes `account_id`, `fund_id`, debit/credit pence. |
| Source lineage | `00036_gl_bank_allocation.sql` | Adds `journals.source_type` and `source_id`. Existing comment lists `bank`, `bill`, `payment`, `payroll`, `donation`, `giving`, `manual`, `bank_migration`. |
| Posted invariants | `00065_harden_posted_journal_invariants.sql` | Posted journals/lines are protected from direct mutation. |

### Funds and accounts

- `funds` is defined from `00004_funds.sql` and extended by `00071_funds_control_centre.sql`; balances are derived from posted ledger lines, not stored as mutable current balances.
- `accounts` is defined from `00006_accounts.sql` and extended through `00029_accounts_hierarchy.sql`, `00041_cash_management.sql`, and the Accounts control-centre migrations; active/module flags now drive selector availability.

### Audit and approvals

- `audit_log` is defined in `00028_audit_log.sql`; app helper is `src/lib/audit.ts`.
- Workflow events use `approval_events` in existing modules (`journals`, `bills`, `payroll`, `gift_aid`).

---

## 3. Existing posting paths

| Flow | Posting path |
|------|--------------|
| Manual journal | `src/lib/journals/actions.ts` creates `journals` with `source_type = 'manual'`; approval/post actions move to posted and invalidate report cache. |
| Bank allocation | `src/lib/banking/actions.ts` calls RPC `post_bank_allocation_atomic`; RPC creates a posted journal with `source_type = 'bank'`, sets `bank_lines.allocated = true`, and relies on unique allocation semantics. |
| Bills / payment runs / payroll | Atomic SQL RPCs create posted source journals with `source_type` and `source_id`. |
| Donations / Gift Aid | Server actions create source-linked journals and invalidate report cache. |

**Core risk:** bank allocation and reconciliation matching are separate systems. A bank line can be allocated into a bank-sourced journal, while `bank_reconciliation_matches` can also link that bank line to a different posted journal unless server-side checks prevent it. Transactions must make this mutual exclusion explicit.

---

## 4. Reconciliation flow

`src/lib/reconciliation/actions.ts` currently:

- lists unreconciled bank lines by excluding rows already in `bank_reconciliation_matches`;
- suggests matches by comparing a bank line to posted journals within a date window;
- creates a match in `bank_reconciliation_matches`;
- marks `bank_lines.reconciled = true`;
- supports statement reconciliation sessions via `reconciliations` and `bank_lines.reconciliation_id`.

The current candidate model is journal-centric. A manual transaction workflow should add transaction-aware candidates, but final posting should still resolve to exactly one journal.

---

## 5. Attachments and storage

Financial evidence already exists in:

- `src/lib/evidence/actions.ts` — uploads to bucket `financial-evidence`, derives `organisation_id` server-side, checks `assertCanPerform`, writes `logAuditEvent`.
- `src/lib/evidence/config.ts` — maps entity types to permission modules and builds `/api/evidence` access paths.

**Recommendation:** reuse the financial evidence bucket/path model, but keep transaction-specific attachment metadata in `transaction_attachments` for receipt status, hashes, and UI lists.

---

## 6. RLS and permissions

Existing financial table pattern:

- `select`: `public.is_org_member(organisation_id)`
- writes: `public.is_org_treasurer_or_admin(organisation_id)`
- app actions derive `orgId` from `getActiveOrg()`
- permission checks via `assertCanPerform(role, action, module)` in `src/lib/permissions.ts`

Current `Module` does not include `transactions`, so either add a `transactions` module to the permission matrix or intentionally use the closest existing module (`journals` or `banking`) and document it. A dedicated `transactions` module is clearer for UI and evidence permissions.

---

## 7. Reports affected

Reports should continue to consume posted ledger rows, not draft/submitted manual transactions.

| Report area | Existing source pattern |
|-------------|-------------------------|
| Income & Expenditure | Posted journals and `journal_lines`, grouped by account type. |
| Balance Sheet | Posted journals plus account type sections. |
| Fund Movement / fund balances | Posted journal lines with `fund_id`. |
| Account activity | Posted journal lines with `account_id`. |
| Budget vs Actual | Posted actuals from ledger lines. |
| Trustee / dashboard reports | Posted journals and source metadata. |

**Implementation rule:** a manual transaction only affects reports after it creates a posted journal and stores `posted_journal_id`.

---

## 8. Recommended implementation sequence

1. **Schema** — add manual transaction tables, constraints, indexes, RLS, and a small RLS smoke SQL document. Use `organisation_id`.
2. **Pure domain helpers** — transaction status transitions, line validation, duplicate scoring, match scoring, posting line builders.
3. **Server actions** — create/save/submit/approve/reject/void/list/detail, all deriving `orgId`, validating with Zod, and logging audit events.
4. **Attachments** — transaction metadata rows plus evidence bucket upload/download/remove actions.
5. **Reconciliation integration** — suggest and confirm manual transaction matches from bank lines; block allocated/already matched/already posted duplicates.
6. **Posting** — create exactly one posted journal for a transaction, set `posted_journal_id`, and update match/reconciliation status atomically where practical.
7. **UI** — add `/transactions`, list tabs, filters, form flow, detail tabs, and navigation.
8. **Tests and docs** — domain unit tests, SQL smoke docs, and implementation summary.

---

## 9. Implementation risks

1. **Duplicate accounting:** manual transaction + bank allocation can otherwise produce two posted journals for one real-world event.
2. **Status drift:** `manual_transactions.status`, `bank_lines.reconciled`, `bank_lines.allocated`, `transaction_matches.match_status`, and `journals.status` need one authoritative transition path.
3. **Posted immutability:** once `posted_journal_id` exists, edits must use void/reversal semantics rather than mutating posted journal lines.
4. **Tenant safety:** never accept client-submitted organisation/workspace ids; all joins must check same organisation.
5. **Attachment privacy:** receipt download URLs must be scoped and should not expose storage service credentials.
6. **UI overlap:** Journals, Banking allocation, Cash, Bills, and Donations already record financial activity; Transactions must be positioned as pre-ledger/manual explanation + bank matching, not a duplicate entry workflow.
