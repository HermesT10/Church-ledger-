# User Portal Invites & Permissions Audit

## Scope

This audit inspected the current employee, auth, organisation, membership, invite, permissions, module, RLS, audit, and email patterns before adding the admin-controlled portal invite foundation.

## Files Found

### Employees

- `src/app/(app)/employees/page.tsx` loads employees for the active organisation and renders `EmployeesClient`.
- `src/app/(app)/employees/employees-client.tsx` provides list, create, edit, archive, and restore UI.
- `src/lib/employees/actions.ts` contains employee CRUD with `getActiveOrg`, `assertCanPerform`, and audit logging.
- `src/lib/employees/types.ts` defines the current payroll-oriented `Employee` type.
- Gap before implementation: no `src/app/(app)/employees/[id]` detail route existed.

### Auth, Workspace, Membership

- `src/lib/auth.ts` uses Supabase `auth.getUser()` for server-side session validation via `getSession` and `requireSession`.
- `src/lib/org.ts` resolves active organisation from `profiles.active_organisation_id` and active `memberships`.
- `supabase/migrations/00001_core_schema.sql` creates `profiles`, `organisations`, `memberships`, and the initial `user_role` enum.
- `supabase/migrations/00002_auth_trigger.sql` creates a `profiles` row from `auth.users`.
- `supabase/migrations/00046_rbac_invites.sql` adds membership `status`, invited/joined metadata, and the legacy `organisation_invites` table.

### Role and Permission Handling

- `src/lib/permissions.ts` is the central app-layer role matrix.
- Current roles are `admin`, `treasurer`, `finance_user`, `trustee_viewer`, `viewer`, and `auditor`.
- App-layer permission checks are mixed: some modules call `assertCanPerform`, while several pages still use inline role checks.
- RLS mostly uses broad helpers such as `is_org_member`, `is_org_admin`, and `is_org_treasurer_or_admin`.

### Existing Invitation Flow

- `src/lib/invites/actions.ts` previously handled settings-level invites.
- `src/app/(app)/settings/settings-client.tsx` exposes invite, resend, and revoke controls.
- `src/app/(app)/accept-invite/page.tsx` accepts legacy invite links.
- `src/app/auth/callback/route.ts` handles Supabase Auth redirects.
- Legacy risk: invite tokens were stored in plaintext and invite acceptance did not require the new human-readable invite code.

### Product Modules Relevant to Portal Permissions

- Dashboard: `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/dashboard/dashboard-client.tsx`, `src/lib/reports/dashboard.ts`.
- Budgets: `src/app/(app)/budgets/page.tsx`, `src/app/(app)/budgets/[budgetId]/page.tsx`, `src/lib/budgets/actions.ts`.
- Invoices/Bills: `src/app/(app)/bills/page.tsx`, `src/app/(app)/bills/[id]/page.tsx`, `src/app/(app)/workflows/invoices/page.tsx`, `src/lib/bills/actions.ts`.
- Cash collection: `src/app/(app)/cash/page.tsx`, `src/app/(app)/cash/collections/page.tsx`, `src/app/(app)/cash/ledger/page.tsx`, `src/lib/cash/actions.ts`.
- Transactions/expenses: `src/app/(app)/transactions/page.tsx`, `src/app/(app)/workflows/expenses/page.tsx`, `src/lib/transactions/actions.ts`.
- Calendar: `src/app/(app)/calendar/page.tsx`, `src/lib/calendar/actions.ts`, `supabase/migrations/20260429140400_calendar_feature.sql`.
- Funds: `src/app/(app)/funds/page.tsx`, `src/app/(app)/funds/[id]/page.tsx`, `src/lib/funds/actions.ts`.
- Income/expense registers: `src/app/(app)/income/register/page.tsx`, `src/app/(app)/expenses/register/page.tsx`, `src/components/registers/register-page.tsx`, `src/lib/registers/actions.ts`.

### RLS Policies

- `supabase/migrations/00003_rls_policies.sql` defines base RLS helpers and policies for core tables.
- `supabase/migrations/00023_permissions_audit.sql` adds auditor expiry support.
- `supabase/migrations/00046_rbac_invites.sql` updates helpers to require active, non-expired memberships.
- Feature tables generally follow organisation-scoped policies using `public.is_org_member` for read and `public.is_org_treasurer_or_admin` or `public.is_org_admin` for writes.

### Audit Logging

- `supabase/migrations/00028_audit_log.sql` creates append-only `audit_log`.
- `src/lib/audit.ts` writes audit entries through the service role client.
- Existing invite, employee, banking, transactions, Gift Aid, and settings actions already use audit logging.

### Email Sending

- No Resend, Nodemailer, Postmark, SendGrid, Mailgun, or SMTP dependency exists in `package.json`.
- `.env.example` has no transactional email provider variables.
- Current invites send through Supabase Auth using `admin.auth.admin.inviteUserByEmail`.

## Current Auth Model

Users authenticate through Supabase Auth. The app creates a `profiles` row per auth user, then links the user to one or more organisations through `memberships`. `getActiveOrg()` chooses the user's active organisation from `profiles.active_organisation_id` or the first active membership.

The new portal invite foundation should continue to create/connect authenticated Supabase users through `memberships`; it should not trust client-provided workspace IDs.

## Schema Gaps

- Legacy `organisation_invites` did not include `workspace_id`, `invited_full_name`, `employee_id`, `invite_code`, `token_hash`, status lifecycle fields, accepted/revoked metadata, or permission preset linkage.
- No table existed for reusable permission presets.
- No table existed for per-user or per-person portal scopes covering page toggles, action toggles, assigned budgets, assigned funds, or linked bank accounts.
- Employees were payroll-oriented; they did not represent volunteers, trustees, ministry leaders, or finance assistants. The invite model therefore needs nullable `employee_id` and independent invite name/email fields.

## RLS Risks

- Plaintext invite tokens were stored in the database.
- The old resend flow updated `organisation_invites`, but the original migration had no update policy.
- Invite acceptance could attach a leaked token to a signed-in user unless email and status validation were enforced.
- App permissions are more granular than database policies; page/action/fund/budget restrictions need app enforcement before being mirrored deeper into RLS.
- Service-role audit writes rely on application-side identity checks, so invite actions must verify the actor before writing audit events.

## Implementation Sequence

1. Harden `organisation_invites` with hashed tokens, invite codes, statuses, accepted/revoked metadata, and admin-only update RLS.
2. Add portal permission preset and per-user permission tables with admin-only RLS.
3. Update server invite actions to generate high-entropy tokens, store only token hashes, validate invite code, block expired/revoked/accepted reuse, require matching email, and resolve workspace server-side.
4. Add `/invite/[token]?code=INVITE_CODE` acceptance and keep the legacy accept page for older links.
5. Add an employee detail route with a `Portal Access` tab for invite generation, email sending, revoke/resend, permission preset selection, page/action toggles, assigned budgets/funds/cards, and recent activity.
6. Add focused tests for invite security markers and audit coverage.
7. Later phase: enforce fine-grained portal permissions at every protected page/action boundary and, where practical, mirror stable scope rules in RLS.
