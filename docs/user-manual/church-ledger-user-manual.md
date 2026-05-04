# Church Ledger User Manual

## 1. Introduction

Church Ledger is a finance system for churches and charities. It helps treasurers, administrators, trustees, staff, and volunteers record money, reconcile bank activity, manage funds, prepare reports, and keep a clear audit trail.

Church Ledger is different from generic accounting software because it is built around church finance:

- Restricted, unrestricted, and designated funds.
- Donations, donors, Gift Aid, declarations, and HMRC claim schedules.
- Lettings income, hirers, charges, and payments.
- Cash collections with verification.
- Supplier bills, receivable invoices, payment runs, payroll, and approvals.
- Trustee-friendly reports, SOFA-style reporting, annual accounts, and AGM packs.

The core idea is simple:

1. Money enters or leaves a bank or cash account.
2. The app records the real-world transaction: donation, supplier bill, letting payment, payroll, transfer, cash collection, or manual transaction.
3. Behind the scenes, posted journals keep the double-entry accounting correct.
4. Funds show the purpose or restriction of the money.
5. Accounts classify the financial activity.
6. Reconciliation proves the accounting records agree with the bank.
7. Reports turn the accounting data into information for trustees, leaders, auditors, and HMRC.

## 2. Key Concepts

### Workspace / Organisation

A workspace is your church or charity area in Church Ledger. Users belong to one or more workspaces and their role controls what they can see or change.

Example: "Grace Church" is a workspace. The treasurer can access banking and reports. A youth leader may only submit expenses and view assigned budgets.

### Bank Account

A bank account is where real money is held. It should usually be linked to an asset account in the Chart of Accounts.

Example: Unity Trust Current Account linked to an account called "Unity Trust Bank" or "Current Account".

### Chart of Accounts / Accounts

Accounts classify financial activity. They answer "what kind of money or cost is this?"

Common account types:

- Asset: bank, cash, money held.
- Liability: money owed, payroll liabilities, creditors.
- Income: Giving Income, Lettings Income, Gift Aid, Grants.
- Expense: Utilities, Cleaning, Payroll, Insurance.
- Fund balance: reserves and fund balance accounts.

Example: A GBP 100 donation to the General Fund might use the Giving Income account and the General Fund.

### Funds

Funds show the pot or purpose of money.

- Unrestricted funds can be used for general church purposes.
- Restricted funds must be used for the purpose given by the donor or grant provider.
- Designated funds are unrestricted money set aside by trustees for a purpose.

Examples:

- General Fund: unrestricted day-to-day church activity.
- Building Fund: restricted or designated building work.
- Youth Fund: youth ministry.
- Mission Fund: mission donations and grants.

### Transactions

Transactions are real-world financial events.

Examples:

- A donation received.
- A supplier paid.
- A hall hire invoice created.
- A youth leader expense submitted.
- Payroll paid.

Transactions are easier for non-accountants to understand than raw journals. Many transactions create journals when posted.

### Journals

Journals are the accounting entries behind the scenes. They keep the books balanced with debits and credits.

Example: Donation GBP 800:

- Debit bank GBP 800.
- Credit Giving Income GBP 800.

Most users should use workflow pages such as Reconciliation, Donations, Bills, Lettings, Payroll, and Cash. Use Journals for manual adjustments, corrections, and advanced accounting work.

### Reconciliation

Reconciliation matches imported bank transactions to the correct accounting records. It proves that the bank statement and Church Ledger agree.

Example: Bank line "JOHN SMITH GIVING GBP 100" is reconciled as a donation from John Smith to the General Fund.

### Cash Management

Cash Management handles physical cash: Sunday offerings, petty cash, cash spends, deposits, and verification. It helps churches keep a two-person audit trail for cash.

Example: Two volunteers count Sunday cash, record the collection, and later match the bank deposit.

### Gift Aid

Gift Aid tracks donor declarations, eligible donations, claim batches, HMRC schedules, and claim payments.

Example: Jane Smith gives GBP 100 and has a valid declaration. The donation can be included in a Gift Aid claim.

### Reports

Reports turn accounting data into usable information:

- Income Statement.
- Balance Sheet.
- SOFA.
- Budget vs Actual.
- Fund Movements.
- Trustee Snapshot.
- Annual Report.
- AGM Pack.
- Trial Balance.

## 3. Recommended User Workflow

For a new church, use this order:

1. Set up organisation details in Settings.
2. Add bank accounts and link them to asset accounts.
3. Create or import funds and accounts.
4. Upload bank statements.
5. Reconcile transactions.
6. Track income and expenses in the registers.
7. Review Gift Aid declarations and claims.
8. Run trustee and finance reports.
9. Complete month-end checks.
10. Prepare annual accounts, trustee reports, and AGM packs.

### Daily / Weekly Rhythm

- Check Dashboard alerts.
- Upload or review new bank activity.
- Reconcile new bank transactions.
- Approve supplier bills and staff expenses.
- Review unmatched donations or missing donor details.

### Monthly Rhythm

- Reconcile all bank accounts.
- Review Income Register and Expense Register.
- Check restricted fund balances.
- Review Gift Aid follow-up.
- Complete month-end checklist.
- Prepare trustee or leadership reports.

### Year-End Rhythm

- Ensure all bank accounts are reconciled.
- Review restricted funds and fund movements.
- Correct outstanding transactions.
- Close the year.
- Generate annual accounts, trustee reports, annual report, and AGM pack.

## 4. Page-by-Page Manual

