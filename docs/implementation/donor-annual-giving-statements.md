# Donor annual giving statements

## Purpose

Administrators generate PDF summaries of posted donations per donor for a selectable period (UK tax year, calendar year, financial year derived from fiscal start month in **Settings**, or custom dates).

## Schema (`00087_donor_annual_giving_statements.sql`)

- **`donor_statement_runs`** — bulk jobs: `period_start`, `period_end`, `period_type`, optional `label`, `status` (`draft` \| `processing` \| `completed` \| `failed`), `created_by`, `created_at`.
- **`donor_statements`** — each PDF: optional `run_id`, `donor_id`, period fields, `pdf_path` in Storage, `email_sent_at`, `status` (`generated` \| `sent` \| `failed` \| `voided`), snapshot totals.

## Storage

Uses existing **`gift-aid`** private bucket (`{workspace_id}/donor-statements/{statement-id}.pdf`), same tenancy pattern as schedule PDFs (`[1]` = workspace UUID folder).

## Behaviour

| Area | Implementation |
|------|----------------|
| Periods | `donor-statement-periods.ts` |
| Rows & totals | `donor-statement-rows.ts` (uses `calculateClaimablePence` from `eligibility.ts`) |
| PDF | `donor-statement-pdf.tsx` (`@react-pdf/renderer` + `renderToBuffer`) |
| Server actions | `donor-statements-actions.ts`: generate one, bulk, list, signed download, mark sent |

**Email**: automated sending is not wired (no transactional provider in-repo). Users download the PDF and email it; **`recordDonorStatementMarkedSent`** stores `email_sent_at` and sets **`sent`**.

## UI

| Location | Behaviour |
|---------|-----------|
| **Gift Aid → Statements** (`/gift-aid/statements`) | Bulk generate, runs list, statements list + download / mark sent |
| **Gift Aid → Donors** | **Statement** opens generate dialog |
| **Donor profile** | Giving statements section + generate |

Apply migration: `supabase db push` (use `--include-all` if histories diverge).
