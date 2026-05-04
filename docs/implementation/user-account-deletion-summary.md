# User, Account, And Staff Deletion Summary

## Self-Delete Behaviour

Users can request account deletion from `/profile` in the Danger Zone. The flow requires the exact phrase `DELETE MY ACCOUNT` and a final browser confirmation.

The server action:

- verifies the authenticated user
- blocks deletion if the user is the only active admin of any organisation
- logs request/block/completion events where workspace context exists
- removes the user from every workspace through `remove_user_from_workspace`
- revokes pending invites for the user's email
- anonymises profile PII through `anonymise_user_personal_data`
- signs out globally where possible
- deletes the Supabase Auth user with `auth.admin.deleteUser` using the server-only service role client

Supabase Auth deletion is intentionally hard delete for user-requested deletion. Historical accounting data is preserved by nulling actor FKs where needed and by anonymising the public profile before Auth deletion.

## Admin Remove User Behaviour

Settings now treats the team card as `Users & Access`. Removing a user no longer deletes the Supabase Auth user and no longer hard-deletes the membership.

The server action:

- derives and verifies the active workspace
- blocks self-removal
- delegates to `remove_user_from_workspace`
- soft-removes the membership with `status = 'removed'`, `removed_at`, `removed_by`, and `removal_reason`
- deletes workspace portal permissions and budget/fund/category/card assignments
- revokes pending invites for the workspace/email
- logs `admin_removed_user_from_organisation`

Removed members stop passing RLS helpers because they are no longer `status = 'active'`.

## Staff Archive/Delete Behaviour

Employee detail now includes a Danger Zone with a dependency preview.

- If dependencies exist, the UI tells the admin the staff member cannot be deleted and offers archive.
- Archive sets `is_active = false`, `status = 'archived'`, `archived_at`, `archived_by`, and optional `archive_reason`.
- Hard delete is available only when `get_employee_delete_dependency_preview` returns `canDelete = true` and the admin types `DELETE STAFF`.

## Data Preservation Rules

Preserved:

- posted journals, transactions, bills, payroll, approvals, cash collections, expenses, reports, audit logs, and accounting evidence files

Deleted/revoked:

- access rows, portal permissions, user assignments, workspace membership access, pending invites, and personal-only profile data

Anonymised:

- profile name, email, phone, avatar, and display identity for deleted users

## Audit Trail Rules

Audit logging records sensitive lifecycle events but avoids storing unnecessary personal data. `audit_log.user_id` is migrated to nullable `ON DELETE SET NULL` so the audit trail survives account deletion.

## Known Limitations

- Existing historical rows may still have denormalised display names outside the audited actor FK fields.
- Browser `confirm()` is used as the final confirmation for self-delete; a richer modal can replace it later.
- Auth token revocation depends on Supabase session behaviour; the flow calls global sign-out before Auth deletion, but existing JWTs may remain valid until expiry.