Each page description includes what it is for, who should use it, how to use it, common mistakes, and related pages.

## Overview

### Dashboard

**What this page is:** The main landing page after sign-in.

**Purpose:** Shows the current financial state and the most important work to do next.

**Who should use it:** Treasurers, admins, trustees, and finance users.

**When to use it:** Start here each day or week.

**What users can do:**

- Review cash position.
- See income vs expenses.
- Check alerts and tasks.
- See month-end status.
- Review restricted fund concerns.
- See banking and reconciliation warnings.

**Walkthrough:**

1. Open Dashboard.
2. Check alert cards first.
3. If banking work is flagged, open Banking or Reconciliation.
4. If month-end is incomplete, open Month End.
5. If reports need attention, open Reports.

**Example:** If the Dashboard says "68 bank transactions need allocation", go to Banking -> Reconciliation.

**Common mistakes:** Treating Dashboard numbers as final reports before reconciliation is complete.

**Related pages:** Banking, Reconciliation, Month End, Reports, Funds.

### Calendar

**What this page is:** Organisation calendar for finance-related events and reminders.

**Purpose:** Helps plan trustee meetings, payroll dates, Gift Aid deadlines, lettings, reminders, and recurring finance tasks.

**Who should use it:** Admins, treasurers, staff, and portal users with access.

**When to use it:** When planning meetings, reminders, room bookings, payroll, or deadlines.

**What users can do:**

- Create events.
- Track finance reminders.
- View upcoming items.
- Link dates to workflows such as lettings, Gift Aid, payroll, and trustee meetings.

**Example:** Create a recurring calendar event for weekly hall hire.

**Common mistakes:** Using Calendar instead of Lettings for charge/payment tracking. Calendar plans the event; Lettings tracks the money.

**Related pages:** Lettings, Payroll, Gift Aid, Workflows.

## Banking

### Bank Accounts

**What this page is:** Hub for all church bank accounts.

**Purpose:** Create bank accounts, link them to asset accounts, upload statements, view balances, and access account-specific activity.

**Who should use it:** Treasurers and finance admins.

**When to use it:** During setup, whenever statements are uploaded, and when reviewing bank balances.

**What users can do:**

- Create bank accounts.
- Link each bank account to the Chart of Accounts.
- Open a bank account workspace.
- Upload statement files.
- View bank lines and imported statement history.
- Open import details.
- Remove an incorrect import using the statement import removal wizard.

**Walkthrough:**

1. Open Banking -> Bank Accounts.
2. Add a bank account.
3. Link it to an asset account.
4. Open the bank account.
5. Upload a statement.
6. Review imported lines.
7. Reconcile the lines.

**Example:** Create "Unity Trust Current Account" and link it to an asset account called "Unity Trust Current Account".

**Common mistakes:**

- Creating a bank account without linking it to the Chart of Accounts.
- Uploading the same statement twice.
- Deleting a statement before checking whether lines have been reconciled.

**Related pages:** Reconciliation, Accounts, Reports -> Bank Reconciliation Summary, Statement Import Detail.

### Bank Account Detail

**What this page is:** Detailed workspace for one bank account.

**Purpose:** Review statement lines, statement imports, balances, corrections, and reconciliation status.

**Who should use it:** Treasurer or finance admin.

**When to use it:** After importing statements or when investigating bank activity.

**What users can do:**

- Review imported bank lines.
- See matched, unmatched, excluded, allocated, and reconciled status.
- Access statement import details.
- Open correction and deletion actions.
- Export banking data.

**Example:** Review all March statement lines for Unity Trust.

**Common mistakes:** Treating imported bank lines as posted accounting records before reconciliation. Imports are source data; reconciliation posts or links them.

**Related pages:** Reconciliation, Statement Import Detail, Bank Rules.

### Statement Import Detail And Undo

**What this page is:** Detail page for one uploaded statement import.

**Purpose:** Shows import status, uploaded file details, imported lines, and safe removal options.

**Who should use it:** Treasurer or admin.

**When to use it:** When a wrong statement was uploaded or an import needs investigation.

**What users can do:**

- Download the original uploaded statement file.
- Review import lines and status.
- See correction history.
- Start the removal wizard.
- Unreconcile affected lines as part of safe removal.

**Example:** A February statement was uploaded to the wrong bank account. Open the import detail and use the removal wizard.

**Common mistakes:** Trying to delete an import that already has reconciled rows without undoing reconciliation first.

**Related pages:** Bank Account Detail, Reconciliation, Journals, Audit Log.

### Bank Rules

**What this page is:** Rule management for bank transaction matching and automation.

**Purpose:** Helps the app recognise repeated bank descriptions and pre-fill accounts, funds, suppliers, or transaction types.

**Who should use it:** Treasurer or finance admin.

**When to use it:** After noticing repeated transactions such as utilities, card fees, Stripe payouts, or regular transfers.

**What users can do:**

- Create rules based on description, direction, amount, or bank account.
- Set target account, fund, income stream, donor, or supplier.
- Test rules against bank activity.
- Enable auto-apply where appropriate.

**Example:** A rule for "ZOOM" can suggest Software Subscriptions and supplier Zoom.

**Common mistakes:** Making rules too broad, such as matching "PAYMENT" for many unrelated bank lines.

**Related pages:** Reconciliation, Suppliers, Accounts, Funds.

### Reconciliation

**What this page is:** Main workspace for matching bank lines to accounting records.

**Purpose:** Turns imported bank activity into correct accounting records or matches it to records already created.

