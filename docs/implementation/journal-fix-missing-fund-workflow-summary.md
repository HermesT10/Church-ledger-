# Journal Fix Missing Fund Workflow — Implementation Summary

## Goal

Align journal behaviour with **`organisation_settings.require_fund_on_journal_lines`**, remove misleading fund validation on **read-only posted** journals, and make the **Amend** path obvious when posted lines lack **`fund_id`**.

## Changes

### Server

- **`src/lib/journals/require-fund-setting.ts`**  
  - **`getRequireFundOnJournalLines(orgId)`** reads **`require_fund_on_journal_lines`** via Supabase server client.

- **`src/lib/journals/actions.ts`**  
  - **`validateLines`** accepts **`requireFundOnLines`**; fund checks run only when true.  
  - **createJournal** / **updateJournal** load the flag and pass it into **`validateLines`**.  
  - **approveJournal** / **postJournal** call **`redirectIfJournalLinesViolateFundPolicy`** when the flag is true so incomplete drafts cannot be approved or posted.

### UI

- **`src/app/(app)/journals/new/page.tsx`** and **`src/app/(app)/journals/[id]/page.tsx`**  
  - Load org setting and pass **`requireFundOnJournalLines`** into **`JournalForm`**.

- **`src/app/(app)/journals/journal-form.tsx`**  
  - Fund warnings, save button enablement, column header label (“Fund *” vs optional), and validation summary respect **`requireFundOnJournalLines`** only for **editable drafts** (`canEdit && isDraft`).  
  - Posted / read-only views no longer show bogus **“Fund is required”** rows.

- **`src/app/(app)/journals/[id]/page.tsx`**  
  - Amber **missing fund** banner when the journal is **posted**, the user may correct it, and at least one amount line has **`fund_id` null**.

- **`src/app/(app)/journals/journal-correction-actions.tsx`**  
  - Optional **`missingFundLineCount`**; **Reverse** dialog shows guidance to prefer **Amend** when funds are missing.

### Documentation

- **`docs/audits/journal-fix-missing-fund-workflow-audit.md`** — audit.  
- **`docs/implementation/journal-fix-missing-fund-workflow-summary.md`** — this file.

### Tests

- **`tests/journalEditDeleteAmend.test.ts`** — assertions for banner copy and **`require-fund-setting`** module.

## Operational Notes

- Reporting engine already surfaces counts of **`journal_lines`** with null **`fund_id`**; fixing data uses **Amend** → edit replacement draft → approve/post.
