# Gift Aid claims engine — codebase audit

**Date:** 2026-04-28  
**Tenant column:** product language says `workspace_id`; this codebase's canonical tenant key is `organisation_id` referencing `public.organisations(id)`. Some newer Gift Aid tables expose `workspace_id`, but it is either the organisation id or a generated alias of `organisation_id`. New write paths should derive the tenant from `getActiveOrg()` / server context and never trust a client-submitted workspace id.

---

## 1. Scope and source material

This audit inspected the current Gift Aid routes, migrations, service layer, storage usage, banking/reconciliation integration, reports, and audit logging.

No Gift Aid declaration PDF or Gift Aid schedule spreadsheet template file was found in the workspace (`*.pdf`, `*.xlsx`, `*.xls`, `*.csv`, `*.ods`). The existing implementation supports uploaded declaration evidence files and generated HMRC-style CSV schedules, but there is no checked-in declaration form PDF or native Excel template.

---

## 2. Current Gift Aid UI and routes

Gift Aid is already a first-class workspace under `src/app/(app)/gift-aid`.

| Area | Current files | Finding |
|------|---------------|---------|
| Navigation | `src/components/app-sidebar.tsx` | Income navigation links Gift Aid to `/gift-aid` behind `FINANCE_PLUS`. |
| Layout and KPIs | `src/app/(app)/gift-aid/layout.tsx`, `src/components/gift-aid/workspace-shell.tsx` | Shared shell shows workflow KPIs and tabs for review queue, donors, declarations, claim builder, and claim history. |
| Overview / review queue | `src/app/(app)/gift-aid/page.tsx`, `gift-aid-overview-client.tsx`, `review-queue-client.tsx` | Loads review rows, donors, and claims; supports stage filtering for match/validate/prepare claim/needs review. |
| Donors | `src/app/(app)/gift-aid/donors/page.tsx`, `donors-client.tsx`, `donors/[donorId]/page.tsx` | Donor list/detail and matching-oriented management exist. |
| Declarations | `src/app/(app)/gift-aid/declarations/page.tsx`, `declarations-client.tsx` | CRUD-style declaration management exists, including type/status/date fields and evidence upload UI accepting PDF/images. |
| Claim builder | `src/app/(app)/gift-aid/claim-builder/page.tsx`, `claim-builder-client.tsx` | Filters eligible donations by date, donor, fund, and source; creates claims through server actions. |
| New claim / detail / history | `new/*`, `[claimId]/*`, `claim-history/page.tsx`, `claim-history-table.tsx` | Users can create, inspect, export, mark submitted, record payment, and see claim history. |
| Reports | `src/app/(app)/reports/gift-aid-summary/*` | Dedicated Gift Aid summary report route exists. |

The UI is much more than a placeholder. The main gap is not page coverage; it is hardening the database contract and document/export lifecycle so the UI cannot accidentally create unverifiable or duplicate claims.

---

## 3. Current donor / giver model

| Table / area | Current state |
|--------------|---------------|
| `public.donors` | Created in `00016_donations_donors.sql` with `organisation_id`, `full_name`, email/address/postcode. Later migrations add `workspace_id generated always as (organisation_id) stored`, `created_by`, `updated_by`, `updated_at`, reference codes, title, first/last name, display name, house name/number, phone, and notes. |
| Donor uniqueness | Initially `unique (organisation_id, full_name)`. Later unique indexes support `(workspace_id, lower(reference_code))` and `(workspace_id, lower(donor_reference_code))` where present. |
| Matching | `public.bank_transaction_donor_matches` supports donor matching against bank lines or donation rows, confidence, match metadata, and review status. Matching logic lives in `src/lib/giftaid/matching.ts` and `src/lib/giftaid/actions.ts`. |
| Risk | Donor identity is editable in-place. Claim lines snapshot donor details, which is good, but the donor/declaration edit history itself is not modelled as an immutable event stream. |

Current donor data is sufficient for MVP HMRC schedule generation once first/last/house/postcode fields are complete. A production claims engine should treat donor identity fields used in claims as auditable history, not just mutable profile data.

