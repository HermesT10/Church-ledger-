# SaaS Readiness Audit

## Summary
Phase 5 started from a good base: self-serve org creation, resumable onboarding, invites, settings, and RLS-backed org scoping already existed. The main gaps were the missing active-org switcher, shallow onboarding completion, no commercial billing scaffold, no platform-only support surface, and no usage analytics layer.

## Current State Matrix
| Area | Current State Before Phase 5 | Risk | Phase 5 Response |
| --- | --- | --- | --- |
| New org onboarding | Self-serve org creation and onboarding progress rows existed | Setup ended with placeholder invite step and weak first-run guidance | Replaced placeholder invite step with working invites and post-setup walkthrough links |
| Invitations | Invite send/resend/revoke/accept already existed | Not integrated into onboarding, limited diagnostics on failures | Integrated into onboarding and added analytics for invite success/failure/acceptance |
| User/member management | Settings page supported role/status changes | Membership changes needed stronger SaaS-style audit/diagnostic coverage | Added analytics + audit coverage for role, enable/disable, expiry, and removal flows |
| Organisation switching | Explicit TODO in `src/lib/org.ts` | Multi-org users could land in the wrong workspace and had no switch UX | Added persisted `active_organisation_id`, resolver logic, and sidebar switcher |
| Org settings / branding | Name plus accounting settings only | Poor customer-facing identity and export branding | Added legal/contact/address/logo/report-branding fields |
| Billing / subscription | No tables or app model | No safe path to commercial plans, feature gates, or suspension states | Added subscription tables, seed plans, feature gate helpers, and settings surfacing |
| Internal admin / support | No platform-only console | Hard to support org onboarding, diagnostics, or subscription issues at scale | Added `/internal` console gated by allowlisted platform admin emails |
| Usage analytics | No product usage event store | No way to spot onboarding drop-off, module adoption, or invite failures | Added `product_events`, route usage tracking, and support-facing summaries |
| Empty states | Mixed quality across modules | New organisations could hit dead ends | Improved first-run empty states for banking, budgets, bills, donations, and funds |

## Detailed Findings

### Multi-org experience
- The data model already supported multiple memberships.
- The app still picked the oldest active membership and ignored user intent.
- There was no persisted active workspace, no switcher in the shell, and no onboarding/invite action that updated current org context.

### Onboarding and first-run UX
- Onboarding progress existed and was resumable.
- The final invite step was explicitly a placeholder.
- New workspaces could still hit thin empty states in core finance modules.

### Commercial readiness
- No billing tables, plan catalog, entitlement model, or status-aware subscription record existed.
- Nothing in the UI gave operators or customers a place to inspect seat counts or commercial state.

### Supportability
- Phase 4 diagnostics improved runtime visibility, but only within a single active org context.
- Platform operators had no cross-org search surface for onboarding/subscription/member health.

### Analytics
- There was no event layer for product usage or support-relevant failure hotspots.
- Invite failures and onboarding completion were not queryable as operational signals.

## Recommended Follow-up
1. Add Stripe checkout, webhook ingestion, and subscription sync into `organisation_subscriptions`.
2. Expand support console with org-specific drill-down pages and support notes.
3. Add branded asset upload flow for logos instead of URL-only branding.
4. Add automated integration coverage for the internal admin console and org switch action.
