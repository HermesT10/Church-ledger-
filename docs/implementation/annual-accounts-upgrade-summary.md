# Annual Accounts Upgrade Summary

## Builder Workflow

The new guided route is `src/app/(app)/reports/annual/accounts-builder/page.tsx`. It loads an annual accounts pack and renders an 11-step builder:

1. Select financial year.
2. Select accounting basis.
3. Confirm charity details.
4. Review trustees and officers.
5. Review financial statements.
6. Review notes.
7. Add trustee narrative.
8. Attach examiner/audit details.
9. Validate pack.
10. Trustee approval.
11. Export final pack.

The existing Annual Report page now links to `/reports/annual/accounts-builder`.

## Data Sources

`src/lib/annual-accounts/data.ts` composes the pack from:

- Organisation charity details and address fields.
- Active bank accounts.
- Admin, treasurer and trustee memberships.
- Annual report and AGM report loaders.
- SOFA, balance sheet, cashflow, fund movement and trial balance loaders.
- Gift Aid summary.
- Payroll run count.
- Bank reconciliation summary.
- Professional reporting tables for versioned approval.

## Pack Sections

Reusable pack sections live in `src/components/annual-accounts/index.tsx`:

- Cover.
- Contents.
- Charity information.
- Trustees' Annual Report.
- Independent examiner/auditor placeholder.
- SOFA.
- Balance sheet.
- Cashflow.
- Notes.
- Approval page.
- Evidence index.
- Validation panel.
- Export actions.

## SOFA Upgrade

`src/lib/annual-accounts/sofa.ts` builds annual accounts rows with unrestricted, restricted, designated, current-year total and prior-year total columns. It includes income, expenditure, net movement, transfers placeholder, opening balances and closing balances.

## Balance Sheet Upgrade

`src/lib/annual-accounts/balance-sheet.ts` classifies rows into fixed assets, current assets, debtors, cash, current creditors, long-term creditors, net assets and funds. Validation checks net assets against total funds, trial balance agreement and bank module agreement.

## Notes Builder

`src/lib/annual-accounts/notes.ts` generates required and recommended notes for accounting policies, income, expenditure, fund movements, restricted fund purposes, debtors, creditors, payroll, trustee remuneration, related parties, fixed assets, loans/liabilities, reserves policy, prior-year comparatives and Gift Aid where relevant.

## Validation Rules

`src/lib/annual-accounts/validation.ts` validates year-end close, bank reconciliations, trial balance, SOFA, balance sheet, fund balances, restricted fund purposes, Gift Aid, payroll, prior-year comparatives and trustee approval before final export.

## Approval And Versioning

Draft state is stored in `annual_accounts_drafts`. Trustee approval creates a `report_versions` row with `report_type = 'annual'`, the full annual accounts pack in `snapshot_payload`, validation results, evidence traceability and approved status.

## Export Formats

`src/lib/annual-accounts/exports.ts` provides export foundations for:

- PDF final accounts.
- Editable DOCX.
- Excel supporting schedules.
- Evidence index.

The export metadata includes version, draft/final watermark, generated date, approval state and validation status. Final PDF export is disabled in the UI until trustee approval is present.

## Remaining Limitations

- PDF/DOCX/Excel exports currently provide structured hooks and metadata foundations; rendering can be deepened into binary document generation in a later pass.
- Charity governing document, objects, examiner details and some trustee narrative sections remain editable draft JSON until promoted into first-class organisation settings.
- Year-end close is represented as a validation source placeholder until a dedicated close process exists.
