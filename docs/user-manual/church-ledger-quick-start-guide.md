# Church Ledger Quick Start Guide

This guide is for a new church, treasurer, administrator, or finance volunteer getting started with Church Ledger.

Use it alongside the full user manual: `docs/user-manual/church-ledger-user-manual.md`.

## First 30 Minutes Setup

### 1. Add Organisation Details

- Go to Settings.
- Check the church or charity name.
- Add charity number if applicable.
- Confirm financial year dates.
- Add or invite the main treasurer/admin users.

Why this matters: reports, Gift Aid, annual accounts, and user permissions all rely on the organisation setup.

### 2. Add A Bank Account

- Go to Banking -> Bank Accounts.
- Create the main current account, such as "Unity Trust Current Account".
- Link it to an asset account in the Chart of Accounts.
- Confirm opening balance or starting point if requested.

Common mistake: creating the bank account but not linking it to the Chart of Accounts.

### 3. Add Basic Funds

- Go to Accounting -> Funds.
- Create the main General Fund.
- Add restricted or designated funds you already use.

Starter examples:

- General Fund.
- Building Fund.
- Youth Fund.
- Mission Fund.

Reminder: a fund is the pot or purpose of money. It is not the same as an account.

### 4. Check Core Accounts

- Go to Accounting -> Accounts.
- Confirm common income accounts exist, such as Giving Income, Lettings Income, Gift Aid, and Grants.
- Confirm common expense accounts exist, such as Utilities, Cleaning, Insurance, Office Costs, Payroll, and Bank Charges.
- Archive accounts you do not use rather than deleting accounts with activity.

Reminder: an account classifies the type of income, cost, asset, or liability.

### 5. Upload A Bank Statement

- Go to Banking -> Bank Accounts.
- Open the relevant bank account.
- Upload a recent statement.
- Review the imported lines before continuing.

Common mistake: uploading the wrong statement to the wrong bank account. If this happens, open the statement import detail and use the removal wizard.

### 6. Reconcile The First Transaction

- Go to Banking -> Reconciliation.
- Select one unreconciled bank line.
- Choose the correct type: donation, income, expense, transfer, letting, payroll, Gift Aid payment, or exclude.
- Select the correct account and fund.
- Save the reconciliation.

Example:

Bank line: "JOHN SMITH GIVING GBP 100"

Use:

- Type: Donation.
- Donor: John Smith.
- Fund: General Fund.
- Account: Giving Income.

After saving, the bank line is reconciled and the ledger/reporting data is updated.

## First Week Checklist

### Banking And Reconciliation

- Upload recent statements for each bank account.
- Reconcile obvious donations, supplier payments, transfers, payroll, and Gift Aid receipts.
- Create bank rules only for repeated, recognisable transactions.
- Review excluded bank lines carefully before excluding them.

### Donors And Donations

- Add or confirm regular donors.
- Add donor aliases for bank references, such as "J Smith" for "Jane Smith".
- Check donation matching during reconciliation.
- Review missing Gift Aid declarations.

### Suppliers And Expenses

- Add common suppliers.
- Set default expense accounts where useful.
- Record supplier bills if invoices are received before payment.
- Use Payment Runs for grouped approved supplier payments.

### Income And Expense Registers

- Open Income Register.
- Review uncategorised income.
- Map transactions to the correct register category.
- Open Expense Register.
- Review uncategorised expenses.
- Save mappings for future similar transactions.

Reminder: register categories control visible rows in the register. They do not replace the Chart of Accounts.

### Cash

- Record any physical cash collections.
- Use two-person verification where possible.
- Record cash deposits and later match them to bank deposits.

### Gift Aid

- Review donors with missing declarations.
- Send declaration links where needed.
- Do not include donations in a claim until declaration status is correct.

## First Month Checklist

### Complete Reconciliation

- Reconcile every imported bank line for the month.
- Review transfers between bank accounts.
- Check that no genuine income or expense has been excluded.
- Use correction/unreconcile workflows for mistakes instead of deleting posted records.

### Review Funds

- Go to Accounting -> Funds.
- Check restricted fund balances.
- Review any overspending or unexpected movements.
- Confirm that restricted donations were posted to the right fund.

### Review Accounts

- Go to Accounting -> Accounts.
- Check income accounts, expense accounts, assets, and liabilities.
- Remember that income may be stored internally as a credit balance but is shown as positive income received on the user-facing Accounts page.
- Use Trial Balance only for technical debit/credit review.

### Complete Month-End

- Go to Planning -> Month End.
- Complete reconciliation checks.
- Review draft journals.
- Check bills, invoices, payroll, Gift Aid, and cash.
- Confirm restricted fund review.
- Generate reports after checks are complete.

### Prepare Trustee Report

- Go to Reports.
- Start with Trustee Snapshot.
- Add supporting reports if needed:
  - Income Statement.
  - Balance Sheet.
  - Budget vs Actual.
  - Fund Movement.
  - Bank Reconciliation Summary.

### Prepare Gift Aid Claim

- Go to Gift Aid.
- Check donor declarations.
- Review eligible donations.
- Create claim batch.
- Export the HMRC schedule.
- Reconcile the HMRC payment when it appears in the bank.

## Best Practice Rhythm

### Weekly

- Check Dashboard.
- Reconcile new bank lines.
- Approve expenses and bills.
- Review missing donors/suppliers.
- Record cash collections.

### Monthly

- Reconcile all bank accounts.
- Review Income Register and Expense Register.
- Complete Month End.
- Review restricted funds.
- Prepare trustee or leadership report.

### Year-End

- Complete all month-end checks.
- Reconcile all bank accounts.
- Review fund movements.
- Correct outstanding mistakes.
- Use Reports, Annual Report, AGM Pack, and Charity Accounts Assistant to prepare final reporting.

## Quick Glossary

**Account:** Accounting classification such as Giving Income, Utilities, Bank, or Payroll.

**Fund:** Pot or purpose of money, such as General Fund or Building Fund.

**Register Category:** Visible row in Income Register or Expense Register.

**Transaction:** Real-world money event.

**Journal:** Double-entry accounting record behind the scenes.

**Reconciliation:** Matching bank statement lines to the right accounting records.

**Gift Aid Declaration:** Donor declaration needed before Gift Aid can be claimed.

**Month-End:** Monthly checklist to confirm records are complete before reporting.

## Common First-Time Mistakes

### "My income account looks negative internally"

This is normal in double-entry accounting because income increases as a credit. Church Ledger shows income as positive income received on user-facing pages, while technical reports such as Trial Balance keep debit/credit accuracy.

### "I uploaded the wrong bank statement"

Open the bank account, go to the statement import detail, and use the removal wizard. If lines have been reconciled, follow the guided correction workflow.

### "A transaction is uncategorised"

Open Income Register or Expense Register, review uncategorised items, choose the correct register category, and save the mapping.

### "I cannot find the right supplier or donor"

Create the supplier or donor from the relevant page, or use quick-create during reconciliation if available. Check for duplicates first.

### "I am not sure whether to use a fund or an account"

Use a fund for the purpose or restriction of money. Use an account for the financial type.

Example: a GBP 100 donation for youth work might use:

- Fund: Youth Fund.
- Account: Giving Income.

