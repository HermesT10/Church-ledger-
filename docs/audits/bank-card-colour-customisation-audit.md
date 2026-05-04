# Bank Card Colour Customisation Audit

## Files Found

- `src/app/(app)/banking/banking-hub-client.tsx` contains the banking dashboard and the inline `AccountCard` used for each bank account card.
- `src/app/(app)/banking/page.tsx` loads banking dashboard data and renders `BankingHubClient`.
- `src/app/(app)/banking/bank-account-form.tsx` contains the create bank account dialog.
- `src/app/(app)/banking/[bankAccountId]/page.tsx` is the bank account detail/settings surface with overview, transactions, statements, reconciliation, rules, documents, and audit tabs.
- `src/app/(app)/settings/settings-client.tsx` contains the organisation Settings bank account list and archive controls.
- `src/lib/banking/actions.ts` contains bank account detail data loading, update actions, ledger-link repair, and reconciliation actions.
- `src/lib/banking/bankAccounts.ts` contains create/list bank account actions used by the dashboard create dialog.
- `src/lib/banking/types.ts` contains `BankAccountRow`, `BankAccountWithStats`, and `BankingAccountSummary`.
- `supabase/migrations/00008_phase3_banking_foundation.sql` creates the original `bank_accounts` table.
- `supabase/migrations/00089_banking_schema_foundation.sql` adds production bank account metadata.
- `src/app/globals.css` defines the app colour tokens, semantic surfaces, and light/dark theme variables.

## Current Styling Approach

The dashboard bank card was an inline card face inside `AccountCard` in `banking-hub-client.tsx`. It used the global primary token directly:

- `bg-primary`
- `text-primary-foreground`
- radial white highlight overlays
- foreground-coloured decorative contactless arcs
- fixed warning/danger circles for the card-chip decoration

The bank account detail hero used the same global `bg-primary text-primary-foreground` direction, but with larger decorative blobs. The rest of the banking page uses semantic card, border, muted, success, warning, and danger tokens from `globals.css`.

There was no separate reusable bank card component and no existing `card_theme`, `card_colour`, or `card_gradient` data in the bank account row.

## Schema Changes Needed

The `bank_accounts` table needed display-only fields for card appearance:

- `card_colour text nullable`
- `card_gradient text nullable`
- `card_theme text not null default 'purple'`

`card_theme` is constrained to known presets:

- `purple`
- `blue`
- `green`
- `teal`
- `orange`
- `pink`
- `slate`
- `black`

`card_colour` is constrained to a safe 6-digit hex value when present. Arbitrary CSS is not stored or rendered.

## Implementation Plan

1. Add a Supabase migration for the three appearance fields and database check constraints.
2. Extend bank account TypeScript types with `card_theme`, `card_colour`, and `card_gradient`.
3. Add a shared `cardAppearance` helper for preset themes, safe hex validation, readable text colour, and default fallback resolution.
4. Extend create and update actions so persisted values are validated server-side.
5. Add a card appearance section to the bank account overview/settings surface with preset swatches, live preview, optional custom hex picker, reset, and save.
6. Link the Settings bank account list to the new card colour editor for each active bank account.
7. Update dashboard card rendering and detail hero rendering to use resolved persisted appearance.
8. Add tests for default fallback, selected themes, invalid values, readable contrast, persistence wiring, and UI availability.

## Notes

The safest implementation keeps user choice as data, not CSS. Preset names and validated hex values are resolved in code, and unknown values fall back to the default purple theme.
