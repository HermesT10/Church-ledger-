# Banking schema foundation summary

## What changed

Migration `00089_banking_schema_foundation.sql` adds the production foundation for manual statement upload and future bank automation while preserving the current Banking implementation.

Added/expanded:

- `bank_accounts` now supports account type, bank name, masked account number, opening balance/date, `status`, `archived_at`, `created_by`, `updated_at`, and a `workspace_id` compatibility tenant key.
- `bank_statement_imports` records uploaded statement files, file hashes, parse/import status, statement period, balances, row counters and parse errors.
- `bank_import_mappings` stores reusable CSV mappings.
- `bank_rules` stores future rule suggestions/automation metadata.
- `bank_lines` remains the physical imported transaction table and gains normalized transaction fields, status, statement import linkage, match source fields, posted journal linkage and `workspace_id`.
- `bank_transactions` is a `security_invoker` compatibility view over `bank_lines`.
- `bank_reconciliation_matches` gains `workspace_id`, `bank_transaction_id`, generalized matched source fields, confidence/status fields and confirmation metadata while preserving existing journal-match callers.

## Compatibility decisions

The product specification uses `workspace_id`, but the established accounting core uses `organisation_id`. Existing banking tables now contain both where needed, with triggers that keep them equal and reject mismatches.

`bank_lines` was not renamed because it is already referenced by donations, Gift Aid, manual transactions, reconciliation, reports, cash deposits and bank allocation posting. The `bank_transactions` view gives future code the product-facing terminology without duplicating data or breaking integrations.

`status` and `is_active` both remain on `bank_accounts`. A trigger keeps them aligned so older callers using `is_active` and newer callers using `status = 'active'` both work.

## Manual import changes

`importBankCsv` now:

- derives the active workspace from `getActiveOrg()` and rejects mismatched submitted org ids;
- verifies the bank account belongs to the active workspace;
- uploads the original statement file to the private `financial-evidence` bucket under `{orgId}/bank-imports/...`;
- creates a `bank_statement_imports` row;
- stores file hash, file path, status, counters, parse errors, statement date range and balances;
- inserts imported rows into `bank_lines` with `statement_import_id` and normalized transaction fields;
- keeps existing duplicate handling through `(bank_account_id, fingerprint)`;
- preserves donation candidate ingestion and Gift Aid donor matching after successful row insert.

## Security

New tables have RLS enabled and forced:

- `bank_statement_imports`
- `bank_import_mappings`
- `bank_rules`

Policies use:

- read: `public.is_org_member(workspace_id)`
- write: `public.is_org_treasurer_or_admin(workspace_id)`

Existing banking tables retain their `organisation_id` policies and now have forced RLS. The new tenant sync trigger rejects rows where `workspace_id` and `organisation_id` differ.

Verification artifacts:

- `tests/bankingSchemaFoundation.test.ts`
- `docs/sql/banking_schema_foundation_rls_smoke.sql`

## Integration assumptions

- Donations and Gift Aid continue to reference `bank_lines` through `bank_transaction_id`.
- Gift Aid claim payment reconciliation continues to allocate against `bank_lines`.
- Manual transactions continue to match to `bank_lines` through `transaction_matches`.
- Bank allocation posting continues through `post_bank_allocation_atomic`.
- Statement reconciliation continues to clear `bank_lines` through `reconciliation_id`.
- Future Open Banking feeds should write normalized imports using the same statement/import metadata model, but no feed implementation is included in this foundation.

## Migration notes

The Supabase CLI `migration new banking_schema_foundation` command was attempted but hung after loading the local profile in this environment. The migration was therefore created as the next numbered migration in the repo’s existing local sequence: `00089_banking_schema_foundation.sql`.

On 2026-04-28, the stray remote migration-history entry `20260428131526` was repaired as reverted, an empty local timestamp stub was removed, and `00089_banking_schema_foundation.sql` was pushed successfully. `supabase migration list --linked` showed local and remote aligned through `00089`.