**Who should use it:** Treasurer and authorised finance admins.

**When to use it:** After importing bank statements or when new bank activity appears.

**What users can do:**

- Select a bank line.
- Classify it as donation, income, expense, transfer, letting, payroll, Gift Aid payment, or exclude.
- Quick-create donors, suppliers, and accounts.
- Split transactions across funds/accounts.
- Match existing donations, bills, lettings charges, payroll, or manual transactions.
- Reconcile internal transfers.
- Add Gift Aid follow-up.
- Use unreconcile/correction workflows.

**Walkthrough:**

1. Open Reconciliation.
2. Select an unreconciled bank line.
3. Choose the transaction type.
4. Complete required fields such as donor, supplier, fund, and account.
5. Confirm or create the match.
6. The bank line becomes reconciled and the ledger is updated or linked.

**Example:** Bank line "JOHN SMITH GIVING GBP 100" -> Donation/Giving -> Donor John Smith -> General Fund -> Giving Income.

**Common mistakes:**

- Choosing general income when the payment is actually a donation.
- Posting to the wrong fund.
- Excluding real income or expenses.
- Creating a supplier bill and a manual expense for the same bank payment.

**Related pages:** Bank Accounts, Donations, Lettings, Suppliers, Bills, Payroll, Journals.

### Reconciliation Statement, History, And Clearing

**What these pages are:** Supporting reconciliation pages for statement certificates, reconciliation history, and clearing views.

**Purpose:** Provide evidence that bank accounts agree with the ledger and help clear outstanding items.

**Who should use them:** Treasurer, finance admin, auditor, or trustee reviewer.

**When to use them:** At month-end, year-end, or audit review.

**Common mistakes:** Using these pages before bank lines are fully reconciled.

**Related pages:** Bank Accounts, Month End, Reports -> Bank Reconciliation Summary.

### Transactions

**What this page is:** Manual transaction area for records that may later be matched to bank activity.

**Purpose:** Record real-world income, expense, transfer, or adjustment before the bank statement arrives.

**Who should use it:** Treasurer, finance admin, and authorised staff.

**When to use it:** When a transaction is known before it appears on the bank statement, or when a receipt needs attaching.

**What users can do:**

- Create a transaction.
- Attach receipts or evidence.
- Split across funds and accounts.
- Mark that the transaction requires a bank match.
- Review transaction status.

**Example:** Record a youth leader expense before the bank statement arrives.

**Common mistakes:** Using a manual transaction when a bank line is already available and should be reconciled directly.

**Related pages:** Reconciliation, Accounts, Funds, Workflows.

### Cash Management

**What this page is:** Cash module for physical money.

**Purpose:** Track cash collections, cash spends, deposits, and a cash ledger.

**Who should use it:** Treasurer, cash counters, finance volunteers, authorised staff.

**When to use it:** Whenever physical cash is collected, spent, counted, or deposited.

**What users can do:**

- Record cash collections.
- Verify counts with two people.
- Record petty cash spends.
- Create bank deposits.
- View cash ledger.
- Review portal cash collection submissions.

**Example:** Sunday offering cash is counted by two people, recorded in Cash, and later matched to the bank deposit.

**Common mistakes:**

- Recording the bank deposit but not recording the original cash collection.
- Forgetting the income account or fund.
- Using cash spends for card or bank transactions.

**Related pages:** Reconciliation, Funds, Income Register, Expense Register.

## Income

### Income Register

**What this page is:** Monthly income register with rows grouped by register category.

**Purpose:** Helps users review income by visible reporting rows such as Giving, Gift Aid, Lettings, Grants, Cafe, Events, and Other Income.

**Who should use it:** Treasurer, finance admin, trustees.

**When to use it:** Weekly or monthly, especially before reporting.

**What users can do:**

- Review income by month and register category.
- Drill into a month/category cell.
- Review uncategorised income.
- Map transactions to register categories.
- Export the register.

**Example:** Click March Giving to see all March giving transactions.

**Common mistakes:** Confusing register categories with Chart of Accounts accounts. Register categories control the visible row; accounts control accounting.

**Related pages:** Donations, Lettings, Gift Aid, Reports -> Income & Expense Summary.

### Donations

**What this page is:** Donation and giving management area.

**Purpose:** Track donations, donors, recurring giving, giving history, donor statements, and giving register views.

**Who should use it:** Treasurer, Gift Aid secretary, finance admin.

**When to use it:** When recording or reviewing giving and donor history.

**What users can do:**

- View recent donations.
- Create a donation.
- Open donation detail.
- View the Giving Register.
- Review unmatched donations.
- View recurring donations.
- Link donations to donors.

**Example:** Create donor Jane Smith, then donations matched from the bank appear in her giving history.

**Common mistakes:** Creating duplicate donors or posting donation income as generic income.

**Related pages:** Gift Aid, Reconciliation, Giving Imports, Reports -> Gift Aid Summary.

### Donors

**What this page is:** Donor management under Gift Aid.

**Purpose:** Store donor profiles, declaration status, giving history, aliases, and statement data.

**Who should use it:** Gift Aid secretary, treasurer.

**When to use it:** When managing declarations, matching donor names, or producing donor statements.

**Example:** Add "J Smith" as an alias for donor Jane Smith if bank references use that name.

**Common mistakes:** Claiming Gift Aid before a valid declaration is held.

**Related pages:** Donations, Gift Aid Declarations, Giving Register.

### Giving Register

**What this page is:** Donor-focused giving table.

