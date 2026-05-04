# Banking Page UI Summary

## Purpose

The Banking area now acts as a cash-control hub: users can inspect bank balances, compare them with linked ledger book balances, upload statements, review imported transactions, manage bank rules, and jump into reconciliation.

## Main Banking Page

The `/banking` page uses plain-language controls and metrics:

- Total Bank Balance: latest imported statement balances across active bank accounts.
- Book Balance: ledger balance from linked bank control accounts.
- Difference: bank balance minus book balance.
- Unreconciled Transactions: lines that still need matching.
- Statements Imported This Month: statement files uploaded since month start.
- Possible Duplicates: rows marked duplicate or skipped during import.
- Last Reconciled Date: most recent reconciliation marker.

Primary actions are available from the header:

- Add Bank Account
- Upload Statement
- Reconcile
- Create Bank Rule
- Export Transactions

The account table now shows each account's statement balance, book balance, difference, unreconciled count, last import date, status, and actions for viewing, uploading, reconciling, editing, and archiving.

## Account Detail Tabs

`/banking/[bankAccountId]` uses URL-driven tabs:

- `overview`: account metrics, metadata, and linked ledger account.
- `transactions`: paginated statement transaction table with filters.
- `statements`: import history and import outcomes.
- `reconciliation`: progress summary and recent unreconciled lines.
- `rules`: bank rules for the account.
- `documents`: document/evidence guidance and statement evidence link.
- `audit`: account/import/reconciliation audit events.

## Query Strategy

The data layer in `src/lib/banking/actions.ts` adds focused helpers instead of loading all rows into pages:

- `getBankingHubData()` builds workspace-level hub summaries.
- `getBankAccountDetailData()` builds one account's overview, statements, rules, audit, and reconciliation summary.
- `getBankLines()` remains server-side paginated and now supports date, status, direction, search, and amount filters.
- `listBankRules()` and `createBankRule()` provide conservative rule management. Rules do not auto-post transactions.
- `/api/banking/export` exports a CSV of up to 5,000 filtered workspace or account transactions.

Existing indexes already cover the main access patterns:

- `idx_bank_lines_account_date`
- `idx_bank_lines_org_account_date`
- `idx_bank_lines_workspace_status_date`
- `idx_bank_statement_imports_account_uploaded`
- `idx_bank_rules_account_priority`

No extra migration was required for this UI pass.

## Permissions

Treasurers and admins can create accounts, upload statements, create rules, and archive accounts. Other users can still view the cash-control hub subject to the existing RLS and app role checks.

## Tests

Focused UI/source tests cover:

- Hub title, actions, and summary cards.
- Account table columns and actions.
- Account detail tabs.
- Transaction filters.
- Statement history and empty states.
- Server-side filtering and export wiring.

## Known Future Work

- Add a full edit-account dialog.
- Add rule editing/archiving and rule match preview.
- Add document download links for stored statement evidence if product policy allows direct access.
- Broaden Playwright coverage once auth fixtures are stable.
