# User Portal Permissions Summary

## What changed

The portal permission system now has a typed page/action/scope contract in `src/lib/portal-permission-constants.ts` and server-side enforcement helpers in `src/lib/portal-permissions.ts`.

The follow-up Supabase migration `20260429204000_portal_permissions_assignments.sql` adds:

- Global system presets with `is_system_preset`.
- Budget, fund, category, and card assignment tables.
- Admin-managed RLS with self-read access for assigned portal users.
- Unique indexes for user permission rows and assignment rows.

The seeded system presets are Youth Leader, Cafe Lead, Maintenance Lead, Cash Counter, Trustee Viewer, Finance Assistant, and Read Only User.

## Admin UI

The Employee detail Portal Access tab now supports:

- Applying permission presets into visible page, action, and scope toggles.
- Budget, fund, category, and card assignment tables.
- An effective-permissions summary panel.
- Admin-only saving through `saveEmployeePortalPermissions`, which resolves the active workspace server-side and writes assignment tables for accepted portal users.

## Enforcement coverage

Server-side permission checks were added to the first high-risk paths:

- Budgets: list, grid read, and grid save.
- Cash collections: create and post flows.
- Calendar: shared context for reads, creates, updates, and deletes.
- Funds: list/detail read flows with assigned-fund checks for fund detail access.
- Registers: data loaders, drill-down loaders, and write actions.
- Documents/evidence: upload and signed-url access.
- Transactions: shared transaction permission helper and read loaders.
- Workflows and invoices: invoice submission, expense submission, and approval paths.

Admins and treasurers continue to bypass portal JSON checks through the existing role model. Other active members must have a `portal_user_permissions` row and matching assignment rows when a scoped permission is requested.

## Remaining rollout notes

This phase establishes the enforcement contract and covers the main user-facing portal entry points. Future hardening should keep expanding scope checks where records expose ownership, category, fund, or card identifiers, especially in deeper workflow transitions and exports.
