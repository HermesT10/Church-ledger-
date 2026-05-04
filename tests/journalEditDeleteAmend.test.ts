import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), 'utf8');
}

describe('journal edit/delete/amend lifecycle migration', () => {
  const migration = read('supabase/migrations/20260502143000_journal_edit_delete_amend_lifecycle.sql');

  it('extends journal lifecycle statuses and fields', () => {
    expect(migration).toContain("add value if not exists 'reversed'");
    expect(migration).toContain("add value if not exists 'correcting'");
    expect(migration).toContain("add value if not exists 'voided'");
    expect(migration).toContain('posted_by');
    expect(migration).toContain('reversed_at');
    expect(migration).toContain('replacement_journal_id');
    expect(migration).toContain('amendment_reason');
    expect(migration).toContain('void_reason');
  });

  it('keeps posted journals immutable except correction metadata', () => {
    expect(migration).toContain('Cannot delete a posted');
    expect(migration).toContain('Cannot update a posted');
    expect(migration).toContain('Use Amend Journal to create a correction');
  });

  it('adds journal delete dependency preview for reconciliation/source links', () => {
    expect(migration).toContain('get_journal_delete_dependency_preview');
    expect(migration).toContain('bank_reconciliation_matches');
    expect(migration).toContain('posted_journal_id');
    expect(migration).toContain('manual_transactions');
  });
});

describe('journal server actions', () => {
  const actions = read('src/lib/journals/actions.ts');
  const wrappers = read('src/app/(app)/journals/actions.ts');

  it('explicitly blocks non-draft direct edits and audits draft edits', () => {
    expect(actions).toContain("existingJournal.status !== 'draft'");
    expect(actions).toContain('Posted journal lines cannot be edited directly. Use Amend Journal');
    expect(actions).toContain('draft_journal_edited');
  });

  it('requires dated, reasoned reversals and creates amendment replacement drafts', () => {
    expect(actions).toContain('A reversal reason is required');
    expect(actions).toContain('A reversal date is required');
    expect(actions).toContain('export async function amendJournal');
    expect(actions).toContain('Correction of:');
    expect(actions).toContain('journal_amended');
    expect(actions).toContain('redirectIfJournalLinesViolateFundPolicy');
    expect(actions).toContain('requireFundOnLines');
    expect(wrappers).toContain('formData.get');
  });
});

describe('journal UI', () => {
  const detail = read('src/app/(app)/journals/[id]/page.tsx');
  const correctionActions = read('src/app/(app)/journals/journal-correction-actions.tsx');
  const form = read('src/app/(app)/journals/journal-form.tsx');

  it('surfaces reverse/amend actions and correction chain on posted journals', () => {
    expect(detail).toContain('JournalCorrectionActions');
    expect(detail).toContain('Correction chain');
    expect(detail).toContain('Missing fund');
    expect(detail).toContain('backs out amounts; it does not add fund mappings');
    expect(correctionActions).toContain('Reverse journal');
    expect(correctionActions).toContain('Amend posted journal');
    expect(correctionActions).toContain('Create correction draft');
    expect(correctionActions).toContain('missingFundLineCount');
    expect(correctionActions).toContain('Prefer <strong>Amend</strong>');
  });

  it('loads organisation fund requirement helper', () => {
    const setting = read('src/lib/journals/require-fund-setting.ts');
    expect(setting).toContain('getRequireFundOnJournalLines');
    expect(setting).toContain('require_fund_on_journal_lines');
  });

  it('does not offer direct post from draft form', () => {
    expect(form).toContain('Approve');
    expect(form).not.toContain('Post</Button>');
  });
});
