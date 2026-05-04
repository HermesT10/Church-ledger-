# Subscription / Billing Investigation

## Scope
Use this when a customer asks about plan, seats, suspension, grace period, or premium features.

## Checks
1. Open `/internal` and search the organisation.
2. Review the `organisation_subscriptions` row:
   - status
   - seat_count
   - seat_limit
   - trial/grace/current period dates
   - Stripe identifiers
3. Review linked `subscription_plans` and `subscription_features`.
4. Compare seat count against active memberships.

## Current Product State
- Billing is scaffolded in the app and schema.
- Stripe automation is not yet live.
- Feature gates should be evaluated through shared helpers, not ad hoc UI logic.

## Common Fixes
- Missing subscription row: create or sync the org subscription record.
- Wrong seat count: reconcile against current active memberships.
- Premium feature missing: confirm the plan has the expected `subscription_features` entry.

## Escalation
- If Stripe integration is enabled later, inspect webhook delivery and idempotency state before editing records manually.
