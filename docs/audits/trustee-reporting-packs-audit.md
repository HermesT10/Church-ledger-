# Trustee Reporting Packs Audit

## Files Found

- `src/app/(app)/reports/monthly-dashboard/page.tsx`
- `src/app/(app)/reports/monthly-dashboard/monthly-dashboard-client.tsx`
- `src/app/(app)/reports/trustee-snapshot/page.tsx`
- `src/app/(app)/reports/trustee-snapshot/trustee-snapshot-client.tsx`
- `src/app/(app)/reports/leadership-snapshot/page.tsx`
- `src/app/(app)/reports/leadership-snapshot/leadership-snapshot-client.tsx`
- `src/app/(app)/reports/quarterly/page.tsx`
- `src/app/(app)/reports/quarterly/quarterly-client.tsx`
- `src/app/(app)/reports/agm/page.tsx`
- `src/app/(app)/reports/agm/agm-client.tsx`
- `src/lib/reports/actions.ts`
- `src/lib/reports/summaryReports.ts`
- `src/lib/reports/dashboard.ts`
- `src/lib/reports/insights.ts`
- `src/lib/reports/framework.ts`
- `src/lib/reports/engine/service.ts`
- `src/lib/reports/engine/exports.ts`
- `src/components/reports/report-shell.tsx`
- `src/components/reports/professional/index.tsx`
- `tests/professionalReportingEngine.test.ts`
- `tests/reportInsights.test.ts`

## Current Sections Rendered

### Monthly Dashboard

- Report metadata, KPIs, insights and definitions through `ReportShell`.
- Month-end checklist, health indicators and anomalies.
- Income breakdown.
- Expense breakdown.
- Operational actions.
- Trust indicators for Gift Aid, budget variance, supplier and payroll status.

### Trustee Snapshot

- Cash position.
- Fund balances.
- Income and expenditure MTD/YTD.
- Top variances.
- Forecast risk.
- CSV export.

### Leadership Snapshot

- Report metadata, KPIs, insights and definitions through `ReportShell`.
- Plain-English summary.
- Recommended next actions.
- Leadership metrics.
- Links to detailed report pages.
- Browser print and CSV export.

### Quarterly Report

- Quarterly summary cards.
- Quarter-by-quarter income, expenses and surplus table.
- Annual total.
- Fund balances.

### AGM Pack

- Financial summary cards.
- Restricted fund balances.
- General/designated fund balances.
- Treasurer commentary placeholder.
- Browser print/save-as-PDF.
- Professional snapshot panel on the server page.

## Gap Matrix

| Required section | Current state |
| --- | --- |
| Cover page | Not consistently present; report pages have headers only. |
| Executive summary | Present in leadership, partial in monthly, missing or placeholder elsewhere. |
| Key financial KPIs | Present in monthly/leadership, partial in trustee/quarterly/AGM. |
| Income and expenditure summary | Present in all, but not normalized as a pack section. |
| Budget vs actual | Present as dashboard widget/variance, missing in quarterly/AGM pack body. |
| Restricted funds summary | Present in trustee/quarterly/AGM, not normalized everywhere. |
| Cash position | Present in trustee and leadership KPI, missing in quarterly/AGM. |
| Bank reconciliation status | Loader exists, not embedded in these packs. |
| Gift Aid status | Present in monthly/leadership indicators, missing in trustee/quarterly/AGM. |
| Lettings income if applicable | Lettings exists elsewhere, not embedded in these packs. |
| Supplier spend highlights | Partial in monthly, missing elsewhere. |
| Payroll summary if applicable | Partial in monthly, missing elsewhere. |
| Risks and alerts | Present in leadership/monthly/trustee, not unified. |
| Recommended trustee actions | Present in leadership, missing elsewhere. |
| Appendices | Export pack exists, not embedded as structured pack appendix. |

## Commentary Sources

- `src/lib/reports/insights.ts` provides deterministic insight builders for some reports.
- `src/app/(app)/reports/monthly-dashboard/monthly-dashboard-client.tsx` builds local insights.
- `src/lib/reports/summaryReports.ts` builds a plain-English leadership summary inline.
- `src/lib/reports/engine/service.ts` stores placeholder snapshot commentary:
  - Report definition trustee explanation.
  - Generic placeholder text.
- AGM currently returns `commentary: ''`.

There is no central deterministic `generateFinancialCommentary(reportData)` service, no explainable calculation metadata, and no structured editable commentary object.

## Workflow And Export State

- `report_versions`, `report_exports`, and `report_approval_events` already support draft/review/approved/exported/archived lifecycle state.
- `saveReportVersion`, `submitReportVersionForReview`, `approveReportVersion`, and `exportReport` exist in the reporting engine.
- Archive support exists internally as a status transition pattern, but no public `archiveReportVersion` action is exposed.
- Report pages mostly render in-memory reports and do not expose full save/review/approve/export controls.
- PDF/DOCX/Excel exports are currently placeholders in the engine.
- Internal comments and trustee review notes do not have a first-class table or UI.

## Implementation Sequence

1. Add shared trustee pack contracts.
2. Add central deterministic commentary and glossary services.
3. Add a pack composer that uses existing loaders and emits all 15 sections.
4. Add reusable pack UI sections and chart components.
5. Wire monthly dashboard, trustee snapshot, leadership snapshot, quarterly and AGM pages to the shared pack.
6. Add review comments persistence and expose lifecycle actions where missing.
7. Add PDF, DOCX and Excel appendix export foundations.
8. Add targeted tests and implementation documentation.

## Risks

- Duplicated loading during the first integration pass can make pages slower if pack composition calls existing loaders separately from legacy page data.
- Some sections rely on optional modules such as lettings and payroll; these must render explicit empty states.
- True binary PDF/DOCX/Excel rendering is a larger follow-up beyond snapshot/export foundations.
- Review comments need strict workspace-scoped RLS to avoid leaking trustee notes across organisations.
