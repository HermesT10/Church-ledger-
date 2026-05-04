# Billing Architecture

## Goals
- Support organisation-level subscriptions, seat awareness, and future Stripe integration.
- Keep billing state separate from church finance data.
- Allow feature gating without coupling pricing logic into UI components.

## Data Model

### `subscription_plans`
- Catalog of commercial plans.
- Stores plan code, name, description, seat limits, prices, and plan metadata.

### `organisation_subscriptions`
- One row per organisation.
- Stores status, billing email, trial/grace/current period dates, seat counts, Stripe identifiers, and plan link.
- Status values:
  - `trial`
  - `active`
  - `past_due`
  - `grace_period`
  - `cancelled`
  - `suspended`

### `subscription_features`
- Feature entitlements per plan.
- Supports simple `enabled` flags plus optional numeric limits.

## App Layer

### Read path
- `src/lib/billing/actions.ts` reads the active organisation subscription and feature list.
- `src/lib/billing/feature-gates.ts` evaluates whether a feature is available based on subscription status, feature enablement, and seat limits.

### UI path
- `src/app/(app)/settings/settings-client.tsx` surfaces plan, status, seats, and feature entitlement badges.
- `src/app/(app)/internal/page.tsx` shows support-facing subscription state for many organisations.

## Planned Stripe Integration
1. Checkout creates or upgrades a Stripe customer/subscription.
2. Stripe webhook updates `organisation_subscriptions`.
3. Seat count sync runs from membership changes or scheduled reconciliation.
4. Feature gating reads from the database only, not directly from Stripe.

## Feature Gate Conventions
- Use feature codes such as:
  - `reports`
  - `branding`
  - `support_console`
  - `priority_support`
- Keep feature checks in shared helpers so route gating and UI gating behave consistently.

## Suspension / Grace Period Rules
- `past_due`: customer attention needed, but avoid abrupt finance lockouts.
- `grace_period`: allow continued access while prompting action.
- `suspended`: hide or block premium features; retain read-only access where policy requires.
- Keep write-lock rules explicit before turning on commercial enforcement.

## Next Implementation Steps
1. Add Stripe checkout/session creation server actions.
2. Add webhook verification and idempotent sync.
3. Auto-update seat counts on membership changes.
4. Enforce feature gates on premium routes once pricing is live.