**Purpose:** Shows giving by donor and month.

**Who should use it:** Treasurer and Gift Aid secretary.

**When to use it:** To review donor giving patterns and prepare follow-up.

**Example:** Open a month cell to see donations included for that donor.

**Common mistakes:** Treating anonymous or unmatched giving as fully donor-attributed.

**Related pages:** Donations, Donors, Gift Aid.

### Lettings

**What this page is:** Lettings income workspace.

**Purpose:** Track hirers, bookings, charges, payments, unpaid letting income, and reconciliation with bank payments.

**Who should use it:** Lettings administrator, treasurer, finance admin.

**When to use it:** When creating hall hire charges, reviewing expected income, or matching payments.

**What users can do:**

- Create hirers.
- Create charges.
- Track expected, paid, and outstanding amounts.
- Reconcile bank payments to charges.
- Use income account and income stream settings.

**Example:** Create a Monkey Music hall hire charge, then match the payment during reconciliation.

**Common mistakes:** Confusing a Lettings income account with a Lettings income stream or register category.

**Related pages:** Reconciliation, Income Register, Receivable Invoices, Reports -> Lettings.

### Gift Aid

**What this page is:** Gift Aid hub and claim workflow.

**Purpose:** Manage declarations, donor eligibility, review queues, claim batches, schedules, history, and claim payment reconciliation.

**Who should use it:** Gift Aid secretary, treasurer.

**When to use it:** After donations are recorded and before submitting claims to HMRC.

**What users can do:**

- Review Gift Aid status.
- Manage declarations.
- Send declaration links.
- Build claim batches.
- Review claim history.
- Export HMRC schedules.
- Reconcile claim payments.
- Produce donor statements.
- Manage small donations/GASDS-style batches where enabled.

**Example:** Donor gives GBP 100 but has no declaration. Send a declaration link before claiming.

**Common mistakes:**

- Claiming donations without a valid declaration.
- Claiming corrected or voided donations.
- Forgetting to reconcile the HMRC claim payment.

**Related pages:** Donations, Donors, Reconciliation, Reports -> Gift Aid Summary.

### Giving Platforms

**What this page is:** Online giving platform configuration.

**Purpose:** Manage giving platforms, payouts, donor matching, fees, and platform-specific setup.

**Who should use it:** Treasurer or finance admin.

**When to use it:** When importing or reconciling online giving.

**Example:** Stripe payout GBP 488 made from GBP 500 donations and GBP 12 fees.

**Common mistakes:** Recording the net payout only and losing fee or donor detail.

**Related pages:** Giving Imports, Reconciliation, Donations.

### Giving Imports

**What this page is:** Import area for donation files.

**Purpose:** Import CSV/XLSX donations from platforms, map columns, match donors, and avoid duplicates.

**Who should use it:** Treasurer, Gift Aid secretary.

**When to use it:** When donation providers export giving files.

**What users can do:**

- Upload giving files.
- Map columns.
- Match donors.
- Review import detail.
- Avoid duplicate donations.
- Import Gift Aid status where available.

**Example:** Upload a GoCardless donation file and match donors automatically.

**Common mistakes:** Importing the same provider file twice or mapping Gift Aid columns incorrectly.

**Related pages:** Donations, Gift Aid, Giving Platforms.

## Expenses

### Expense Register

**What this page is:** Monthly expense register with register category rows.

**Purpose:** Helps review spending by useful church rows such as Utilities, Cleaning, Office Supplies, Bank Charges, Payroll, and Other / Needs Review.

**Who should use it:** Treasurer, finance admin, trustees.

**When to use it:** Weekly or monthly, especially before reporting or trustee meetings.

**What users can do:**

- Review monthly spending.
- Drill into a category and month.
- Map uncategorised expenses.
- Save mappings for future similar transactions.
- Export register data.

**Example:** Service Charge should be mapped to Bank Charges.

**Common mistakes:** Thinking register category mapping changes the original account or fund. It only controls the register row unless an explicit account update is made separately.

**Related pages:** Suppliers, Bills, Reconciliation, Reports -> Income & Expense Summary.

### Suppliers

**What this page is:** Supplier management.

**Purpose:** Store supplier records, defaults, match rules, bills, payments, aliases, documents, and audit history.

**Who should use it:** Treasurer and finance admin.

**When to use it:** When setting up payees, entering bills, or reviewing supplier spend.

**What users can do:**

- Add suppliers.
- Set default accounts and funds.
- View supplier bills and payments.
- Manage bank aliases/rules.
- Review spend and audit trail.

**Example:** Valda defaults to Utilities - Gas & Electricity.

**Common mistakes:** Creating duplicate suppliers for slightly different bank references.

**Related pages:** Bills, Reconciliation, Expense Register, Reports -> Supplier Spend.

### Bills And Invoices

**What this page is:** Combined area for money the church owes and invoices owed to the church.

**Purpose:** Track payables and receivables.

Two key types:

- Bills to Pay: supplier invoices the church owes.
- Invoices Owed to Us: invoices the church creates for people to pay the church.

**Who should use it:** Treasurer, finance admin, authorised staff.

**When to use it:** When entering supplier invoices, creating customer invoices, approving bills, or checking payment status.

**What users can do:**

- Create supplier bills.
- Create receivable invoices.
- Add inline supplier/customer records.
- Add invoice lines with accounts and funds.
- Approve and post bills.
- Generate invoice PDFs.
- Track payment status.

**Example:** Klenze cleaning invoice is a Bill to Pay. Hall hire invoice to Monkey Music is an Invoice Owed to Us.

