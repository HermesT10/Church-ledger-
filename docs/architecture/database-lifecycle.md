# Database Lifecycle

## Principles

ChurchLedger uses forward-only, reviewed Supabase/Postgres migrations. Because this is finance software, schema changes must be safe, auditable, and reproducible.

## Source of Truth

- Schema changes live in `supabase/migrations`
- Local/bootstrap data lives in `supabase/seed.ts`
- Migration history must be preserved in version control

## Naming Convention

Migration filenames must follow:

`NNNNN_short_descriptive_name.sql`

Examples:

- `00050_phase2_controls.sql`
- `00051_post_bill_atomic.sql`

Rules:

1. Use increasing numeric prefixes.
2. Keep names short and specific.
3. Prefer one migration concern per file.
4. For Supabase CLI compatibility, avoid packing multiple unrelated top-level statements into one migration when the parser is known to be sensitive.

## Review Guidance

Every migration PR should answer:

1. What business capability is changing?
2. Is the change backward compatible with the currently deployed app?
3. Does it alter posting, reporting, permissions, or financial immutability?
4. Does it require new indexes or data backfills?
5. How is it verified locally/staging?

## Forward / Rollback Expectations

Preferred rule: roll forward, not backward.

- If a migration is wrong, create a corrective migration.
- Do not edit already-applied production migrations.
- Do not rely on ad hoc SQL fixes outside version control.

Rollback guidance:

- App rollback may be possible without DB rollback if schema remains backward compatible.
- DB rollback should only be used with an explicit runbook and recent verified restore point.

## Deploy Ordering

Recommended order for releases that change both schema and app code:

1. Confirm branch is green in CI.
2. Review pending migrations.
3. Apply migrations to staging.
4. Validate staging smoke flows and reports.
5. Apply migrations to production.
6. Deploy app code.
7. Verify `/api/health`, login, posting, and reporting smoke checks.

If a change is not backward compatible, schedule migration and app rollout together as a controlled release.

## Seeds

Current local seed entrypoint:

- `supabase/seed.ts`

Rules:

- Local seed scripts may create bootstrap demo organisations.
- Production must not rely on developer seed scripts.
- Add purpose-specific seeds rather than growing one script into an unsafe catch-all.

## Generated Types

This repo does not yet commit generated Supabase database types as a formal artifact.

Recommended future process:

1. Run type generation after schema changes.
2. Commit generated types in the same PR as the migration when adopted.
3. Fail CI if generated types drift from schema.

## Migration Safety Checklist

Before merging:

- migration file numbering is correct
- file names are descriptive
- SQL runs locally
- app code is compatible with pre/post migration state if required
- relevant tests are updated
- backfills and grants are isolated if the CLI parser is sensitive

Before production apply:

- backup/restore posture is confirmed
- staging has been migrated successfully
- release owner is assigned
- incident contact path is known

## Known Repo Lessons

Recent Phase 2 migration work established these rules:

- keep sensitive SQL changes narrowly scoped
- split functions/grants into separate files when needed
- avoid clever multi-command files that are harder to debug

Those lessons should now be treated as standard migration discipline, not one-off fixes.
