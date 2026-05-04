# User, Account, And Staff Deletion Audit

## Scope

This audit covers the current identity, membership, staff, portal access, invite, payroll, submission, audit, RLS, and Supabase client setup needed for three safe flows:

- user self-service account deletion
- admin removal of a user from one organisation/workspace
- admin deletion or archive of staff/employee records

## Existing Application Files

| Area | Files / Symbols |
| --- | --- |
| Settings | `src/app/(app)/settings/page.tsx`, `src/app/(app)/settings/settings-client.tsx`, `src/app/(app)/settings/actions.ts` |
| Account/profile | `src/app/(app)/profile/page.tsx`, `src/app/(app)/profile/profile-client.tsx`, `src/app/(app)/profile/actions.ts` |
| Employees/staff | `src/app/(app)/employees/page.tsx`, `src/app/(app)/employees/employees-client.tsx`, `src/app/(app)/employees/[id]/page.tsx`, `src/app/(app)/employees/[id]/employee-detail-client.tsx`, `src/lib/employees/actions.ts` |
| Invites and portal access | `src/lib/invites/actions.ts`, `src/lib/portal-permissions.ts` |
| Organisation context | `src/lib/org.ts` |
| Audit logging | `src/lib/audit.ts` |
| Supabase clients | `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts` |
| Current destructive UI | `src/components/confirm-destructive-dialog.tsx`, `src/app/(app)/settings/data-management/data-management-client.tsx` |

## Current User-Related Tables

| Table | Current purpose | Important relationships |
| --- | --- | --- |
| `profiles` | one public profile per `auth.users` row | `id references auth.users(id) on delete cascade` |
| `organisations` | workspace / church tenant | referenced by most workspace data with `on delete cascade` |
| `memberships` | user-to-workspace role link | `organisation_id references organisations(id) on delete cascade`; `user_id references profiles(id) on delete cascade`; unique `(organisation_id, user_id)` |
| `organisation_invites` | workspace invite records | `workspace_id`/`organisation_id` to `organisations`; `employee_id on delete set null`; `accepted_by`, `created_by` to `profiles` |
| `portal_user_permissions` | app/portal access scopes | references `memberships on delete cascade`, `profiles on delete cascade`, `employees on delete set null` |
| `user_budget_assignments` | per-user budget access | `user_id references profiles(id) on delete cascade` |
| `user_fund_assignments` | per-user fund access | `user_id references profiles(id) on delete cascade` |
| `user_category_assignments` | per-user register/category access | `user_id references profiles(id) on delete cascade` |
| `user_card_assignments` | per-user card/account access | `user_id references profiles(id) on delete cascade`; `bank_account_id on delete set null` |
| `employees` | staff/payroll identity, separate from login user | no direct `profiles` FK; referenced by payroll and portal permissions/invites |
| `audit_log` | immutable workspace audit trail | `user_id not null references profiles(id)` currently blocks profile deletion |

## Current Membership Model

`memberships.status` currently supports:

- `invited`
- `active`
- `disabled`

The RLS helpers in `00046_rbac_invites.sql` check `status = 'active'` and `(expires_at is null or expires_at > now())`. Removed users therefore need either a non-active status or a deleted membership row to lose access.

Current server actions:

- `listMembers(orgId)` reads members for the passed organisation.
- `changeMemberRole(orgId, userId, newRole)` updates a membership.
- `removeMember(orgId, userId)` hard-deletes a membership.
- `disableMember(orgId, userId)` sets `status = 'disabled'`.
- `enableMember(orgId, userId)` sets `status = 'active'`.
- `setMemberExpiry(orgId, userId, expiresAt)` updates access expiry.

Risk: `orgId` is accepted from client calls in these actions. RLS and role checks reduce risk, but destructive flows should derive the workspace from `getActiveOrg()` to avoid trusting client workspace IDs.

## Current Profile / Account UI

`/profile` is the current account page. It supports:

- update full name
- update preferences
- change password
- global sign-out through `supabase.auth.signOut({ scope: 'global' })`

There is no current self-service account deletion flow. `Settings -> Account` is not a dedicated route yet; the sidebar footer links users to `/profile`.

## Current Staff / Employee Model

`employees` currently has:

- `full_name`
- `ni_number`
- `tax_code`
- `role`
- `is_active`
- payroll metadata added by later migrations

Current server actions:

- `createEmployee`
- `updateEmployee`
- `archiveEmployee` sets `is_active = false`
- `unarchiveEmployee` sets `is_active = true`

Current UI:

- employees list supports create/edit/archive/restore
- employee detail exists with monitoring tabs

Gaps:

- no `status`
- no `archived_at`
- no `archived_by`
- no `archive_reason`
- no hard delete flow
- no dependency preview

## Payroll And Staff Foreign Keys

Known staff blockers:

- `payroll_lines.employee_id -> employees(id) on delete restrict`

Therefore employee hard delete must be dependency-aware. If payroll lines exist, the employee should be archived, not deleted.

Known user actor blockers:

- `payroll_runs.created_by -> profiles(id)` without `on delete set null`
- `approval_events.performed_by -> profiles(id)` without `on delete set null`
- approval fields in older migrations such as `journals.approved_by`, `bills.approved_by`, `payment_runs.approved_by`, `payroll_runs.approved_by` were added without explicit `on delete set null`
- `audit_log.user_id` is not nullable and references `profiles(id)` without `on delete set null`

