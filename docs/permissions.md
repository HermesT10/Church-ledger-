# Permissions Matrix

This document describes the role-based access control (RBAC) system in ChurchLedger, covering both the database layer (RLS) and the application layer (server actions).

## Roles

| Role | Description | Access Level |
|------|-------------|-------------|
| **Admin** | Organisation administrator. Full control over all data and settings. | Read + Write + Member Management + Seeding |
| **Treasurer** | Financial officer. Can create, edit, and post all financial data. Cannot manage members or seed data. | Read + Write |
| **Trustee** (`trustee_viewer`) | Board/trustee member. Read-only access to all data including reports. | Read Only |
| **Auditor** | External or internal auditor. Read-only access, optionally time-limited via `expires_at`. | Read Only (time-limited) |

## Auditor Time-Limited Access

Auditor memberships can have an `expires_at` timestamp set by an Admin in Settings > Members. When set:

- **Before expiry**: The auditor has full read access to all modules.
- **After expiry**: The auditor is treated as a non-member. All access (including read) is denied at the database level.
- **No expiry set** (`expires_at IS NULL`): Access is permanent until the membership is removed.

The expiry is enforced by the `is_org_member()` SQL function, which all RLS SELECT policies depend on. No per-table changes are needed.

## Permissions Matrix

Legend: **R** = Read | **C** = Create | **U** = Update | **D** = Delete | **P** = Post/Approve | **S** = Seed

| Module | Admin | Treasurer | Trustee | Auditor |
|--------|-------|-----------|---------|---------|
| Journals | R C U D P | R C U D P | R | R |
| Journal Lines | R C U D | R C U D | R | R |
| Accounts | R C U D | R C U D | R | R |
| Funds | R C U D | R C U D | R | R |
| Bills | R C U D P | R C U D P | R | R |
| Suppliers | R C U D | R C U D | R | R |
| Payment Runs | R C U D P | R C U D P | R | R |
| Payroll | R C U D P | R C U D P | R | R |
| Budgets | R C U D | R C U D | R | R |
| Banking (Accounts) | R C U D | R C U D | R | R |
| Banking (Imports) | R C | R C | R | R |
| Bank Statements | R C U D | R C U D | R | R |
| Bank Lines | R C U D | R C U D | R | R |
| Donations | R C U D | R C U D | R | R |
| Donors | R C U D | R C U D | R | R |
| Gift Aid Claims | R C U D | R C U D | R | R |
| Gift Aid Declarations | R C U D | R C U D | R | R |
| Giving Imports | R C U D | R C U D | R | R |
| Giving Platforms | R C U D | R C U D | R | R |
| Reconciliation Matches | R C U D | R C U D | R | R |
| Reports | R | R | R | R |
| Settings | R C U D S | R C U D | R | R |
| Members | R C U D | R | R | R |
| Organisation Settings | R U | R U | R | R |

## Enforcement Layers

### Layer 1: Database (RLS Policies)

Every table with Row Level Security enabled follows this pattern:

```
SELECT  → is_org_member(organisation_id)          -- all 4 roles
INSERT  → is_org_treasurer_or_admin(organisation_id) -- admin + treasurer
UPDATE  → is_org_treasurer_or_admin(organisation_id) -- admin + treasurer
DELETE  → is_org_treasurer_or_admin(organisation_id) -- admin + treasurer
```

#### SQL Helper Functions

| Function | Checks | Used For |
|----------|--------|----------|
| `is_org_member(org_id)` | User has a non-expired membership in the org | SELECT policies |
| `is_org_admin(org_id)` | User is admin with non-expired membership | Admin-only operations |
| `is_org_treasurer_or_admin(org_id)` | User is admin or treasurer, non-expired | INSERT/UPDATE/DELETE policies |
| `is_org_auditor(org_id)` | User is auditor with non-expired membership | Future auditor-specific features |

All functions include `(expires_at IS NULL OR expires_at > now())` to respect time-limited access.

### Layer 2: Application (Server Actions)

Server actions use the centralised `assertCanPerform(role, action, module)` function from `src/lib/permissions.ts`. This provides:

- A single source of truth for the permission matrix
- User-friendly error messages
- Full unit test coverage (448 role/action/module combinations tested)

### Layer 3: UI (Route Guards & canEdit)

Page-level server components check roles to:
- Redirect unauthorised users away from write-only pages (e.g., `/payroll/new`)
- Set `canEdit` flags to conditionally show/hide edit buttons

```typescript
const canEdit = role === 'admin' || role === 'treasurer';
```

## Cross-Organisation Isolation

Multi-tenancy isolation is enforced at the database level:

1. Every data table includes an `organisation_id` column.
2. Every RLS policy passes `organisation_id` to a helper function.
3. Helper functions check `memberships` for a row matching `(organisation_id, user_id)`.
4. A user with membership in Org A **cannot** read or write data belonging to Org B.

This isolation is absolute -- even the service-role (admin) client used for journal creation requires the server action to verify the caller's org membership first via `getActiveOrg()`.

## Admin Client (Service-Role) Usage

Some operations require bypassing RLS to perform multi-table transactions:

