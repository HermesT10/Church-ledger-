# Gift Aid declaration autofill — audit (pre/post)

## Files involved

- **UI:** `src/app/(app)/gift-aid/declarations/declarations-client.tsx`, `page.tsx`
- **Mapping:** `src/lib/giftaid/declaration-donor-mapping.ts`
- **Server:** `src/lib/giftaid/actions.ts` (`createDeclaration`, `updateDeclaration`, `withDeclarationDefaults`)
- **Validation:** `src/lib/giftaid/declaration-form.ts`
- **Types:** `src/lib/giftaid/types.ts` (`GiftAidDeclarationRow`)
- **Schema:** `public.donors`, `public.gift_aid_declarations` (snapshot columns), RLS via `organisation_id` / donor parent checks

## Prior behaviour (issues)

- Donor `<select>` only set `donorId`; users retyped identity and address.
- `withDeclarationDefaults` used `??` with client empty strings, so **defaults never applied** when the client sent `''`.
- Placeholders (`N/A`, `Address not recorded`) could pollute snapshots.

## Implemented behaviour

- Client autofill from donor profile + org name; confirmation when replacing edited fields; active-declaration notice; missing-field summary; optional donor profile sync + audit.
- Server: `declarationInputStringOrUndefined`, optional `updateDonorProfile`, `syncDonorProfileFromGiftAidDeclaration`, audit `gift_aid_declaration_donor_profile_updated`.

See **implementation:** [gift-aid-declaration-autofill-summary.md](../implementation/gift-aid-declaration-autofill-summary.md).
