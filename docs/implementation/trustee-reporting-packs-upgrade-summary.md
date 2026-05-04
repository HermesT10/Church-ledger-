# Trustee Reporting Packs Upgrade Summary

## Pack Structure

The upgrade adds a shared trustee pack layer for:

- Monthly dashboard report.
- Trustee snapshot.
- Leadership snapshot.
- Quarterly report.
- AGM pack.

Each pack now follows the same 15-section structure: cover, executive summary, KPIs, income/expenditure, budget vs actual, restricted funds, cash, bank reconciliation, Gift Aid, lettings, supplier spend, payroll, risks, actions and appendices.

## Commentary Layer

`src/lib/reports/trustee-packs/commentary.ts` adds `generateFinancialCommentary(reportData)`. Commentary is deterministic, derived from report data, includes calculation metadata, and exposes editable text/admin override fields so the generated wording can be reviewed before circulation.

## Data Sources

`src/lib/reports/trustee-packs/data.ts` composes packs from existing loaders:

- Dashboard overview.
- Trustee snapshot.
- Leadership snapshot.
- Quarterly report.
- AGM report.
- Budget vs actual.
- Bank reconciliation summary.
- Gift Aid summary.
- Supplier spend.
- Payroll dashboard summary where available.

Unavailable sections such as lettings render explicit empty states instead of disappearing.

## Glossary

`src/lib/reports/trustee-packs/glossary.ts` provides trustee-friendly definitions for restricted funds, unrestricted funds, net position, creditors, debtors, SOFA and reconciliation.

## Charts

`src/components/reports/trustee-packs/charts.tsx` adds Recharts-based visuals for income vs expenses, budget variance, restricted funds remaining, cash trend, top expense categories and supplier spend. Empty chart data renders a clear empty state.

## Approval Workflow

The implementation reuses the professional reporting lifecycle and adds missing actions for:

- Archive.
- Internal comments.
- Trustee-visible review notes.
- Comment resolution.

The new `report_review_comments` table is workspace-scoped, RLS-enabled and linked to `report_versions`.

## Exports

`src/lib/reports/trustee-packs/exports.ts` adds PDF, DOCX and Excel appendix export foundations. Exports include pack sections, commentary, definitions, approval metadata and generated metadata.

## Page Integration

The five report pages now load a shared trustee pack and pass it into their client components:

- `src/app/(app)/reports/monthly-dashboard/page.tsx`
- `src/app/(app)/reports/trustee-snapshot/page.tsx`
- `src/app/(app)/reports/leadership-snapshot/page.tsx`
- `src/app/(app)/reports/quarterly/page.tsx`
- `src/app/(app)/reports/agm/page.tsx`

Existing filters and legacy report content remain available while the new pack sections are introduced.

## Tests

`tests/trusteeReportingPacks.test.ts` covers the audit, required sections, commentary determinism, prior-period comparison, glossary, page wiring, charts, approval workflow, RLS migration, exports and empty data states.

## Remaining Limitations

- PDF/DOCX/Excel are structured export foundations rather than full binary renderers.
- Lettings income is represented as an explicit empty section until a dedicated pack-level lettings loader is wired in.
- The first integration preserves existing page bodies, so some information appears both in the new pack panel and legacy report sections.
