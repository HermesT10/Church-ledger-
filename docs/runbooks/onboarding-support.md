# Onboarding Support

## Symptoms
- User created a workspace but is stuck in setup.
- Onboarding keeps redirecting to setup.
- Customer says setup finished but dashboards still feel empty.

## Checks
1. Open `/internal` as a platform admin and search the organisation.
2. Check onboarding status and current step.
3. Confirm whether the org has funds, accounts, bank accounts, and invites.
4. Check recent `product_events` for `onboarding_started` and `onboarding_completed`.

## Common Fixes
- If onboarding is mid-flow: have an admin/treasurer revisit `/onboarding/setup`.
- If setup completed but data is empty: guide the user to the specific module empty-state CTA.
- If the user created the org but landed in the wrong workspace: use the sidebar org switcher and confirm `active_organisation_id` is set.

## Escalation
- If onboarding rows are missing, repair `onboarding_progress` for the organisation.
- If product events are missing entirely, verify Phase 5 migrations and route tracking are deployed.