- `postBill` -- creates journal + lines + updates bill status
- `postPayrollRun` -- creates journal + lines + updates payroll run
- `postPaymentRun` -- creates journal + lines + updates bills + payment run
- `importGivingCsv` -- creates journals + lines for donation batches

In all cases, `assertCanPerform()` is called **before** the admin client is used. The admin client is never exposed to the browser.

## Tables with RLS Enabled

All 28 data tables have RLS enabled:

| Table | Migration |
|-------|-----------|
| profiles | 00003 |
| memberships | 00003 |
| organisations | 00003 |
| funds | 00004/00005 |
| accounts | 00006 |
| journals | 00007 |
| journal_lines | 00007 |
| bank_accounts | 00008 |
| bank_statements | 00008 |
| bank_lines | 00008 |
| budgets | 00009 |
| budget_lines | 00009 |
| organisation_settings | 00010 |
| suppliers | 00013 |
| bills | 00013 |
| bill_lines | 00013 |
| payment_runs | 00014 |
| payment_run_items | 00014 |
| donors | 00016 |
| gift_aid_declarations | 00016 |
| donations | 00016 |
| gift_aid_claims | 00017 |
| giving_platforms | 00019 |
| giving_imports | 00020 |
| giving_import_rows | 00020 |
| bank_reconciliation_matches | 00021 |
| payroll_runs | 00022 |
| payroll_run_splits | 00022 |

---

## Data Integrity Invariants

Phase 9.2 adds finance-grade safety rails that prevent even authorised users from accidentally corrupting the books.

### Immutability of Posted Records

Once a record is posted, it cannot be updated or deleted. This is enforced at two layers:

**Layer 1: RLS Policies** -- UPDATE and DELETE policies on journals, bills, payment runs, and payroll runs include `status = 'draft'` in their `USING` clause. This prevents mutations via the regular Supabase client.

**Layer 2: DB Triggers** -- The `block_posted_mutation()` trigger fires `BEFORE UPDATE OR DELETE` on:
- `journals`
- `bills`
- `payment_runs`
- `payroll_runs`

This trigger raises an exception if `OLD.status = 'posted'`, even when called via the service-role (admin) client that bypasses RLS. The only exception is setting `reversed_by` on a posted journal as part of the reversal workflow.

For `journal_lines`, the `block_posted_journal_line_mutation()` trigger checks the parent journal's status before allowing any INSERT, UPDATE, or DELETE.

### Reversal-Only Corrections

Posted journals **cannot** be edited. To correct an error in a posted journal:

1. **Reverse** the original journal (creates a new journal with equal and opposite entries)
2. **Create** a new correct journal

The reversal workflow:
- Adds two columns to `journals`: `reversal_of` (on the reversal) and `reversed_by` (on the original)
- Unique indexes ensure each journal can only be reversed once
- The `reverseJournal()` server action handles the entire workflow atomically

### Soft-Delete Pattern

Non-ledger entities use soft-delete instead of hard delete:

| Entity | Column | Functions |
|--------|--------|-----------|
| Suppliers | `is_active` | `archiveSupplier()` / `unarchiveSupplier()` |
| Donors | `is_active` | `archiveDonor()` / `unarchiveDonor()` |
| Accounts | `is_active` | `archiveAccount()` / `unarchiveAccount()` |
| Funds | `is_active` | `archiveFund()` / `unarchiveFund()` |

DB triggers (`block_hard_delete()`) prevent hard deletes on suppliers, donors, donations, and gift_aid_claims.

### Hard-Delete Rules

| Table | Delete Behaviour |
|-------|-----------------|
| Journals (draft) | Allowed (cascade deletes lines) |
| Journals (posted) | Blocked by trigger |
| Journal lines (draft journal) | Allowed |
| Journal lines (posted journal) | Blocked by trigger |
| Bills (draft) | Allowed |
| Bills (posted/paid) | Blocked by trigger |
| Payment runs (draft) | Allowed |
| Payment runs (posted) | Blocked by trigger |
| Payroll runs (draft) | Allowed |
| Payroll runs (posted) | Blocked by trigger |
| Suppliers | Blocked (use soft-delete) |
| Donors | Blocked (use soft-delete) |
| Donations | Blocked |
| Gift Aid Claims | Blocked |

### Posted Runs Must Have Journals

CHECK constraints enforce that posted payment runs and payroll runs must have an associated `journal_id`:

```
payroll_runs: CHECK (status != 'posted' OR journal_id IS NOT NULL)
payment_runs: CHECK (status != 'posted' OR journal_id IS NOT NULL)
```

### Idempotency Mechanisms

| Operation | Mechanism |
|-----------|-----------|
| Giving CSV import | Fingerprint-based unique constraint: `(organisation_id, provider, fingerprint)` |
| Banking CSV import | Fingerprint-based unique constraint: `(bank_account_id, fingerprint)` |
| Gift Aid claim creation | Atomic PG function with `SELECT ... FOR UPDATE` row locking |
| Payment run posting | Application-level status check + trigger prevents duplicate bill payment |
| Payroll run posting | Application-level status check (returns success if already posted) |
