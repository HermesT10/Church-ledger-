# Portal Cash Collection Submissions Summary

## Overview

Portal cash collection submissions provide invited users with a simple digital count sheet. Submissions are stored in `cash_collection_submissions` as pre-accounting intake records. Admins review them before converting them into the existing `cash_collections` accounting workflow.

## Lifecycle

The submission lifecycle is:

`draft -> submitted -> reviewed -> banked -> reconciled`

A submitted or reviewed record can also become `rejected`.

## Form Fields

Required portal fields:

- `collection_date`
- `amount`
- `detail`
- `signed_by`, populated server-side from the user profile full name

Optional fields:

- `collection_type`
- `fund_id`
- `income_stream_id`
- `counted_by`
- `second_counter`
- `notes`
- `attachment`

Amounts are stored as integer pence.

## Security

RLS on `cash_collection_submissions` limits portal users to their own rows. Portal users can insert and update only their own drafts. Admins and treasurers can review workspace submissions.

Server actions also enforce portal page/action permissions and assigned fund submission scope before a user submits a count sheet.

## Attachments

Attachments are uploaded to the private `financial-evidence` bucket using the `cash-collection-submissions` evidence type. Downloads go through `/api/evidence`, which verifies workspace ownership and submitter access before creating a short-lived signed URL.

## Admin Review

Admins review submissions under cash management. They can:

- mark a submission reviewed
- reject with admin notes
- convert it into a real `cash_collections` batch
- link a bank transaction

Conversion creates a draft cash collection and one cash collection line using the selected fund and the selected income stream's default income account where available.

## Banking And Reconciliation

When linked cash collections are included in a posted cash deposit, related submissions sync to `banked`. When a matched bank line points to a cash deposit, related submissions sync to `reconciled` and store the bank transaction link.

## Verification

Targeted checks:

```bash
npx vitest run tests/portalCashCollectionSubmissions.test.ts tests/userPortalDashboard.test.ts
npx eslint src/lib/portal/cash-collection-submissions.ts src/lib/cash/actions.ts src/lib/cash/types.ts src/lib/evidence/config.ts src/app/api/evidence/route.ts src/app/(app)/portal/cash-collections/page.tsx src/app/(app)/portal/cash-collections/portal-cash-collections-client.tsx src/app/(app)/cash/collection-submissions/page.tsx src/app/(app)/cash/collection-submissions/submissions-admin-client.tsx src/lib/portal/dashboard.ts src/app/(app)/portal/use-portal-refresh.ts src/lib/portal/types.ts
npx tsc --noEmit
```
