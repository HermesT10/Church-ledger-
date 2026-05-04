# Income stream vs income account cleanup

## Summary

Normal money-in flows now treat **chart income account + fund** as the primary classification users must pick. **Income stream** remains optional metadata (journal analytic / internal grouping) and is **de-emphasised** in default UI—exposed under **Advanced** sections where it still appears.

## Lettings

- **Monthly charge** (`/lettings`): fund and income account are **required** on the form; copy clarifies they are distinct from any “Lettings” stream label.
- **Bank reconciliation → Lettings income**: creating a charge from a bank line **requires** an income account on the server; the workspace defaults the GL account using the same heuristic as posting (`INC-004`, subtype Lettings, or name match), then the first income account.
- **Match existing charge**: posting overrides use **dedicated empty-by-default fields** so the workspace’s global fund/account (from other transaction types) is **not** sent as an unintended override. Optional fund, income account, and income stream overrides are grouped under **Optional posting overrides** / **Advanced: income stream override**.
- **Create new letting**: income stream moved to **Advanced**; **+ Add income account** calls `createInvoiceAccountInline` and appends the new account to the lettings income list for this session.

## Reconciliation (non-lettings)

- **Other income** and **Donation / Giving** forms: income stream moved to a collapsed **Advanced** block; short helper text explains account + fund vs stream.

## Registers

- **Income** manual add on the register page: income stream selector sits under **Advanced: income stream** with explanatory copy.

## Tests

- `tests/incomeStreamAccountCleanup.test.ts` — `lettingsChargeInputSchema` requires fund and valid income account UUID.

## Related doc

- `docs/audits/income-stream-vs-income-account-audit.md`