---

## 4. Current Gift Aid declarations

Gift Aid declarations already exist.

| Table / area | Current state |
|--------------|---------------|
| `public.gift_aid_declarations` | Created in `00016_donations_donors.sql` with `donor_id`, `start_date`, `end_date`, `is_active`. Extended in `00040_gift_aid_upgrade.sql` with `organisation_id`, `declaration_date`, `hmrc_version`, `template_version`, `attachment_url`. Extended in `00060` and `00062` with generated `workspace_id`, enum `status`, cancellation fields, `created_by`, `updated_by`, `updated_at`, `declaration_type`, `covers_past_donations`, and notes. |
| Declaration logic | `src/lib/giftaid/helpers.ts` and `eligibility.ts` resolve active/expired/cancelled status and coverage over a donation date. |
| Evidence | Declaration evidence is represented as a single `attachment_url` text field. Upload actions store a file path/url, but there is no separate declaration document table with file hash, versioning, original file name, content type, or uploader metadata. |
| Risk | A single mutable `attachment_url` cannot preserve a chain of uploaded declarations, replacements, signed versions, or oral confirmation evidence. |

Declaration records exist and are used in eligibility, but document evidence should be normalized and versioned before production HMRC use.

---

## 5. Current donations model

| Table / field | Current state |
|---------------|---------------|
| `public.donations` | Created in `00016_donations_donors.sql` with `organisation_id`, donor, date, amount, fund, source, status, journal, created_by. Later migrations add gross/net/fees/import fields, bank transaction linkage, Gift Aid state, matched declaration, validation JSON, and income stream. |
| Gift Aid fields | `gift_aid_eligible`, `gift_aid_claim_id`, `gift_aid_claimed_at`, `gift_aid_ineligible_reason`, `gift_aid_status`, `matched_declaration_id`, `included_in_claim_at`, `submitted_to_hmrc_at`, `gift_aid_validation_result`. |
| Bank linkage | `donations.bank_transaction_id` references `public.bank_lines(id)` and has a unique index when set. |
| Status sync | `sync_donation_gift_aid_fields()` derives legacy flags from `gift_aid_status`. |
| Claim prevention | `gift_aid_claim_lines` has `unique (donation_id)` and the legacy `create_gift_aid_claim` RPC locks donations and rejects rows with `gift_aid_claim_id is not null`. |
| Risk | Gift Aid changes are written directly onto donation rows. There is app-level audit logging for claim creation, but there is no dedicated immutable donation Gift Aid decision/event table. |

The current model can identify claimable donations, but production hardening should avoid relying on mutable booleans alone. Gift Aid claimability should be an auditable decision with the declaration, donor snapshot, validation result, actor, and timestamp captured separately.

---

## 6. Current claim batches and exports

Claim batches already exist.

| Table / area | Current state |
|--------------|---------------|
| Legacy claims | `public.gift_aid_claims` exists from `00017_gift_aid_claims.sql` and is used heavily by application code. It stores `organisation_id`, claim period, status, totals, submitted/paid timestamps, reference, and optional journal. |
| Batch model | `public.gift_aid_claim_batches` exists from `00060_gift_aid_production_model.sql`, with `workspace_id`, claim period, enum status (`draft`, `exported`, `submitted`, `voided`), totals, submission reference, and audit user columns. |
| Claim lines | `public.gift_aid_claim_lines` exists with `unique (donation_id)`, `claim_batch_id`, `donation_id`, `donor_id`, `declaration_id`, amount/rate/snapshots, and later donor title/first/last/house snapshots. |
| Export history | `public.gift_aid_exports` exists with batch id, export format, file name, storage path, checksum, row count, exported/submitted metadata. |
| Server actions | `src/lib/giftaid/actions.ts` contains `createGiftAidClaim`, `exportGiftAidClaimCsv`, `markClaimSubmitted`, `recordGiftAidPayment`, and mirror sync from legacy claim to batch tables. |
| Risk | The legacy RPC `public.create_gift_aid_claim` only validates row existence, org ownership, and not-already-claimed. It does not itself prove each donation has an active declaration covering the donation date, a matched declaration id, a claimable Gift Aid status, or required HMRC donor fields. The application performs guardrails before calling it, but the database should enforce the invariant too. |

