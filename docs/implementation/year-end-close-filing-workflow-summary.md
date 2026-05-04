# Year-End Close And Filing Workflow Summary

## Workflow Lifecycle

The year-end close workflow lives under `/year-end-close`. A treasurer creates a run for a financial year, which seeds the full 23-step checklist. The run then moves through validation, annual accounts generation, trustee review, final approval, financial year lock, filing pack export, and submitted state.

## Database Tables And RLS

Migration `20260430223000_year_end_close_filing_workflow.sql` adds:

- `year_end_close_runs`
- `year_end_close_steps`
- `filing_packs`
- `report_approvals`
- `locked_period_overrides`

All tables are workspace scoped. Admins and treasurers can manage close records; members can read approved, locked, exported, or submitted workflow data where appropriate.

## Step Catalog

`src/lib/year-end-close/steps.ts` defines the required 23 steps from financial year date confirmation through submitted filing state. Each step includes dependencies, validation source, recommended action, and waiver rules.

## Validation And Blocking Rules

`src/lib/year-end-close/validation.ts` checks date validity, bank reconciliation difference, draft/unposted records, annual accounts blockers, trial balance balance, trustee review, and final approval. Blockers include source, counts, links, recommended action, and waiver metadata.

## Period Locking And Overrides

The workflow reuses `financial_periods` and calls `lockPeriod()` for the final lock. `assertDateNotInLockedPeriod()` centralises app-level locked-period messaging, and the migration adds `assert_not_locked_financial_date()` for database hardening. Locked-year corrections should be posted as reversals or adjustments in a later open period. Admin overrides require a reason and are persisted in `locked_period_overrides`.

## Filing Pack Contents

`src/lib/year-end-close/filing-pack.ts` composes a filing pack from annual accounts, trustee report narrative, SOFA, balance sheet, notes, trial balance, fund movements, bank reconciliation summary, Gift Aid summary, payroll summary, audit log reference, evidence index, and examiner checklist.

## Annual Return Assistant

`src/lib/year-end-close/annual-return.ts` produces a structured review summary for Charity Commission annual return preparation. It suggests values for income, expenditure, trustees, staff/payroll, Gift Aid, grants/fundraising, public benefit, activities, reserves, and risks. It does not submit directly.

## Exports

The export foundation stores generated metadata in `filing_packs.pack_payload`, `evidence_index`, and `export_manifest`. The user still files manually with the Charity Commission.

## Tests

`tests/yearEndCloseFilingWorkflow.test.ts` covers the audit, migration, 23-step catalog, validation concepts, period lock hardening, filing pack contents, Annual Return Assistant, final export approval requirement, submitted state, routes, and navigation.

## Remaining Limitations

- The Charity Commission submission itself remains outside the product.
- The filing pack currently stores structured export metadata rather than rendering and storing binary documents.
- Some validation sources rely on existing table availability and report loaders.
