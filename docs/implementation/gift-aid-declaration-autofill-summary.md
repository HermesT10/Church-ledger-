# Gift Aid declaration autofill — implementation summary

## Autofill behaviour

- On **Gift Aid → Declarations**, choosing a donor fills **charity name** (from organisation name), **title**, **first name or initials**, **surname**, **full home address** (house/name + address lines), and **postcode** from the donor profile.
- **Email** and **phone** are not declaration fields today; they appear as read-only hints under the validation summary when present on the donor.
- **Donation amount** is not linked to a selected donation in this screen; **single** declarations still require an amount via existing Zod rules; **enduring** / **oral** remain optional.
- Clearing the donor clears identity fields and resets charity name to the organisation default.
- If the user has **edited** donor-related fields after a previous selection, changing donor asks for **confirmation** before overwriting.

## Donor-to-declaration field mapping

| Donor column(s) | Declaration form |
|-----------------|------------------|
| `title` | Title |
| `first_name` | First name or initials |
| `last_name` | Surname |
| If both names missing: `full_name` / `display_name` with **two or more** tokens | First token / last token |
| If both names missing and only **one** token | Empty first/surname + **warning** (do not guess) |
| `house_name_or_number` + `address` | Full home address (joined with `", "`) |
| `postcode` | Postcode |
| Organisation `name` | Charity name default (when opening **New declaration** or clearing donor) |

Declaration rows still store **snapshots** on `gift_aid_declarations` (`donor_*_snapshot` columns) as before.

## Missing details handling

- After a donor is selected, a summary shows either **Donor details are complete** or **Some details are missing…** with a bullet list (title, first name, surname, address, postcode).
- A separate warning appears when **structured names are missing** and the name cannot be derived safely from a multi-word full name.

## Update donor profile logic

- Checkbox: **Update donor profile with these details**.
- Default: **unchecked** when donor identity matches the last autofill baseline; checked automatically when the user **changes** any of title, first name, surname, address, or postcode relative to that baseline (user may uncheck).
- On **Create draft** / **Save draft**, if checked, the server updates the `donors` row (same `organisation_id`), normalising **full home address** into `address`, clearing `house_name_or_number`, updating `title` / `first_name` / `last_name` / `postcode` / `full_name` / `display_name` when values change.
- Audit: `gift_aid_declaration_donor_profile_updated` on the **donor** entity when a change is applied.
- If unchecked, only the declaration snapshot is written; the donor profile is unchanged.

## Declaration snapshot logic

- Unchanged: declarations are still created/updated with `declarationDbFields` from validated form output; historical rows do not depend on live donor data.

## Existing active declaration handling

- If the selected donor has a declaration with `status === 'active'`, an **amber** notice is shown with an anchor link to **View on this page** (`#declaration-{id}`). Creating another draft is still allowed where the product permits it (e.g. replacement draft).

## Server-side defaults (`withDeclarationDefaults`)

- Empty or whitespace-only strings from the client are treated as **missing** so server-side defaults from donor + organisation can apply when fields are omitted.
- Placeholders such as `N/A` / `Address not recorded` are **no longer** applied for missing donor data; validation fails if required fields stay empty after hydration.

## Files touched

- `src/lib/giftaid/declaration-donor-mapping.ts` — pure mapping helpers.
- `src/app/(app)/gift-aid/declarations/page.tsx` — donor select columns, org name, active declaration map.
- `src/app/(app)/gift-aid/declarations/declarations-client.tsx` — UI, baseline tracking, checkbox, notices.
- `src/lib/giftaid/actions.ts` — `updateDonorProfile`, donor sync, blank-as-missing defaults.
- `tests/giftAidDeclarationDonorAutofill.test.ts` — mapping and action string regression checks.