The production batch tables are a strong start. The main architectural issue is that the canonical write path is split between a legacy claims table/RPC and a newer batch mirror.

---

## 7. Current bank reconciliation flow

| Area | Current state |
|------|---------------|
| Bank lines | `public.bank_lines` are imported under bank accounts and carry `organisation_id`, `allocated`, `reconciled`, `reconciliation_id`, description/reference, and amount. |
| Reconciliation | `src/lib/reconciliation/actions.ts` lists unreconciled bank lines, suggests posted journal matches, inserts into `bank_reconciliation_matches`, and marks bank lines reconciled. |
| Donation linkage | Gift Aid can link donations to bank lines through `donations.bank_transaction_id` and donor matching through `bank_transaction_donor_matches`. |
| Transactions overlap | The newer manual transactions feature also matches manual transactions to `bank_lines`. |
| Risk | Gift Aid donor matching, donation linkage, bank allocations, reconciliation matches, and manual transaction matching all touch `bank_lines`. The claim engine should treat bank proof as supporting evidence but should not let a reconciliation change silently mutate Gift Aid claim history after inclusion/export. |

Gift Aid should consume posted/recognised donations, not raw bank lines directly. Bank matches should support donor confidence and evidence, but the claim item should snapshot the donation and declaration at claim time.

---

## 8. Funds and accounts integration

| Area | Current state |
|------|---------------|
| Donations | Donations carry `fund_id` and create source-linked journals. |
| Gift Aid settings | `organisation_settings` has `gift_aid_income_account_id`, `gift_aid_bank_account_id`, `gift_aid_default_fund_id`, and `gift_aid_use_proportional_funds` from `00040_gift_aid_upgrade.sql`. |
| Accounts | Starter chart includes Gift Aid income/receivable style accounts. Recent account migrations add module flags such as `available_in_donations` and `available_in_reconciliation`. |
| Payment recording | `recordGiftAidPayment` in `src/lib/giftaid/actions.ts` records payment/journal state against a claim. |
| Risk | Claim batches should store fund allocation strategy and claim amount per fund at claim time if proportional funds are used. Otherwise later donation/fund edits can make historical claim accounting hard to explain. |

The accounting integration exists, but production claims should snapshot fund/account routing in claim items or a claim accounting summary table.

---

## 9. Document and attachment storage

| Area | Current state |
|------|---------------|
| Financial evidence bucket | `financial-evidence` is created in `00050_phase2_controls.sql` and made private/org-path scoped in `00066_private_financial_evidence.sql`. |
| Gift Aid exports bucket | `exportGiftAidClaimCsv` uploads to a `gift-aid` Storage bucket using paths like `{workspaceId}/exports/{claimBatchId}/...`. No migration creating or securing that bucket was found. |
| Declaration uploads | Declaration UI accepts PDF/images. `gift_aid_declarations.attachment_url` stores a single reference. |
| Evidence config | `src/lib/evidence/config.ts` maps the module key `gift-aid` to `gift_aid`. |
| Risk | The `gift-aid` bucket needs explicit private bucket creation and org-path RLS policies. Declaration documents should not be represented only as one mutable URL. |

Production Gift Aid should use private, organisation-scoped storage with metadata rows that can be audited independently of the current declaration record.

---

## 10. Export, PDF, and spreadsheet generation

| Tooling | Current state |
|---------|---------------|
| HMRC-style schedule | `src/lib/giftaid/export-schedule.ts` defines schedule columns and CSV generation. |
| Export action | `exportGiftAidClaimCsv` validates line snapshots, builds CSV, computes checksum, uploads to Storage, and inserts `gift_aid_exports`. |
| Report CSV | Gift Aid summary report/export pack has CSV-style outputs via report/export actions. |
| PDF generation | No generated Gift Aid PDF schedule or declaration PDF generation was found. PDFs are accepted as uploads. |
| Spreadsheet template | No checked-in `.xlsx`/`.xls`/`.ods` Gift Aid schedule template was found. |

