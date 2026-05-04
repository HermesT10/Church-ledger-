# Journal Fix Missing Fund Workflow Audit

## Scope

General journals: draft validation, posting, posted immutability, **reverse** vs **amend**, org setting `require_fund_on_journal_lines`, reporting signals for lines with `fund_id` null, period locks, permissions, and audit logging.

## Key Files

| Area | Files |
| --- | --- |
| Journal detail | `src/app/(app)/journals/[id]/page.tsx` |
| New journal | `src/app/(app)/journals/new/page.tsx` |
| Form (client) | `src/app/(app)/journals/journal-form.tsx` |
| Correction UI | `src/app/(app)/journals/journal-correction-actions.tsx` |
| Route actions | `src/app/(app)/journals/actions.ts` |
| Core actions | `src/lib/journals/actions.ts` |
| Reversal execution | `src/lib/journals/execute-posted-reversal.ts` |
| Reversal helpers | `src/lib/journals/reversal.ts` |
| Fund setting helper | `src/lib/journals/require-fund-setting.ts` |
| Types | `src/lib/journals/types.ts` |
| Org setting (UI + persistence) | `src/app/(app)/settings/settings-client.tsx`, `src/app/(app)/settings/actions.ts`, `organisation_settings.require_fund_on_journal_lines` |
| Period locks | `src/lib/periods/actions.ts` (`isDateInLockedPeriod`, `assertDateNotInLockedPeriod`) |
| Permissions | `src/lib/permissions.ts` (`journals` module; admin / treasurer / finance_user may write) |
| Report validation signals | `src/lib/reports/engine/service.ts` (`missingFundMappings` count on `journal_lines.fund_id IS NULL`) |
| Lifecycle migration | `supabase/migrations/20260502143000_journal_edit_delete_amend_lifecycle.sql` |

## Schema And Lifecycle (Summary)

- **`journal_lines.fund_id`** is nullable; legacy or optional-fund orgs can still have posted rows with null funds.
- **Posted journals** remain immutable at row level; corrections use linked journals (`reversed_by`, `reversal_of`, `replacement_journal_id`, etc.).
- **`journal_status`** includes values such as `posted`, `reversed`, `correcting`, `voided` (see lifecycle migration).

## Current Behaviour

### Draft create/update

- Server **`validateLines`** enforces balance, accounts, and—when the org requires funds—**fund_id** on every amount line.
- Period lock: **create** / **update** reject dates in **locked** periods (`isDateInLockedPeriod`).

### Approve / post

- **Approve** checks status, locked period, delete-dependency RPC.
- **Post** (when fund requirement is on) rejects if any amount line lacks **`fund_id`** so settings cannot be bypassed after editing drafts under an older policy.

### Reverse vs amend

- **Reverse** (`executePostedJournalReversal`): creates a **posted** reversal journal (swapped debits/credits), links original (`reversed_by`, etc.). Does **not** add fund mappings to the original.
- **Amend**: calls **reverse**, then inserts a **replacement draft** with copied lines (including **null** `fund_id` if present). User edits the draft and goes through approve/post again.

### Org setting

- **`require_fund_on_journal_lines`** lives on **`organisation_settings`** (default `false` in migration `00011_settings_expansion.sql`).
- Server actions read it via **`getRequireFundOnJournalLines`**; the journal form receives the same flag for consistent client validation.

### Permissions

- **`canPerform`**: read allowed for all active roles; writes on **`journals`** allowed for **admin**, **treasurer**, and **finance_user** (with finance_user blocked from approve/seed only—approve/post remain allowed per matrix).
- DB RLS is summarised in `permissions.ts` comments and should stay aligned with application checks.

### Reporting / operational validation

- Trustee/report flows count **`journal_lines`** with **`fund_id` IS NULL** as an operational validation signal.

## Issues Identified (Before Fix)

1. **Setting ignored**: Validation always required funds server-side even when **`require_fund_on_journal_lines`** was false.
2. **UX on posted journals**: Read-only lines still showed **“Fund is required”** inline warnings when **`fund_id`** was null—misleading because the fix path is **Amend**, not editing the grid.
3. **Discoverability**: No prominent explanation that **Reverse** does not assign funds; **Amend** is the path to fix fund mappings.

## Semantics Note: `corrected_by_journal_id`

`execute-posted-journal-reversal` updates **`corrected_by_journal_id`** to the **reversal** journal id alongside **`reversed_by`**. A historic migration backfill sets **`corrected_by_journal_id`** from **`reversed_by`** where applicable. Consumers should treat **`reversed_by`** / **`reversal_of`** as the canonical reversal link and use **`replacement_journal_id`** for the amend draft when present.

## Recommendations (Product)

- Keep **Amend** as the primary action when the problem is **missing fund** on posted entries; surface counts and short copy in UI (implemented).
- Optionally add a focused “Fix funds” wizard later; current change is banner + dialog hints + validation alignment.
- When tightening policies (setting flipped to **true**), **approve/post** guards prevent posting journals that still have null funds.

## Testing

- Static checks: `tests/journalEditDeleteAmend.test.ts` (imports / strings for correction workflow).
- Add targeted assertions for missing-fund banner copy and fund-setting module as the implementation evolves.