## Portal And Submission Data

Portal access and assignment rows are safe to remove for a workspace removal:

- `portal_user_permissions`
- `user_budget_assignments`
- `user_fund_assignments`
- `user_category_assignments`
- `user_card_assignments`
- pending `organisation_invites`

Historical submissions should be preserved:

- `invoice_submissions`
- `invoice_submission_attachments`
- `cash_collection_submissions`
- `portal_expense_submissions`
- `expense_requests`
- workflow conversation/message rows where they are accounting evidence

Some current submission FKs use `on delete cascade` for `submitted_by`/`uploaded_by`. That is unsafe for self-delete if profile deletion cascades. The product should anonymise/preserve the profile shell or migrate those FKs to `on delete set null` where evidence must survive.

## Audit Logging

`audit_log` is append-only and no update/delete RLS policies exist. This is correct for audit immutability, but the current `user_id not null references profiles(id)` blocks profile deletion.

For deletion flows, log:

- `account_deletion_requested`
- `account_deletion_blocked_sole_admin`
- `account_deletion_completed`
- `admin_remove_user_from_organisation`
- `member_permissions_revoked`
- `invite_revoked`
- `archive_employee`
- `delete_employee`

Do not log passwords, raw invite tokens, service role details, or unnecessary personal data.

## Supabase Server/Admin Setup

`src/lib/supabase/admin.ts` creates a service-role Supabase client server-side only:

- uses `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`
- disables token refresh and session persistence
- documents that it bypasses RLS

This is the correct place to use `supabase.auth.admin.deleteUser(userId)`. The service key is not exposed through `NEXT_PUBLIC_*` env vars.

## Records To Delete

Self-service account deletion:

- non-essential personal profile data
- memberships after sole-admin checks pass
- portal permissions for the user
- budget/fund/category/card assignments for the user
- pending invites for the user's email
- personal-only avatar files if any are stored
- Supabase Auth user via server-side Admin API

Admin organisation removal:

- workspace-specific portal permission rows
- workspace-specific budget/fund/category/card assignments
- pending workspace invites for the user's email
- optionally mark linked staff record inactive/archived
- membership should be soft-removed, not globally delete the auth user

Staff hard delete:

- only safe when no dependency rows exist

## Records To Anonymise

- `profiles.full_name`
- `profiles.email`
- `profiles.phone`
- `profiles.avatar_url`
- any display field exposed from deleted users

Use display fallback values:

- `Deleted user` for self-deleted users
- `Former member` for removed workspace members

## Records To Preserve

Never delete merely because the user/staff member was removed:

- posted journals and journal lines
- transactions and transaction lines
- bills/invoices
- payroll runs and payroll lines
- cash collections
- expense submissions
- approvals
- audit log rows
- accounting evidence files
- report approvals and filing history

## Deletion Risks

1. Hard-deleting `auth.users` cascades to `profiles`, which cascades through memberships and several access tables.
2. Several historical records still point at `profiles(id)` without `on delete set null`.
3. `audit_log.user_id` currently blocks profile deletion and should not be hard-deleted.
4. Membership hard-delete loses removal history and makes it harder to show removed users.
5. Current `removeMember` does not revoke portal assignments or pending invites.
6. Current employee archive does not record who archived the employee or why.
7. Staff hard delete without preview would fail on `payroll_lines` or risk losing non-payroll context.
8. Removed users must lose access immediately; all RLS helpers must treat removed users as non-members.

## Implementation Plan

1. Add lifecycle schema:
   - `profiles.status`, `profiles.deleted_at`, `profiles.anonymised_at`
   - extend membership status with `removed`
   - `memberships.removed_at`, `memberships.removed_by`, `memberships.removal_reason`
   - `employees.status`, `employees.archived_at`, `employees.archived_by`, `employees.archive_reason`
2. Add helper RPCs:
   - `anonymise_user_personal_data(user_id uuid)`
   - `remove_user_from_workspace(target_workspace_id uuid, target_user_id uuid, removed_by uuid, reason text)`
   - `get_employee_delete_dependency_preview(target_employee_id uuid)`
3. Preserve history by making blocking actor FKs nullable/set-null where safe, and by keeping a profile shell for audit display until broader FK cleanup is complete.
4. Add server-only self-delete action:
   - require authenticated user
   - block sole active admin in any workspace
   - log request/block/completion
   - anonymise profile
   - remove/revoke access rows
   - call `auth.admin.deleteUser(user.id)` using service role
   - sign out and redirect
5. Replace hard `removeMember` flow with soft removal:
   - derive active workspace server-side
   - block self/last-admin removal
   - remove portal permissions and assignments
   - revoke pending invites
   - preserve Supabase Auth user
6. Add staff dependency preview and delete/archive actions:
   - hard delete only if no dependencies
   - otherwise archive with reason
7. Update UI:
   - Profile Danger Zone
   - Settings Team & Roles removal copy/action
   - Employee detail Danger Zone with dependency preview
8. Add tests covering server-only deletion, sole-admin blocks, workspace removal, staff archive/delete, and confirmation UX.