CSV export is present. If the product must mirror an uploaded HMRC spreadsheet template, that should become either a checked-in template asset plus generator, or a deliberate decision to stay CSV-only with documented HMRC compatibility.

---

## 11. Audit logging and approvals

| Area | Current state |
|------|---------------|
| `audit_log` | `00028_audit_log.sql` creates immutable append-only audit rows. `src/lib/audit.ts` writes via the admin client. `createGiftAidClaim` writes `create_gift_aid_claim`. |
| `approval_events` | Created in `00039_bills_payments_payroll_upgrade.sql`; app code calls `logGiftAidApprovalEvent` with `entity_type = 'gift_aid_claim'`. |
| Constraint risk | `00050_phase2_controls.sql` constrains `approval_events.entity_type` to `journal`, `bill`, `payment_run`, `payroll_run`. No migration widening it to `gift_aid_claim` was found. Gift Aid approval event inserts may fail silently because the helper does not return errors. |
| Mutation audit | Donor/declaration updates and Gift Aid validation changes are not consistently modelled as immutable domain events. |

Audit logging exists, but a production Gift Aid engine should have explicit Gift Aid domain events for declaration create/cancel/reactivate/document upload, eligibility overrides, claim create/export/submit/void/payment, and any post-claim corrections.

---

## 12. RLS and workspace scoping

| Area | Current state |
|------|---------------|
| Base tables | `donors`, `gift_aid_declarations`, `donations`, and `gift_aid_claims` have RLS. |
| Production tables | `bank_transaction_donor_matches`, `gift_aid_claim_batches`, `gift_aid_claim_lines`, and `gift_aid_exports` have RLS and force RLS in `00060`. |
| Policy shape | Policies use `public.is_org_member(...)` for reads and `public.is_org_treasurer_or_admin(...)` for writes. |
| Tenant shape | Newer Gift Aid tables use `workspace_id`; existing app code usually passes `organisationId` from `getActiveOrg()`. |
| Risk | Client actions accept `organisationId` in several places. They should always compare it to `getActiveOrg().orgId` or remove it from client-controlled params. New tables should either use canonical `organisation_id` or generated `workspace_id` aliases to avoid drift. |

The RLS posture is mostly good, but the write contract should be tightened so tenant ids are derived server-side and cross-table consistency is enforced by constraints/triggers, not UI discipline.

---

## 13. Report integration

| Area | Current state |
|------|---------------|
| Gift Aid summary route | `src/app/(app)/reports/gift-aid-summary/*` exists. |
| Report services | `src/lib/reports/summaryReports.ts`, `src/lib/reports/dashboard.ts`, and `src/lib/reports/actions.ts` consume Gift Aid claims, donations, and declarations. |
| Dashboard | Dashboard widget id `gift-aid-summary` exists. |
| Export pack | Report/export pack includes Gift Aid summary CSV-style data. |
| Risk | Reports should distinguish estimated claimable Gift Aid from included/exported/submitted/paid batches, and should use claim item snapshots for historical claims rather than live donor/donation fields. |

Gift Aid is already visible in reports, but historical reporting should be based on immutable claim item snapshots.

---

## 14. Existing guardrails

| Requirement | Current coverage | Gap |
|-------------|------------------|-----|
| Do not directly overwrite donation records without audit trail | Partial. Claim creation updates `donations.gift_aid_claim_id` and timestamps, and logs claim creation. | Gift Aid status/validation/claim linkage should be auditable at row-decision level. |
| Do not allow claims without valid declaration | App-level eligibility checks exist and export validation checks snapshots. | Legacy RPC does not enforce active declaration coverage itself. |
| Do not claim a donation twice | RPC rejects `gift_aid_claim_id is not null`; claim lines have `unique (donation_id)`. | Keep both, and add partial/deferrable constraints if moving canonical status off donation. |
| Workspace scoped and RLS protected | Mostly covered. | Normalize tenant naming and ensure Storage bucket policies exist for `gift-aid`. |
| Never trust client-submitted `workspace_id` | Mostly handled by `getActiveOrg`, but some actions accept org id params. | Derive org id server-side or assert equality before every mutation. |