**Common mistakes:** Using a receivable invoice for a supplier bill or using a bill for money owed to the church.

**Related pages:** Suppliers, Payment Runs, Lettings, Reconciliation.

### Payment Runs

**What this page is:** Batch payment workflow for approved bills.

**Purpose:** Group bills together for payment scheduling, approval, and later bank matching.

**Who should use it:** Treasurer or finance admin.

**When to use it:** When paying multiple approved supplier bills.

**What users can do:**

- Create payment runs.
- Add approved bills.
- Review totals.
- Mark payment progress.
- Match payments to bank transactions.

**Example:** Create March payment run for Castle Water, Zoom, and Viking.

**Common mistakes:** Paying a bill outside a payment run and then also including it in a run.

**Related pages:** Bills, Suppliers, Reconciliation.

### Staff / Employees

**What this page is:** Staff, volunteer, trustee, and user-related records.

**Purpose:** Manage employee details, user invitations, portal access, monitoring, and permissions.

**Who should use it:** Admins, treasurers, authorised managers.

**When to use it:** When inviting users, assigning access, or managing staff records.

**What users can do:**

- View employees/staff.
- Open employee detail.
- Manage portal permissions.
- Assign budgets, funds, categories, or cards.
- Remove user access safely.

**Example:** Youth leader can submit expenses but cannot view full reports.

**Common mistakes:** Giving full finance access to users who only need to submit expenses.

**Related pages:** Settings, Portal, Workflows, Payroll.

### Payroll

**What this page is:** Payroll run management.

**Purpose:** Track salary, pension, employer costs, payroll journals, and payroll-related reconciliation.

**Who should use it:** Treasurer, payroll admin.

**When to use it:** Each payroll period.

**What users can do:**

- Create payroll runs.
- Record salary and employer costs.
- Post payroll journals.
- Review payroll run detail.
- Reconcile payroll payments.
- Use payroll reports.

**Example:** March payroll posts salary and pension costs, then the bank payments are reconciled.

**Common mistakes:** Recording payroll only as a bank payment without payroll cost and liability breakdown.

**Related pages:** Reconciliation, Journals, Reports -> Payroll reports, Staff.

## Accounting

### Funds

**What this page is:** Fund control centre.

**Purpose:** Manage restricted, unrestricted, and designated funds, and review fund balances and movements.

**Who should use it:** Treasurer, trustees, finance admin.

**When to use it:** During setup, monthly review, trustee reporting, and restricted fund monitoring.

**What users can do:**

- Create funds.
- Edit funds.
- View fund detail.
- Review fund balances.
- See fund transaction history.
- Identify overspending or restricted fund issues.
- View fund movement reports.

**Example:** Building Fund donation must only be spent on building-related costs.

**Common mistakes:** Treating a fund as an account. A fund is a pot/purpose; an account is a financial classification.

**Related pages:** Income Register, Expense Register, Reports -> Fund Movements, Budgets.

### Accounts / Chart Of Accounts

**What this page is:** Chart of Accounts management.

**Purpose:** Manage classifications used by journals, transactions, reports, reconciliation, donations, bills, and payroll.

**Who should use it:** Treasurer and finance admin.

**When to use it:** During setup and when a new income, expense, asset, liability, or fund balance account is needed.

**What users can do:**

- Add accounts.
- Import starter templates.
- View account activity.
- Edit accounts.
- Archive accounts.
- Review transaction counts and account-aware balances.

**Important:** Income may be stored internally as a credit balance but displayed positively as income received. This keeps accounting correct while avoiding confusing negative income displays.

**Example:** Giving Income is an income account. General Fund is a fund. They are not the same.

**Common mistakes:**

- Creating too many similar accounts.
- Using funds where accounts should be used.
- Deleting accounts that already have activity. Archive instead.

**Related pages:** Funds, Journals, Reconciliation, Reports.

### Account Detail

**What this page is:** Activity and setup for one account.

**Purpose:** Review posted lines, fund breakdown, audit history, and account settings.

**Who should use it:** Treasurer, finance admin, auditor.

**When to use it:** When investigating an account balance or editing account setup.

**What users can do:**

- View transaction summary.
- View raw journal lines.
- View debit, credit, and net movement.
- Review fund breakdown.
- Edit account details if permitted.

**Common mistakes:** Treating technical net values as user-facing income/expense totals. For reports, use Income Statement or registers.

**Related pages:** Journals, Reports, Accounts overview.

### Journals

**What this page is:** Double-entry accounting journal area.

**Purpose:** Create and review accounting entries that directly affect the ledger.

**Who should use it:** Treasurer, accountant, finance admin.

**When to use it:** For adjustments, corrections, accruals, transfers, reversals, and advanced accounting.

**What users can do:**

- View journals.
- Create draft journals.
- Post journals.
- View journal detail.
- Reverse or amend posted journals through correction workflows.
- Review source type and audit trail.

**Example:** Donation GBP 800 creates Dr Bank GBP 800 and Cr Giving Income GBP 800.

**Common mistakes:**

- Deleting posted journals instead of using reversal/correction.
- Posting unbalanced journals.
- Using journals for routine workflows that should be handled by Reconciliation, Bills, Donations, Payroll, or Lettings.

**Related pages:** Accounts, Reconciliation, Reports -> Trial Balance.

## Planning

### Budgets

**What this page is:** Budget planning area.

**Purpose:** Plan annual and monthly income and spending by account and fund.

