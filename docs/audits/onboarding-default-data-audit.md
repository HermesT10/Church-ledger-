# Onboarding Default Data Audit

## Current Workspace Creation

`src/app/(app)/onboarding/actions.ts` creates:

- `organisations`
- `memberships`
- `profiles.active_organisation_id`
- `onboarding_progress`

It does not automatically create funds, accounts, suppliers, register categories, income streams, bank accounts, donations, bills, journals, or payroll records during initial organisation creation.

## Default Data Sources

### Funds

Default funds are optional, but prominent in onboarding and settings:

- `src/app/(app)/onboarding/setup/actions.ts`
- `src/app/(app)/settings/seed/actions.ts`

Both define `SEED_FUNDS`, including:

- General Fund
- Friends In Need
- Tanzania Project
- Building Project
- URC Community Grant
- Baptist Union
- URC Funding

Risk: a new church can be nudged into irrelevant restricted funds.

### Accounts And Categories

Account templates live in:

- `src/lib/accounts/templates/starter.ts`

They are seeded through:

- `seedAccountsForOnboarding` in `src/app/(app)/onboarding/setup/actions.ts`
- `seedAccounts` in `src/app/(app)/settings/seed/actions.ts`

The starter chart includes generic church accounts plus payroll liabilities, giving accounts, lettings, Gift Aid, and three placeholder bank accounts.

Risk: the chart of accounts becomes cluttered before the treasurer knows what is actually needed.

### Giving Platform Defaults

`src/app/(app)/settings/seed/actions.ts` includes `seedGivingPlatforms`, which creates clearing accounts, fee accounts, donation income accounts, and platform records for GoCardless, SumUp, and iZettle.

Risk: platform-specific accounts are created even where those providers are not used.

### Income And Expense Register Categories

Register categories have two default sources:

1. Migration-time rows for existing organisations:
   - `supabase/migrations/20260429104502_income_expense_registers.sql`
   - `supabase/migrations/20260429133100_expense_register_categorisation.sql`
2. Runtime virtual defaults when no database categories exist:
   - `src/lib/registers/defaults.ts`
   - `src/lib/registers/actions.ts`

`loadRegisterCategories` returns DB categories when they exist, otherwise it returns virtual defaults. This means a database-empty organisation can still see many default register rows.

Risk: a blank canvas is not truly blank in the register UI.

### Suppliers

No direct supplier seed list was found in onboarding. Supplier names appear in register category migrations and fallback heuristics only.

Risk: supplier-like category names can appear in registers even without real suppliers.

### Bank Accounts

Bank accounts are not created by organisation onboarding. A demo seeding action exists in:

- `src/lib/banking/bankAccounts.ts`

It creates Bank Account 1, Bank Account 2, and Bank Account 3 when explicitly invoked.

### Calendar Resources

`supabase/migrations/20260429140400_calendar_feature.sql` inserts default calendar resources for existing organisations:

- Main Hall
- Small Hall
- Sanctuary
- Meeting Room
- Kitchen
- Office

Risk: these are not accounting data, but still conflict with the blank-canvas principle.

### Seed Script

`supabase/seed.ts` creates an organisation called `My Church`.

Risk: if run unintentionally, it creates test/demo content in the target database.

## Current Onboarding Flow

`src/app/(app)/onboarding/setup/setup-client.tsx` has seven steps:

1. Organisation
2. Funds
3. Accounts
4. Bank Accounts
5. Import CSV
6. Budget
7. Invite Team

The funds and accounts steps prominently offer default seeding. The flow is optional, but it does not yet support a formal `blank`, `guided`, or `import-first` setup mode.

## Bank Import And Reconciliation

The bank import flow creates imported bank transaction rows only. It does not create ledger postings during upload.

Relevant files:

- `src/lib/banking/import-actions.ts`
- `src/lib/banking/statement-parser.ts`
- `src/lib/banking/reconciliation-workspace-actions.ts`

The new banking reconciliation core already makes reconciliation the controlled path for posting, which is the right base for bank-driven setup.

## Deletion And Archiving

### Funds

`src/lib/funds/actions.ts` checks linked `journal_lines`, `bill_lines`, and `donations` before deletion.

### Accounts

`src/lib/accounts/actions.ts` checks linked `journal_lines` and `bill_lines` before deletion. Accounts can be archived by setting `is_active = false`.

### Suppliers

`src/lib/suppliers/actions.ts` supports archive/unarchive. No direct supplier hard delete path was found.

### Bank Accounts

`src/lib/banking/actions.ts` supports archive by setting `status = archived`, `is_active = false`, and `archived_at`.

### Journals And Transactions

`src/lib/journals/actions.ts` supports reversal journals. Draft journal deletion exists, and posted journals should be reversed rather than deleted.

`src/lib/transactions/actions.ts` includes delete logic for manual transactions, but lifecycle rules should be centralised and aligned with reconciliation and locked periods.

## Risks

- New organisation creation is blank, but the setup wizard still encourages generic seeded data.
- Registers are not blank because virtual defaults appear when no DB categories exist.
- Default seed lists are duplicated between onboarding and settings.
- Migration-time category/resource inserts make older organisations behave differently from newer organisations.
- Archive/delete fields are inconsistent across tables.
- Bank import does not yet generate account/category/supplier suggestions as a first-class setup path.
- Deletion/reversal rules are spread across modules and not expressed as one accounting-safe lifecycle policy.

## Removal Plan

1. Keep organisation creation limited to workspace, admin membership, active organisation, and progress rows.
2. Add setup mode fields and setup progress tracking.
3. Replace default seed buttons in onboarding with blank, guided, and import-first choices.
4. Make register empty state valid by removing runtime virtual default category fallback or reducing it to explicit uncategorised handling.
5. Move default chart/fund creation into a guided setup builder that creates only relevant minimal rows.
6. Add bank-driven categorisation suggestions and user-approved mappings.
7. Standardise archive/delete fields and rules across bank accounts, funds, accounts, suppliers, and register categories.
8. Enforce transaction deletion rules: drafts can delete, posted records reverse, reconciled records cannot delete, locked periods cannot mutate.
9. Add tests for blank organisation creation, guided setup, suggestions, mappings, archive/delete, reversal, dashboard setup state, and RLS.
