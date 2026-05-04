# Global clean-slate financial reset (manual)

This document describes how to invoke `public.admin_global_clean_financial_data` so every organisation’s **financial** workspace data is deleted in one operation. It does **not** run automatically when migrations apply; it must be executed explicitly from a privileged Postgres session (Supabase SQL Editor as a database superuser / owner, or any role that can execute the function—after migration, typically only `service_role`-backed sessions or direct DB owner).

## What is preserved

- Supabase Auth users and sessions
- `organisations`, `memberships`, `profiles`, org shell and non-financial settings as defined by the underlying `run_workspace_data_delete(..., 'financial', ...)` behaviour
- Anything not covered by the financial delete path inside that routine (see audit: `docs/audits/global-demo-data-cleanup-audit.md`)

## Preconditions

1. **Backup**: Take a project backup or logical dump before running in production. There is no in-app “undo”.
2. **Migration applied**: The migration defining `admin_global_clean_financial_data` must be applied (see `supabase/migrations/20260502130000_admin_global_clean_financial_data.sql`).
3. **Privileges**: Run as a role that may `EXECUTE` the function. The migration revokes from `anon`, `authenticated`, and `public`; use the Supabase **SQL Editor** (runs with sufficient privileges) or a migration/ops runner using the database owner.

## Arguments

Same as per-workspace financial reset:

| Argument | Meaning |
|----------|---------|
| `delete_documents` | When `true`, include document storage rows in the delete scope (if supported by `run_workspace_data_delete`). |
| `delete_report_exports` | When `true`, include report export artefacts in the delete scope. |

Default both to `false` unless operations explicitly require wiping those artefacts.

## Invocation (exact SQL)

**Conservative (recommended first run):**

```sql
select public.admin_global_clean_financial_data(false, false);
```

**Including documents and report exports:**

```sql
select public.admin_global_clean_financial_data(true, true);
```

The result is a `jsonb` object with `workspace_count`, the flag values, and a `results` array of per-organisation summaries returned by `run_workspace_data_delete`.

## Preflight (example counts)

Adjust table names to match your curiosity before wipe; examples:

```sql
select organisation_id, count(*) from public.funds group by 1 order by 2 desc;
select organisation_id, count(*) from public.bank_accounts group by 1 order by 2 desc;
```

## Post-verify

Re-run similar counts (expect zeros for financial fact tables your org cares about):

```sql
select count(*) from public.funds;
select count(*) from public.bank_accounts;
-- add module-specific checks as needed
```

Spot-check one tenant in the app: dashboards empty or zeroed, no unexpected errors.

## Rollback

There is **no** database rollback except restore from backup. The function performs destructive deletes.

## Operational warnings

- Invalid or missing `SUPABASE_SERVICE_ROLE_KEY` in app environments does not affect SQL Editor execution, but **per-workspace** preview/reset in the UI uses the service role; misconfiguration there surfaces as errors—fix env before relying on admin UI reset.
- Do **not** add `GRANT EXECUTE` on this function to `authenticated` or `anon`.
- Prefer running during a maintenance window; long-running deletes may lock hot tables.