---

## 15. Proposed production schema changes

The proposal below builds on the existing model rather than replacing it in one jump. It keeps `organisation_id` canonical, with `workspace_id` only as a generated alias where needed for compatibility.

### 15.1 Donors

Keep `public.donors`, but harden the identity fields used by HMRC exports.

Recommended additions:

- `gift_aid_title text`
- `gift_aid_first_name_or_initial text`
- `gift_aid_last_name text`
- `gift_aid_house_name_or_number text`
- `gift_aid_postcode text`
- `gift_aid_address_line_1 text`
- `gift_aid_address_line_2 text`
- `gift_aid_town text`
- `gift_aid_country text default 'GB'`
- `identity_verified_at timestamptz`
- `identity_verified_by uuid references public.profiles(id) on delete set null`
- `archived_at timestamptz`

Recommended constraints/indexes:

- Check postcode/last name/house fields are not blank when donor is used on an active declaration.
- Index `(organisation_id, lower(gift_aid_last_name), lower(gift_aid_postcode))`.
- Keep unique donor reference code per organisation.

Rationale: donor profile fields can stay flexible, but HMRC export identity fields should be explicit and auditable.

### 15.2 Gift Aid declarations

Keep `public.gift_aid_declarations`, but make it the declaration record of truth.

Recommended additions:

- `source text not null default 'written' check (source in ('written', 'online', 'oral', 'imported'))`
- `declaration_text text`
- `declaration_version text`
- `signed_at timestamptz`
- `received_at timestamptz`
- `received_by uuid references public.profiles(id) on delete set null`
- `taxpayer_confirmation boolean not null default false`
- `covers_all_future_donations boolean not null default true`
- `covers_past_years integer not null default 0`
- `superseded_by uuid references public.gift_aid_declarations(id) on delete set null`
- `cancellation_effective_date date`
- `cancellation_recorded_by uuid references public.profiles(id) on delete set null`

Recommended constraints/indexes:

- `organisation_id not null` and FK consistency trigger ensuring declaration organisation equals donor organisation.
- Valid status enum: `draft`, `active`, `cancelled`, `expired`, `superseded`, `invalid`.
- Partial index on active declarations: `(organisation_id, donor_id, start_date, coalesce(end_date, 'infinity'::date)) where status = 'active'`.
- Optional exclusion constraint to prevent overlapping active declarations for the same donor where business rules require it.

Rationale: the current declaration table exists, but production claims need richer provenance and cancellation semantics.

### 15.3 Donation Gift Aid fields

Do not continue expanding mutable donation fields as the only source of truth. Add a separate Gift Aid decision table.

Recommended table: `public.donation_gift_aid_decisions`

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `organisation_id uuid not null references public.organisations(id) on delete cascade`
- `donation_id uuid not null references public.donations(id) on delete cascade`
- `donor_id uuid references public.donors(id) on delete set null`
- `declaration_id uuid references public.gift_aid_declarations(id) on delete restrict`
- `decision_status text not null check (decision_status in ('eligible', 'ineligible', 'needs_review', 'excluded', 'claimed'))`
- `decision_reason text`
- `validation_result jsonb not null default '{}'::jsonb`
- `effective_from timestamptz not null default now()`
- `superseded_at timestamptz`
- `created_by uuid references public.profiles(id) on delete set null`
- `created_at timestamptz not null default now()`

Recommended constraints/indexes:

- Unique current decision: `unique (donation_id) where superseded_at is null`.
- FK consistency trigger ensuring donation, donor, and declaration all belong to the same organisation.
- Check/trigger: `decision_status = 'eligible'` requires a non-null active declaration covering `donations.donation_date`.
- Index `(organisation_id, decision_status, created_at desc)`.

Rationale: this satisfies "do not directly overwrite donation records without audit trail." Existing columns such as `gift_aid_status`, `matched_declaration_id`, and `gift_aid_validation_result` can remain as denormalized read models updated from immutable decisions.

