# Organisation Switching Issues

## Symptoms
- User belongs to multiple organisations but keeps landing in the wrong one.
- Sidebar switcher does not change the workspace.
- Reports/settings show data from the wrong organisation.

## Checks
1. Confirm the user has multiple active `memberships`.
2. Inspect `profiles.active_organisation_id`.
3. Confirm the desired organisation is still active and not disabled.
4. Review audit and product events for `switch_active_organisation` / `org_switch`.

## Common Fixes
- Ask the user to switch from the sidebar and refresh.
- If the saved active org references a stale org, set it to a valid active membership.
- If the user just accepted an invite, verify invite acceptance updated the active org.

## Notes
- The resolver falls back to the first active membership only when the stored preference is missing or invalid.
- Demo mode bypasses the switcher and always returns the configured demo org.