**Who should use it:** Treasurer, trustees, budget holders.

**When to use it:** Before or during the financial year, and monthly for budget review.

**What users can do:**

- Create budgets.
- Edit annual and monthly planning grids.
- Budget income and expenses.
- Link budgets to funds and accounts.
- Compare budget vs actual.
- Approve budgets.

**Example:** Youth Fund annual budget GBP 2,000, spent GBP 850, remaining GBP 1,150.

**Common mistakes:** Budgeting against the wrong fund or account.

**Related pages:** Funds, Accounts, Reports -> Budget vs Actual, Portal Budgets.

### Month End

**What this page is:** Monthly close checklist.

**Purpose:** Ensure bank, donation, invoice, payroll, Gift Aid, journal, and fund checks are complete before reports are trusted.

**Who should use it:** Treasurer and finance admin.

**When to use it:** At the end of each month.

**What users can do:**

- Review month-end tasks.
- Check reconciliation completion.
- Check draft journals.
- Check Gift Aid items.
- Check invoices, bills, payroll, and restricted funds.
- Prepare reports.
- Support period locking where enabled.

**Example:** Complete April month-end after all bank accounts are reconciled.

**Common mistakes:** Running trustee reports before month-end checks are complete.

**Related pages:** Reconciliation, Reports, Journals, Gift Aid.

### Year End Close

**What this page is:** Guided year-end workflow.

**Purpose:** Prepare the ledger and reports for the end of the financial year.

**Who should use it:** Treasurer, accountant, admin.

**When to use it:** After the final month is reconciled and reviewed.

**What users can do:**

- Start or open a year-end run.
- Review outstanding checks.
- Prepare closing workflows.
- Support annual accounts and charity reporting.

**Common mistakes:** Starting year-end close before all bank accounts and restricted funds are reviewed.

**Related pages:** Month End, Reports -> Annual, Charity Accounts Assistant.

## Reports

### Reports Hub

**What this page is:** Command centre for all reports.

**Purpose:** Helps users choose the right report for the task.

**Who should use it:** Treasurer, trustees, staff with access, auditors.

**When to use it:** When preparing finance updates, trustee papers, compliance packs, or investigation reports.

### Monthly Dashboard Report

Shows monthly income, expenditure, cash, fund, and budget signals. Use for monthly finance review.

### Income Statement

Shows revenue and expenses by account, monthly and year-to-date. Use for treasurer review and management accounts.

### Income & Expense Summary

Shows Income Register and Expense Register totals together. Use for a simple monthly overview.

### Balance Sheet

Shows assets, liabilities, and net assets as of a date. Use for formal financial position reporting.

### SOFA

Statement of Financial Activities split by fund type. Use for charity reporting and trustees.

### Cash Flow

Shows how cash moved through operating, investing, or financing activity. Use for cash planning.

### Trial Balance

Shows all accounts with debit and credit totals. Use for technical accounting checks. This report intentionally keeps debit/credit presentation.

### Budget vs Actual

Compares actual activity with budget. Use for budget holders and trustee oversight.

### Fund Movement

Shows opening balance, income, expenditure, movements, and closing balance by fund. Use for restricted fund accountability.

### Bank Reconciliation Summary

Shows bank reconciliation status and differences. Use for month-end and audit evidence.

### Gift Aid Summary

Shows Gift Aid claim and eligibility information. Use before claim submission and review meetings.

### Lettings Income

Shows letting activity and income. Use for hall hire and room booking review.

### Forecast

Shows expected future position. Use for planning and leadership decisions.

### Cash Position

Shows current bank/cash position. Use for short-term cash awareness.

### Supplier Spend

Shows spend by supplier. Use for contract review and cost control.

### Trustee Snapshot

Plain-English finance snapshot for trustees. Best for board meetings because it explains numbers in accessible language.

### Leadership Snapshot

High-level summary for church leadership. Use when leaders need concise finance context.

### Quarterly Report

Quarterly income, expenditure, fund, and dashboard pack. Use for quarterly trustee or leadership reviews.

### Annual Report

Annual reporting entry point. Use for year-end reporting and annual narrative.

### AGM Pack

AGM-oriented report pack. Use for member meetings and formal presentation.

### Export Pack

Produces downloadable report/document bundles. Use when sharing evidence or packs externally.

### Charity Accounts Assistant

Guided workflow for annual accounts, trustee report, examiner evidence, and Charity Commission style preparation.

## Admin

### Workflows

**What this page is:** Approval and task hub.

**Purpose:** Manage finance work submitted by users and workflows requiring review.

**Who should use it:** Admins, treasurers, finance approvers.

**When to use it:** Daily or weekly to review outstanding approvals.

**What users can do:**

- Review expense approvals.
- Review invoice workflows.
- Review portal-submitted expenses.
- Manage messages/conversations.
- Track workflow tasks.

**Example:** Staff submits expense -> admin reviews in Workflows -> approved -> paid.

**Common mistakes:** Paying a claim before approval or before required evidence is attached.

**Related pages:** Portal, Transactions, Bills, Cash.

### Settings

**What this page is:** Organisation and system configuration.

**Purpose:** Manage organisation details, charity data, accounting periods, users, access, audit, diagnostics, and data management.

**Who should use it:** Admins, treasurers, finance users with permission.

**When to use it:** During setup, user onboarding, year setup, and data maintenance.

**What users can do:**

- Update organisation details.
- Manage members and invites.
- Configure accounting periods.
- Review audit log.
- Manage erasure requests.
- Use diagnostics.
- Use data management tools such as workspace reset or export where enabled.