### 15.4 Gift Aid claim batches

Keep `public.gift_aid_claim_batches`, and make it canonical over `gift_aid_claims` for new functionality.

Recommended additions:

- `organisation_id uuid generated always as (workspace_id) stored` or migrate canonical column to `organisation_id`
- `claim_type text not null default 'standard' check (claim_type in ('standard', 'small_donations_scheme', 'correction'))`
- `status text not null check (status in ('draft', 'validated', 'exported', 'submitted', 'paid', 'voided'))`
- `validated_at timestamptz`
- `validated_by uuid references public.profiles(id) on delete set null`
- `export_locked_at timestamptz`
- `submitted_by uuid references public.profiles(id) on delete set null`
- `paid_at timestamptz`
- `paid_journal_id uuid references public.journals(id) on delete set null`
- `void_reason text`
- `voided_by uuid references public.profiles(id) on delete set null`
- `validation_summary jsonb not null default '{}'::jsonb`
- `fund_allocation_summary jsonb not null default '{}'::jsonb`

Recommended constraints/indexes:

- `(organisation_id/workspace_id, status, created_at desc)`.
- `(organisation_id/workspace_id, claim_start, claim_end)`.
- Deleting only draft batches; void submitted/exported batches instead.
- Database trigger preventing changes to exported/submitted claim lines except through explicit void/correction flows.

Rationale: claims should have a formal lifecycle and immutable export lock point.

### 15.5 Gift Aid claim items

The current `gift_aid_claim_lines` should become the immutable claim item ledger. If the product/API vocabulary is `gift_aid_claim_items`, either rename `gift_aid_claim_lines` to `gift_aid_claim_items` in a controlled migration or create `public.gift_aid_claim_items` as the canonical table and preserve a compatibility view for older code.

Recommended additions:

- `claim_item_status text not null default 'included' check (claim_item_status in ('included', 'removed', 'voided', 'corrected'))`
- `decision_id uuid references public.donation_gift_aid_decisions(id) on delete restrict`
- `source_donation_gift_aid_status text`
- `source_donation_gross_amount_pence bigint`
- `source_fund_id uuid references public.funds(id) on delete set null`
- `source_income_stream_id uuid references public.income_streams(id) on delete set null`
- `source_bank_transaction_id uuid references public.bank_lines(id) on delete set null`
- `declaration_start_date_snapshot date`
- `declaration_end_date_snapshot date`
- `declaration_type_snapshot text`
- `donor_reference_snapshot text`
- `donor_address_snapshot_json jsonb not null default '{}'::jsonb`
- `validation_result_snapshot jsonb not null default '{}'::jsonb`
- `included_by uuid references public.profiles(id) on delete set null`
- `included_at timestamptz not null default now()`

Recommended constraints/indexes:

- Keep `unique (donation_id)` for active/included claim items. If corrections are supported, use a partial unique index: `unique (donation_id) where claim_item_status = 'included'`.
- Trigger: insertion requires a current eligible decision with a valid declaration covering the donation date.
- Trigger: donation, donor, declaration, decision, and batch must share the same organisation.
- Index `(organisation_id/workspace_id, claim_batch_id)`, `(donation_id)`, `(donor_id)`, `(declaration_id)`.

Rationale: claim items must be historical evidence. They should not depend on live donor/declaration/donation records after export.

### 15.6 Declaration documents

Recommended table: `public.gift_aid_declaration_documents`

Suggested columns:

- `id uuid primary key default gen_random_uuid()`
- `organisation_id uuid not null references public.organisations(id) on delete cascade`
- `declaration_id uuid not null references public.gift_aid_declarations(id) on delete cascade`
- `donor_id uuid not null references public.donors(id) on delete cascade`
- `document_type text not null check (document_type in ('signed_declaration', 'oral_confirmation', 'cancellation_notice', 'supporting_evidence'))`
- `storage_bucket text not null default 'gift-aid'`
- `storage_path text not null`
- `file_name text not null`
- `content_type text`
- `file_size bigint check (file_size is null or file_size > 0)`
- `sha256 text`
- `uploaded_by uuid references public.profiles(id) on delete set null`
- `uploaded_at timestamptz not null default now()`
- `is_current boolean not null default true`
- `replaced_by uuid references public.gift_aid_declaration_documents(id) on delete set null`

