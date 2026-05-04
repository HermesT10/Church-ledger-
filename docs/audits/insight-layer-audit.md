# Insight Layer Audit

## Summary
The repo already had a meaningful interpretation foundation before Phase 6:
- dashboard to-do prompts in `src/lib/reports/dashboard.ts`
- report-level insights in `src/lib/reports/insights.ts`
- leadership plain-language commentary in `src/lib/reports/summaryReports.ts`
- overspend alert logic in `src/lib/alerts/overspend.ts`

The main gap was not absence of insight logic, but fragmentation. Guidance existed in several isolated places, with no shared model for health indicators, anomalies, month-end progress, or action-oriented finance guidance.

## Current Surface Audit
| Area | Existing capability before Phase 6 | Gap |
| --- | --- | --- |
| Main dashboard | To-do list generated from overdue bills, pending approvals, unreconciled items, draft runs, and Gift Aid opportunities | Prompts were unstructured and lacked severity, explanation, or recommended next action |
| Monthly dashboard | Basic report insights and operational action list | No shared health indicator or anomaly model |
| Leadership snapshot | Plain-English summary and recommended actions | Narrative logic was narrow and disconnected from broader dashboard health |
| Trustee snapshot | Simplified finance report with core balances and variances | Numbers still appeared without enough decision-support guidance |
| Overspend alerts | Deterministic adverse variance detection in `src/lib/alerts/overspend.ts` | Only covered one class of risk |
| Month-end controls | Financial periods and locks existed | No guided month-end close checklist or progress tracking |
| Anomaly detection | Partial via overspend and restricted-fund checks | No explicit engine for spikes, income drops, draft backlog, or reconciliation backlog |

## Existing Insight Features

### Dashboard insights already present
- `getDashboardOverview()` in `src/lib/reports/dashboard.ts`
- Generates `todoItems` for:
  - overdue invoices
  - unpaid invoices
  - pending invoice approvals
  - pending expense approvals
  - missing receipts
  - unallocated bank lines
  - draft payment runs
  - draft payroll runs
  - draft budgets
  - overspent restricted funds
  - Gift Aid opportunities

### Report commentary already present
- `src/lib/reports/insights.ts`
- Includes deterministic commentary for:
  - income statement
  - balance sheet
  - budget vs actual
  - fund movements
  - cash position
  - leadership snapshot

### Trustee / leadership-friendly explanation already present
- `src/lib/reports/summaryReports.ts`
- `src/app/(app)/reports/leadership-snapshot/leadership-snapshot-client.tsx`
- Includes:
  - plain-English summary
  - recommended actions
  - simplified KPIs
  - trustee-friendly definitions

## Missing Guidance Before Phase 6

### Users still saw numbers without enough explanation
- dashboard KPIs
- optional dashboard widgets
- trustee summary cards
- month-end readiness state
- anomalies across periods

### No shared interpretation architecture
- no common `HealthIndicator` type
- no anomaly model
- no consistent severity / next-action pattern
- no reusable month-end checklist state

### No guided month-end workflow
- there was no page or state model for:
  - reconciling bank accounts
  - checking draft postings
  - reviewing bills and payments
  - reviewing restricted funds
  - checking payroll
  - checking donations / Gift Aid
  - generating reports
  - recording sign-off

## Phase 6 Response
Phase 6 addresses these gaps by:
1. introducing a shared insight engine in `src/lib/insights/*`
2. adding structured health indicators and anomaly findings
3. adding deterministic narrative summaries
4. adding a month-end close assistant with persisted review state
5. surfacing the same guidance snapshot across dashboard and leadership views