**Example:** Use Settings -> Users & Access to invite a new treasurer.

**Common mistakes:** Giving users broader access than needed.

**Related pages:** Staff, Portal, Audit Log, Data Management.

### Data Management, Reset, And Deletion

**What these pages are:** Administrative data tools.

**Purpose:** Support safe exports, resets, diagnostics, erasure requests, and account deletion lifecycle.

**Who should use them:** Admins only, usually with trustee or support approval.

**When to use them:** During testing, offboarding, GDPR handling, or workspace cleanup.

**Common mistakes:** Resetting real workspace data when only a narrow correction was needed.

**Related pages:** Settings, Audit Log, User Account Deletion docs.

## Portal

### Portal Dashboard

Limited user landing page for invited users. Shows the tasks and pages available to that user.

### Portal Budgets

Allows assigned users to view their budget scope.

### Portal Invoices

Allows users to submit or manage invoice workflows according to permission.

### Portal Cash Collections

Allows cash collection submissions from authorised users.

### Portal Expenses

Allows staff or volunteers to submit expenses without full finance access.

### Portal Calendar

Shows events relevant to the user.

### Portal Funds

Shows assigned fund information where permitted.

### Portal Income Register / Expense Register

Limited register views based on assigned permissions, funds, budgets, or categories.

## 5. Common Workflows

### Uploading And Reconciling A Bank Statement

1. Go to Banking -> Bank Accounts.
2. Open the relevant bank account.
3. Choose Import or Upload Statement.
4. Upload the statement file.
5. Review preview and confirm import.
6. Go to Reconciliation.
7. Select each bank line.
8. Choose donation, income, expense, transfer, letting, payroll, Gift Aid payment, or exclude.
9. Save each reconciliation.
10. Review the Bank Reconciliation Summary.

Common mistakes: uploading the wrong account statement, importing duplicates, excluding real transactions.

### Recording A Cash Collection

1. Go to Cash -> Collections.
2. Start a new collection.
3. Enter date, event, counters, amount, fund, and income account.
4. Complete two-person verification.
5. Record the bank deposit when cash is deposited.
6. Match the deposit during bank reconciliation.

Common mistakes: recording the deposit but not the counted collection.

### Creating A Donor And Claiming Gift Aid

1. Go to Donations or Gift Aid -> Donors.
2. Create or confirm the donor.
3. Add declaration details or send a declaration link.
4. Reconcile or record donations for that donor.
5. Go to Gift Aid -> Claim Builder.
6. Review eligible donations.
7. Create claim batch.
8. Export schedule.
9. Reconcile HMRC payment when received.

Common mistakes: claiming without a valid declaration.

### Recording Supplier Bills

1. Go to Bills.
2. Create a Bill to Pay.
3. Select or create supplier.
4. Add line items with expense accounts and funds.
5. Save and approve/post according to workflow.
6. Include approved bills in Payment Runs if needed.
7. Reconcile the bank payment later.

Common mistakes: using receivable invoice instead of bill.

### Creating An Invoice Owed To The Church

1. Go to Bills / Invoices.
2. Create an Invoice Owed to Us.
3. Add customer/hirer details.
4. Add income lines, account, and fund.
5. Generate or send invoice PDF.
6. Reconcile payment when it reaches the bank.

Common mistakes: treating customer invoices as supplier bills.

### Managing Lettings Income

1. Go to Lettings.
2. Create hirer.
3. Create charge or booking-related charge.
4. Track expected, paid, and outstanding amounts.
5. During reconciliation, match bank receipt to the letting charge.
6. Review Lettings report.

Common mistakes: posting letting receipts as generic income.

### Creating And Reviewing Budgets

1. Go to Budgets.
2. Create or open a budget.
3. Add account and fund lines.
4. Enter annual or monthly planned amounts.
5. Review Budget vs Actual.
6. Approve budget when ready.

Common mistakes: budgeting to wrong fund or missing restricted fund budgets.

### Running Month-End

1. Reconcile all bank accounts.
2. Review Cash, Donations, Gift Aid, Bills, Payroll, and Journals.
3. Check Income Register and Expense Register.
4. Check restricted fund balances.
5. Open Month End.
6. Complete checklist.
7. Run trustee reports.

Common mistakes: running reports before reconciliation is complete.

### Correcting A Mistake

1. Identify whether the mistake is unreconciled, reconciled, or posted.
2. If unreconciled, edit or rematch directly.
3. If reconciled, use unreconcile/correction workflow.
4. If posted, use journal reversal/amendment rather than deletion.
5. Review audit log.

Common mistakes: deleting posted records instead of reversing them.

### Deleting Wrong Statement Imports Safely

1. Open Banking -> Bank Account.
2. Open the statement import detail.
3. Review affected lines.
4. Use the removal wizard.
5. Provide reason.
6. Unreconcile affected lines if required.
7. Confirm removal.

Common mistakes: trying to remove statements with reconciled lines without resolving them.

### Unreconciling A Transaction

1. Open the bank line or correction workflow.
2. Review downstream record: donation, manual transaction, bill payment, letting, payroll, or journal.
3. Confirm reason.
4. Unreconcile.
5. Reconcile correctly.

Common mistakes: unreconciling without understanding posted journal impact.

### Producing Trustee Reports

1. Complete month-end.
2. Open Reports.
3. Use Trustee Snapshot for plain-English review.
4. Use Income Statement, Balance Sheet, Fund Movements, and Budget vs Actual for supporting detail.
5. Export or share report pack.

