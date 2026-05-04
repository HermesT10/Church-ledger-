import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const importActionsSource = readFileSync(
  new URL('../src/lib/banking/import-actions.ts', import.meta.url),
  'utf8',
);

const correctionEventsSource = readFileSync(
  new URL('../src/lib/banking/correction-events.ts', import.meta.url),
  'utf8',
);

const migrationSource = readFileSync(
  new URL('../supabase/migrations/20260503140000_correction_events.sql', import.meta.url),
  'utf8',
);

describe('bank import undo / correction wiring', () => {
  it('exposes import detail, signed download, and orchestrated removal', () => {
    expect(importActionsSource).toContain('export async function getBankStatementImportDetail');
    expect(importActionsSource).toContain('export async function createBankStatementImportSignedDownloadUrl');
    expect(importActionsSource).toContain('export async function removeBankStatementImportWithOptions');
    expect(importActionsSource).toContain('unreconcileBankTransaction');
    expect(importActionsSource).toContain('isMatchOnlyStray');
    expect(importActionsSource).toContain('bank_statement_import_removed_orchestrated');
    expect(importActionsSource).toContain('insertBankStatementImportRemovalEvent');
  });

  it('creates correction_events table with treasurer/admin insert policy', () => {
    expect(migrationSource).toContain('create table if not exists public.correction_events');
    expect(migrationSource).toContain('bank_statement_import_removed');
    expect(migrationSource).toContain('correction_events_insert_treasurer_admin');
    expect(migrationSource).toContain('is_org_treasurer_or_admin');
  });

  it('writes correction events through server helper', () => {
    expect(correctionEventsSource).toContain(".from('correction_events')");
    expect(correctionEventsSource).toContain('listCorrectionEventsForStatementImport');
    expect(correctionEventsSource).toContain('insertBankStatementImportRemovalEvent');
  });
});