Recommended constraints/indexes:

- Unique storage path.
- Partial index `(organisation_id, declaration_id) where is_current = true`.
- FK consistency trigger for declaration/donor/organisation.
- Private Storage bucket policy based on first path segment being `organisation_id`.

Rationale: declaration evidence needs a document history, not a mutable URL.

### 15.7 Claim export history

Keep `public.gift_aid_exports`, but expand it to support production submission audit.

Recommended additions:

- `organisation_id uuid generated always as (workspace_id) stored` or canonical `organisation_id`
- `export_version integer not null default 1`
- `template_name text`
- `template_version text`
- `hmrc_schema_version text`
- `file_size bigint`
- `generated_by uuid references public.profiles(id) on delete set null`
- `generated_at timestamptz not null default now()`
- `downloaded_at timestamptz`
- `downloaded_by uuid references public.profiles(id) on delete set null`
- `submitted_by uuid references public.profiles(id) on delete set null`
- `submission_method text check (submission_method in ('manual_upload', 'api', 'other'))`
- `hmrc_response_reference text`
- `hmrc_response_payload jsonb not null default '{}'::jsonb`
- `superseded_by uuid references public.gift_aid_exports(id) on delete set null`

Recommended constraints/indexes:

- Unique `(claim_batch_id, export_version)`.
- Index `(organisation_id/workspace_id, claim_batch_id, generated_at desc)`.
- Prevent deletion of exports once submitted; mark superseded/voided instead.

Rationale: export history should prove exactly what was sent, when, by whom, using which template/schema, with checksum and response data.

---

## 16. Proposed database guardrails

The following invariants should be enforced in Postgres, not only in React/server actions.

1. Claim item insert must fail unless the donation has a current eligible Gift Aid decision.
2. Eligible decision creation must fail unless the declaration is active and covers the donation date.
3. Claim item insert must fail if another active claim item already exists for the donation.
4. Claim item insert/update must fail if donation, donor, declaration, decision, and batch are not in the same organisation.
5. Submitted/exported claim batches should be immutable except for status transitions, payment recording, and explicit correction/void workflows.
6. Declaration document rows should be append-only or replacement-based, never silent overwrite.
7. Storage paths should begin with the organisation id and RLS should check that path segment.
8. Client-submitted tenant ids should be ignored or checked against `getActiveOrg().orgId` before mutation.

---

## 17. Suggested migration sequence

1. Add missing approval/event compatibility: widen `approval_events.entity_type` to include `gift_aid_claim` and add Gift Aid domain event coverage.
2. Create/secure the private `gift-aid` Storage bucket with organisation-path policies.
3. Add `gift_aid_declaration_documents` and backfill from `gift_aid_declarations.attachment_url`.
4. Add `donation_gift_aid_decisions` and backfill current decisions from donation/declaration validation state.
5. Add claim batch/item/export hardening columns and indexes.
6. Replace/upgrade `create_gift_aid_claim` so the database enforces valid declaration coverage and claim uniqueness.
7. Move UI/server writes to create decision/document/event rows first, then update donation denormalized fields as read-model sync.
8. Update reports to read historical submitted/paid amounts from claim item snapshots.
9. Add RLS smoke tests and SQL unit tests for no declaration, already claimed, wrong org, exported-batch mutation, and private storage access.

---

## 18. Bottom line

The repo already contains a serious Gift Aid foundation: pages, donor matching, declarations, eligibility validation, claim batches, claim lines, exports, report integration, and RLS. The production upgrade should focus on making the database the final authority for Gift Aid eligibility and claim immutability.

The most important changes are: a separate immutable donation Gift Aid decision trail, versioned declaration documents, database-enforced declaration coverage before claim inclusion, private scoped storage for Gift Aid exports/documents, and claim-item snapshots as the source of truth for historical reporting.
