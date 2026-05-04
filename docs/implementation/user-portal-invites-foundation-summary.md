# User Portal Invites Foundation Summary

## Implemented

- Created `docs/audits/user-portal-invites-permissions-audit.md` from actual repo inspection.
- Added a portal invite/permissions migration:
  - hardens `organisation_invites` with `workspace_id`, `invited_email`, `invited_full_name`, `employee_id`, `invite_code`, `token_hash`, lifecycle status, accepted/revoked metadata, and admin-only update RLS;
  - adds `portal_permission_presets`;
  - adds `portal_user_permissions` for page/action toggles, assigned budgets, assigned funds, and linked bank accounts.
- Reworked invite actions to:
  - generate high-entropy invite tokens;
  - store SHA-256 token hashes only for new invites;
  - generate human-readable invite codes;
  - block expired, revoked, accepted, wrong-code, and wrong-email acceptance;
  - resolve workspace server-side from the invite record;
  - create/reactivate memberships;
  - create portal permission scope rows;
  - write audit log entries.
- Added `/invite/[token]?code=INVITE_CODE` acceptance.
- Added `/employees/[id]` with a new `Portal Access` tab for invite generation, copying links, sending/resending/revoking invites, permission presets, page/action toggles, assigned budgets, assigned funds, linked debit/cards, and recent activity.

## Security Notes

- The legacy `token` column is retained for compatibility but new invite links use `token_hash`.
- Invite email delivery continues to use Supabase Auth because no transactional email provider is configured in the app.
- Fine-grained portal permissions are now stored, but page/action enforcement across every module should be completed in the next phase.

## Verification

- Added `tests/userPortalInvites.test.ts` to assert security and UI markers.
- The focused test and lint results should be reviewed after running the project checks.
