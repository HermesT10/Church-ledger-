# Dashboard Financial Overview Summary

## Widgets Added

- Top KPI cards for Total Cash, Restricted Funds Remaining, Loans Outstanding,
  YTD Income, YTD Expenses, and Net Position.
- Cash Position card grouped by Current Accounts, Savings / Reserves,
  Restricted Savings, and Cash.
- Restricted Funds & Commitments card separating restricted fund balances from
  loans and other liabilities.
- Restricted Fund Tracker table with donated, used, remaining, status, and fund
  detail links.
- Monthly Income vs Expenses table for the selected year.
- Previous Year Comparison card controlled by a dashboard toggle.
- Alerts / Next Actions card with severity, plain-language message, recommended
  action, and drill-down link.
- Setup prompts when bank accounts, restricted funds, or posted activity are
  missing.

## Data Sources

- Posted `journals` and `journal_lines` drive income, expense, monthly totals,
  restricted fund tracker, and liability balances.
- Active `accounts` classify ledger activity into income, expense, asset, and
  liability sections.
- Active `funds` provide the restricted fund list.
- Active `bank_accounts` provide cash/bank account metadata and account type.
- `bank_lines` provide latest imported running balances where available.
- `register_category_mappings` and active income/expense accounts identify
  uncategorised register work.
- Existing Gift Aid donation checks are reused for claim opportunity alerts.

## Calculation Rules

- Income = `credit_pence - debit_pence` for posted income account lines.
- Expenses = `debit_pence - credit_pence` for posted expense account lines.
- Restricted fund donated = posted income allocated to a restricted fund.
- Restricted fund used = posted expenses allocated to a restricted fund.
- Restricted fund remaining = donated minus used.
- Loan balances are inferred from positive outstanding balances on liability
  accounts whose code or name looks loan-like.
- Other liabilities are positive outstanding liability balances that are not
  classified as loans.
- Cash rows prefer latest imported bank running balance and fall back to opening
  balance or posted ledger cash/asset balances.

## Drill-Down Behaviour

- Total Cash links to `/banking`.
- Restricted Funds Remaining links to `/funds?type=restricted`.
- Loans Outstanding links to `/accounts?type=liability`.
- YTD Income links to `/income/register`.
- YTD Expenses links to `/expenses/register`.
- Cash rows link to the bank account or ledger account.
- Restricted fund rows link to `/funds/[id]`.
- Monthly income and expense values link to income/expense registers with year
  and month parameters.
- Alerts link to the most relevant workspace: funds, banking, accounts, Gift Aid,
  or registers.

## Alerts Added

- Restricted fund overspent.
- Restricted fund nearly used.
- Loan or liability balance exists.
- Expenses exceed income YTD.
- Unallocated bank transactions.
- Gift Aid claim opportunity.
- Uncategorized expense register mappings.
- All-clear state when no urgent alerts exist.

## Future Improvements

- Downloadable trustee dashboard PDF.
- AI financial commentary.
- Monthly close status embedded into the financial overview.
- Budget vs actual dashboard section.
- Custom dashboard widgets for different church roles.
- Denomination reporting pack output.
- Dedicated loan subledger and explicit restricted savings bank account flag.
