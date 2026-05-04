# Blank Canvas Onboarding Summary

## What Changed

New organisations now start as a blank accounting workspace. Workspace creation only creates the organisation, admin membership, profile active organisation, onboarding progress, and setup progress rows.

The onboarding wizard no longer offers generic default fund or chart-of-account seeding. It now supports three setup modes:

- Blank setup
- Guided setup
- Import-first setup

## Setup Modes

Blank setup keeps funds, accounts, categories, suppliers, and registers empty until the treasurer creates them.

Guided setup asks whether the church has restricted funds, lettings, payroll, and Gift Aid. It creates a minimal relevant structure only:

- General Fund
- Optional restricted holding fund
- Small account set for giving, bank, running costs, and selected features
- Small register category set for selected features

Import-first setup encourages the user to add a bank account and upload a statement. Bank data then drives suggested categories and remembered mappings.

## Bank-Driven Category Creation

Bank statement import now updates setup progress and creates `categorisation_suggestions` rows for imported unmatched bank lines.

Suggestions use:

- Display description
- Reference
- Direction
- Existing remembered mappings from `bank_transaction_mappings`

Users can save remembered transaction mappings through `rememberBankTransactionMapping`, which stores workspace-specific match patterns and account/category/supplier links.

## Safe Deletion And Archiving

Archive metadata is standardised for:

- Bank accounts
- Funds
- Accounts
- Suppliers
- Register categories

Items with linked accounting activity remain blocked from hard delete and should be archived instead. Archived items are hidden from active selectors while historical reports keep their existing references.

## Transaction Lifecycle

Journal deletion is now draft-only. Posted or approved journals must be reversed. Journals in locked periods cannot be deleted.

The existing reversal workflow remains the controlled path for correcting posted journals.

## Empty Dashboard

When setup mode is active, the dashboard shows a setup experience instead of the full reporting dashboard.

The setup dashboard tracks:

- Add bank account
- Upload bank statement
- Categorise transactions
- Create funds
- Review reports

Treasurers can continue setup or explicitly skip setup to open the full dashboard.

## Security

New tables are scoped by `workspace_id` and have RLS enabled and forced:

- `workspace_setup_progress`
- `categorisation_suggestions`
- `bank_transaction_mappings`

Read access is limited to organisation members. Writes are limited to treasurers/admins using the existing organisation helper functions.
