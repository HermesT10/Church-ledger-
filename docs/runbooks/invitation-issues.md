# Invitation Issues

## Symptoms
- Invite email not received.
- Invite link says invalid or expired.
- User accepted the invite but did not land in the correct workspace.

## Checks
1. Search the organisation in `/internal`.
2. Confirm the invite appears in Settings or in `organisation_invites`.
3. Review recent `product_events` for:
   - `invite_sent`
   - `invite_failed`
   - `invite_accept_failed`
   - `invite_accepted`
4. Confirm `NEXT_PUBLIC_SITE_URL` is correct for the environment.

## Common Fixes
- Resend the invite from Settings if the email expired or was lost.
- If the user already had a disabled membership, re-accepting should reactivate it.
- After acceptance, verify `profiles.active_organisation_id` points at the invited org.

## Likely Root Causes
- Bad redirect base URL.
- Expired token.
- Existing active membership already present.
- Email delivery/provider issue.

## Escalation
- If invites fail during email send, inspect auth provider status and recent Sentry/server logs.
- If acceptance succeeds but switching does not happen, check profile persistence for `active_organisation_id`.
