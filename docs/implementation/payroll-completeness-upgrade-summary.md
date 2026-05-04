# Payroll Completeness Upgrade Summary

## Employee Model

Employee records now have schema support for department/ministry, start and end dates, payroll status, default fund/account allocation, pension participation, and payroll reference. These fields let treasurers allocate staff costs consistently and exclude ended or non-payroll staff from payroll workflows.

## Payroll Run Lifecycle

Payroll runs now support a fuller control lifecycle:

- `draft`
- `reviewed`
- `approved`
- `posted`
- `paid`
- `reconciled`
- `reversed`
- `archived`

Review is required before approval, approval is required before posting, paid/reconciled states are tracked separately, and posted runs are corrected through reversal rather than direct historical edits.

## Imports

Payroll import foundations include `payroll_import_batches` and `payroll_import_rows`. Server actions support preview, validation, duplicate employee detection, raw row storage, and committing valid rows into a draft payroll run. The import mapping covers employee, gross, net, PAYE, employee NIC, employer NIC, employee pension, employer pension, other deductions, fund/account allocation, ministry, and notes.

## Journal Posting Logic

The TypeScript journal preview and SQL posting function now use the same accounting model:

- Debit salaries expense for gross pay.
- Debit employer NIC expense.
- Debit employer pension expense.
- Credit PAYE/NIC liability for PAYE, employee NIC, and employer NIC.
- Credit pension payable for employee and employer pension.
- Credit net wages liability.

Employer NIC and employer pension are split by fund where payroll splits exist. Liability credits remain unsplit. Locked-period checks remain in the posting function.

## Employer Costs

Payroll runs and reports now distinguish gross pay, employer NIC, employer pension, and total employer cost. Payroll by fund/ministry reporting groups gross pay and employer costs using payroll line allocations.

## Pension Reporting

Pension reporting now separates employee pension, employer pension, pension payable, and payment status through payroll liability payments.

## PAYE/NIC Liabilities

PAYE/NIC reporting now treats HMRC liability as PAYE plus employee NIC plus employer NIC. Liability rows are created on posting and can be marked paid or reconciled.

## Bank Reconciliation

Payroll-aware reconciliation support suggests matches between outstanding payroll liabilities and unreconciled bank lines using amount, date proximity, and payment reference. Net wages, HMRC PAYE/NIC, and pension provider payments are modelled as separate liability settlement types.

## Reports And Annual Accounts

The professional reporting registry now includes payroll summary, employer costs, payroll by fund/ministry, pension contributions, PAYE/NIC liability, and payroll vs budget reports. Annual accounts and year-end filing packs now include year-scoped payroll amounts rather than only a global payroll run count.

## Controls And Audit Log

Lifecycle actions log audit events for review, paid, reconciled, reverse, import creation, and import commit. The migration adds RLS for import, liability, reversal, and settings tables, plus draft-only mutation policies for payroll lines.

## Tests

Added `tests/payrollCompletenessUpgrade.test.ts` and extended payroll validation tests for employee deduction-aware gross pay and balanced payroll journals.

## Remaining Limitations

This upgrade does not add HMRC RTI filing. The module stores payroll accounting records, imports, journals, liabilities, reconciliation support, and reports, but statutory payroll submission remains outside this phase.
