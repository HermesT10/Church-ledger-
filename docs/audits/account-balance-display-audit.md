# Account Balance Display Audit

## Scope

This audit covers the Accounts page balance display issue where normal income accounts such as Giving and Lettings appear as negative balances. It distinguishes raw ledger signs from user-facing display and identifies which views should remain technical.

## Where Balances Are Calculated

The canonical account balance aggregation is `getPostedAccountNetMap` in `src/lib/accounts/balances.ts`.

It loads posted journals, fetches matching `journal_lines`, and aggregates each line as:

```ts
debit_pence - credit_pence
```

That means the stored/displayed aggregate is a signed ledger net, not a user-facing activity amount.

`getAccountsWithStats` in `src/lib/accounts/actions.ts` calls `getPostedAccountNetMap` and attaches the aggregate as `balance_pence` on each `AccountWithStats` row.

## Whether Balances Are Stored Signed

The account table does not store balances. Balances are calculated from posted journal lines at read time.

The calculated `balance_pence` is signed:

- Debit-heavy accounts are positive.
- Credit-heavy accounts are negative.
- Normal income accounts are usually negative because income increases through credits.
- Normal liability accounts are usually negative because liabilities increase through credits.

This is correct as a raw ledger net, but not ideal as the default user-facing display for income and liabilities.

## How Income Accounts Are Currently Displayed

`src/app/(app)/accounts/page.tsx` renders `account.balance_pence` through a local `penceToPounds` helper. It applies green text to positive raw values and red text to negative raw values.

Because normal income is credit-driven, Giving and Lettings can show as red negative balances even though the real-world activity is positive income received.

The table header is currently a generic "Balance" for every account type. That label is fine for assets, but confusing for income, expense, and liability accounts.

## Account Detail Display

`src/app/(app)/accounts/[id]/page.tsx` displays the account detail header as "Net balance" using `MoneyAmount` with `semantic="ledger_net"`. This is more technical and still exposes the signed ledger net.

`src/app/(app)/accounts/[id]/account-detail-activity-client.tsx` intentionally shows Debit, Credit, and Net columns. This is a technical activity view and should keep accounting signs.

## Money Formatting Components

`src/components/money/money-amount.tsx` accepts a signed `amountPence` and applies tone through `src/lib/money/money-tone.ts`.

Current `MoneyAmount` supports semantic tones such as `income`, `expense`, and `ledger_net`, but it does not currently accept a separate raw amount and display amount. The Accounts overview currently does not use `MoneyAmount`; it hand-formats values.

`src/lib/money/format-money.ts` is the canonical signed pence formatter.

## Income/Expense Register Logic

The Income and Expense Registers already use account-aware signs:

- `src/lib/registers/calculate.ts` uses `credit - debit` for income.
- It uses `debit - credit` for expense.

Those register totals should not be changed by this display fix.

## Reports That Use Account Balances

Technical or formal reports use their own sign conventions:

- Trial Balance (`src/app/(app)/reports/trial-balance/trial-balance-client.tsx`) shows debit and credit columns. It should remain technical.
- Balance Sheet (`src/lib/reports/balanceSheet.ts`) computes assets as `debit - credit` and liabilities/equity as `credit - debit`. It should remain formal accounting presentation.
- Income Statement (`src/lib/reports/incomeExpenditure.ts` and `src/lib/reports/actuals.ts`) already presents income as positive `credit - debit` and expenses as positive `debit - credit`.

User-friendly pages that should prefer account-aware presentation include:

- Accounts overview
- Dashboard cards where raw account balances are shown directly
- Donations, Lettings, and supplier-facing summaries where amounts are real-world activity

This implementation starts with the Accounts overview.

## Implementation Plan

1. Add a presentation helper that converts raw ledger net to display metadata by account type.
2. Keep `getPostedAccountNetMap` unchanged.
3. Update the Accounts overview to:
   - Use section-aware column labels.
   - Show income credit balances as positive green "Income received".
   - Show expense debit balances as positive red "Spent".
   - Show liability credit balances as positive "Amount owed".
   - Preserve signed asset balances.
   - Add a concise helper text near Income Accounts.
   - Provide an accounting-value tooltip/title for advanced users.
4. Leave Trial Balance, Journal Lines, account activity Debit/Credit/Net columns, and formal reports unchanged.
5. Add focused tests for the account-aware helper and expected labels.

## Risks

- Accidentally changing ledger aggregation would alter reports and accounting integrity. This change must remain presentation-only.
- Liability and fund-balance display can differ between user-friendly overview and formal reports. Avoid reusing the helper in Balance Sheet unless explicitly intended.
- Abnormal balances need clear warning tones. Income debit balances and expense credit balances may be valid corrections but should not appear as ordinary activity.
- Existing dashboard/report code may have other raw balance displays; those should be audited separately before applying the helper broadly.
