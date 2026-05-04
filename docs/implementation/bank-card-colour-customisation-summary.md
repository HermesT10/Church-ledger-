# Bank Card Colour Customisation Summary

## Schema Changes

`bank_accounts` now supports card appearance fields through `20260504082400_bank_card_appearance.sql`:

- `card_theme text not null default 'purple'`
- `card_colour text nullable`
- `card_gradient text nullable`

The database rejects unknown themes and rejects custom colours that are not safe 6-digit hex values.

## Available Themes

Preset themes are defined in `src/lib/banking/cardAppearance.ts`:

- Purple
- Blue
- Green
- Teal
- Orange
- Pink
- Slate
- Black

Purple is the default fallback.

## Settings Location

Users can edit card appearance from the bank account overview page. The Settings bank account list includes a `Card colour` action for each active bank account, linking to the overview editor.

The editor includes:

- preset colour swatches
- live card preview
- optional custom hex colour picker
- `Reset to default`
- save on submit

## Fallback Behaviour

If a bank account has no theme, an unknown theme, or no valid custom colour, rendering falls back to the purple preset. Custom colours override the preset background only when they pass the safe hex check.

## Accessibility Notes

Preset themes use dark enough backgrounds with white text. Custom hex colours use `getReadableTextColor(backgroundColor)` to choose white text for dark colours and dark text for light colours.

The card still uses the existing fixed layout, spacing, badges, balance display, and upload action placement to avoid layout shift or nested-link regressions.