Common mistakes: using technical Trial Balance for trustee meetings without explanation.

### Preparing Annual Report / AGM Pack

1. Complete year-end checks.
2. Reconcile all bank accounts.
3. Review restricted funds.
4. Open Charity Accounts Assistant or Annual Report.
5. Generate AGM Pack.
6. Review trustee narrative and figures.
7. Export final pack.

Common mistakes: preparing annual reports before corrections and reconciliations are complete.

## 6. Common Mistakes And How To Fix Them

### Bank Account Not Linked To Chart Of Accounts

**Meaning:** Bank account exists but does not have a linked asset account.

**Why it happens:** Setup was incomplete.

**Fix:** Go to Banking or Accounts and link the bank account to the correct asset account.

### Transaction Is Uncategorized

**Meaning:** The transaction exists, but the register does not know which visible row to place it under.

**Why it happens:** No register category mapping exists.

**Fix:** Go to Income Register or Expense Register -> Review Uncategorized -> choose register category -> Save mapping.

### Income Account Shows Negative Internally

**Meaning:** Income is stored as a credit balance in the ledger.

**Why it happens:** Double-entry accounting stores credits differently from plain-language income.

**Fix:** Use the Accounts overview display for user-friendly income received. Use Trial Balance for technical debit/credit.

### Wrong Bank Statement Uploaded

**Meaning:** Imported lines belong to the wrong period, account, or file.

**Fix:** Open Bank Account -> statement import detail -> removal wizard. If lines are reconciled, unreconcile first through the guided workflow.

### Donation Matched To Wrong Donor

**Fix:** Use correction/unreconcile workflow, then reconcile to the right donor. Review Gift Aid impact.

### Supplier Missing

**Fix:** Create supplier from Suppliers or quick-create during Reconciliation/Bills.

### Income Account Missing

**Fix:** Go to Accounts -> Add Account -> income account. Then use it in Reconciliation, Lettings, Donations, or invoices.

### Fund Missing

**Fix:** Go to Funds -> New Fund. Choose unrestricted, restricted, or designated.

### Gift Aid Declaration Missing

**Fix:** Go to Gift Aid -> Declarations or donor profile. Add declaration or send declaration link.

### Duplicate Donor

**Fix:** Review donor aliases and duplicate records. Merge or correct according to available donor tools.

### Reconciled Transaction Needs Correcting

**Fix:** Use unreconcile/correction workflow. Do not delete posted journals directly.

### Budget Item Error

**Fix:** Open Budgets, edit the budget grid or monthly planning, and check fund/account assignment.

### Cash Collection Missing Income Account

**Fix:** Edit or correct the collection if possible, otherwise use a correcting journal and ensure future collection templates use the right account.

## 7. Permissions And Roles

### Owner / Admin

Usually has full access to settings, users, finance configuration, data management, and reports.

### Treasurer

Usually manages banking, reconciliation, funds, accounts, journals, Gift Aid, reports, month-end, and finance workflows.

### Finance User

May help with day-to-day finance tasks such as reconciliation, bills, cash, and registers depending on permissions.

### Staff / User

May submit expenses, invoices, cash collections, or view assigned budgets/funds.

### Limited Portal User

Uses the portal to submit or view only assigned information.

### Viewer / Read-Only

Can view permitted reports or pages without making changes.

Best practice: give each user the minimum access needed for their role.

## 8. Glossary

**Account:** Chart of Accounts classification, such as Giving Income or Utilities.

**Fund:** Pot or purpose of money, such as General Fund or Building Fund.

**Restricted Fund:** Money that must be used for a specific donor or grant purpose.

**Unrestricted Fund:** Money available for general purposes.

**Designated Fund:** Unrestricted money set aside by trustees for a purpose.

**Transaction:** Real-world financial event.

**Journal:** Double-entry accounting record behind the scenes.

**Debit:** Accounting entry that increases assets and expenses.

**Credit:** Accounting entry that increases income, liabilities, and fund balances.

**Reconciliation:** Matching bank activity to accounting records.

**Bank Import:** Uploaded bank statement file and imported lines.

**Gift Aid Declaration:** Donor permission/statement needed before claiming Gift Aid.

**Claim Batch:** Group of donations included in a Gift Aid claim.

**Supplier:** Organisation or person the church pays.

**Donor:** Person or organisation giving money to the church.

**Invoice:** Request for payment. In Church Ledger this may include supplier bills and receivable invoices.

**Bill:** Supplier invoice the church owes.

**Receivable:** Money owed to the church.

**Payable:** Money the church owes.

**Month-End:** Monthly checklist to confirm records are complete.

**SOFA:** Statement of Financial Activities, a charity reporting statement.

**Trial Balance:** Technical report showing debit and credit totals by account.

**Balance Sheet:** Statement of assets, liabilities, and net assets.

**Cash Flow:** Report showing movement of cash.

**Audit Trail:** Record of who did what and when.

## 9. Training Notes

Use plain language when training users:

- Say "fund" for the pot or purpose of money.
- Say "account" for the accounting classification.
- Say "register category" for the row in the Income or Expense Register.
- Say "reconcile" for matching bank lines to records.
- Say "journal" only when discussing double-entry accounting or corrections.

For non-accountants, start with workflows:

1. Money comes in or goes out.
2. The bank statement shows it.
3. Reconciliation explains it.
4. Funds show purpose.
5. Accounts classify it.
6. Reports summarise it.

