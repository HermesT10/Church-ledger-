# Charity Accounts And Annual Return Assistant Audit

## Current Annual Accounts Workflow

- `src/lib/annual-accounts/data.ts` builds the annual accounts pack from organisation details, trustees, SOFA, balance sheet, cash flow, fund movements, trial balance, Gift Aid, bank reconciliation, payroll counts, and payroll amounts.
- `src/lib/annual-accounts/validation.ts` validates year-end close, bank reconciliation, trial balance, SOFA generation, balance sheet agreement, fund movement agreement, restricted fund purpose notes, Gift Aid notes, payroll notes, comparatives, and trustee approval.
- `src/lib/annual-accounts/notes.ts` builds notes, including payroll and staff costs when payroll activity exists.
- `src/lib/annual-accounts/exports.ts` exposes PDF, DOCX, Excel, and evidence-index export descriptors.
- `annual_accounts_drafts` persists charity details, trustee/officer lists, narrative sections, notes, validation, and approval state.

## Current Year-End And Filing Workflow

- `src/lib/year-end-close/steps.ts` defines a guided year-end close workflow.
- `src/lib/year-end-close/validation.ts` checks bank reconciliation, unposted drafts, annual accounts blockers, trial balance balance, trustee review, and final approval.
- `src/lib/year-end-close/annual-return.ts` already creates a structured Annual Return Assistant summary from an `AnnualAccountsPack`.
- `src/lib/year-end-close/filing-pack.ts` composes annual accounts, annual return data, schedules, documents, and examiner checklist into a filing pack.
- `src/app/(app)/year-end-close/*` provides a guided year-end close route, but it is close-run centric rather than a standalone Charity Accounts Assistant.

## Current Reporting And Export Workflow

- `src/lib/reports/engine/*` provides report definitions, snapshots, validation, versioning, approvals, and exports.
- `src/lib/document-production/*` provides reusable document models, templates, renderers, storage, versioning, and secure download routes.
- Reports landing page is `src/app/(app)/reports/page.tsx` and already links to Annual Report, AGM Pack, Year-End Close, and Export Pack.

## Current Data Sources Relevant To The Assistant

- Charity details: `organisations`, `memberships`, `profiles`, annual accounts charity details.
- Financial completeness: `bank_accounts`, `bank_lines`, `bank_statement_imports`, `journals`, `bills`, `donations`, `gift_aid_claim_batches`, `payroll_runs`, annual accounts evidence index.
- Supporting schedules: SOFA, balance sheet, trial balance, fund movements, Gift Aid summary, payroll summary, bank reconciliation summary.
- Trustee report: annual accounts narrative sections.
- Examiner pack: annual accounts evidence index, year-end filing pack, audit log references, and document exports.
- Annual Return data: existing `buildAnnualReturnAssistantSummary`.

## Gaps

- No single standalone assistant that walks treasurers from charity details through final pack export.
- Annual Return data exists, but it is nested inside year-end close rather than exposed as a dedicated guided workflow.
- Readiness score is not presented as a clear checklist across records, reconciliations, documents, reports, restricted funds, and approvals.
- Trustee report narrative can be saved through annual accounts drafts, but there is no dedicated assistant step for it.
- Missing final pack manifest that groups annual accounts, trustee report, examiner pack, Annual Return data pack, and AGM pack in one place.

## Implementation Approach

Create a thin assistant layer that reuses existing annual accounts, year-end close, reporting, and document-production systems:

1. Add pure assistant types and readiness/checklist logic.
2. Add server actions to load the assistant snapshot and save trustee report narrative to annual accounts drafts.
3. Add a Reports page route: `src/app/(app)/reports/charity-accounts-assistant/page.tsx`.
4. Link the route from Reports as "Charity Accounts Assistant".
5. Add tests for readiness scoring, checklist warnings, Annual Return data pack generation, narrative saving wiring, final pack export descriptors, and UI/documentation coverage.
