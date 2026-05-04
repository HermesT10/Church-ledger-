# Charity Accounts And Annual Return Assistant Summary

## What Was Added

- Added a dedicated Charity Accounts Assistant route at `Reports -> Charity Accounts Assistant`.
- Added assistant logic in `src/lib/charity-accounts-assistant/logic.ts` for:
  - guided checklist sections
  - readiness score calculation
  - blocking validation
  - supporting schedules
  - Annual Return data pack
  - final pack export descriptors
- Added server actions in `src/lib/charity-accounts-assistant/actions.ts` for:
  - loading an assistant snapshot from the annual accounts engine
  - overlaying saved annual accounts draft narrative
  - saving trustee report narrative back into `annual_accounts_drafts`
  - audit logging trustee narrative saves
- Linked the assistant from the Reports landing page.

## Assistant Sections

The assistant guides treasurers through:

- Charity details
- Financial records completeness
- Supporting schedules
- Accounts production
- Trustee report
- Independent examination/audit
- Annual Return data pack
- Final pack

## Validation And Readiness

The readiness score is generated from checklist items covering:

- charity details and trustees
- bank reconciliation completion
- income and expense completeness
- Gift Aid review
- payroll review
- evidence index preparation
- trial balance balance
- balance sheet balance
- restricted funds review
- trustee report narrative
- Annual Return data pack generation
- annual accounts approval

Final approval is blocked when:

- trial balance does not balance
- balance sheet does not balance
- unreconciled accounts or bank differences remain
- restricted funds are negative
- annual accounts are not approved or have blocking validation failures

## Annual Return Data Pack

The data pack summarises:

- gross income
- gross expenditure
- trustees
- staff/payroll indicator
- activities
- grants review prompt
- public benefit narrative
- reserves policy
- risk notes
- key financial figures

The assistant does not submit directly to the Charity Commission. It prepares reviewed data for manual filing.

## Final Pack

The final pack manifest includes:

- annual accounts
- trustee report
- independent examiner pack
- Annual Return data pack
- AGM pack
- supporting schedules workbook
- evidence index

## Tests

Added `tests/charityAccountsAssistant.test.ts` covering:

- audit and route wiring
- readiness score and blocker generation
- missing evidence/receipt warning
- Annual Return data pack generation
- trustee narrative save wiring
- final pack export descriptors
- full assistant snapshot generation
