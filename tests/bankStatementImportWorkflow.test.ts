import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const actionsSource = readFileSync(
  new URL('../src/lib/banking/import-actions.ts', import.meta.url),
  'utf8',
);

const wizardSource = readFileSync(
  new URL('../src/app/(app)/banking/[bankAccountId]/import/import-form.tsx', import.meta.url),
  'utf8',
);

describe('bank statement import workflow wiring', () => {
  it('blocks duplicate statement files by workspace, bank account and file hash', () => {
    expect(actionsSource).toContain(".from('bank_statement_imports')");
    expect(actionsSource).toContain(".eq('workspace_id', orgId)");
    expect(actionsSource).toContain(".eq('bank_account_id', bankAccountId)");
    expect(actionsSource).toContain(".eq('file_hash', fileHash)");
    expect(actionsSource).toContain('bank_statement_duplicate_upload_skipped');
  });

  it('imports through bank_lines with transaction fingerprint duplicate skipping', () => {
    expect(actionsSource).toContain(".from('bank_lines')");
    expect(actionsSource).toContain("onConflict: 'bank_account_id,fingerprint'");
    expect(actionsSource).toContain('ignoreDuplicates: true');
    expect(actionsSource).toContain('bank_statement_duplicate_transactions_skipped');
    expect(actionsSource).toContain('existingDuplicates.has(row.fingerprint)');
  });

  it('keeps statement import as bank transactions only', () => {
    expect(actionsSource).not.toContain('runDonationCandidateIngestion');
    expect(actionsSource).not.toContain('runGiftAidDonorMatching');
    expect(actionsSource).toContain("status: 'unmatched'");
    expect(actionsSource).toContain('reconciled: false');
  });

  it('records audit events for upload, parse, import, failure and voiding', () => {
    expect(actionsSource).toContain("action: 'bank_statement_upload'");
    expect(actionsSource).toContain("action: 'bank_statement_preview_generated'");
    expect(actionsSource).toContain("action: 'bank_statement_parse_failed'");
    expect(actionsSource).toContain("action: status === 'failed' ? 'bank_statement_import_failed' : 'bank_statement_import'");
    expect(actionsSource).toContain("action: 'bank_statement_voided'");
  });

  it('surfaces mapping, validation, error report and reconciliation links in the wizard', () => {
    expect(wizardSource).toContain('Detected as');
    expect(wizardSource).toContain('Amount format');
    expect(wizardSource).toContain('Single transaction amount column');
    expect(wizardSource).toContain('Separate money in and money out columns');
    expect(wizardSource).toContain('Refresh preview');
    expect(wizardSource).toContain('Download error report');
    expect(wizardSource).toContain('Import valid rows');
    expect(wizardSource).toContain('Go to reconciliation');
    expect(wizardSource).toContain('Save this mapping template');
    expect(wizardSource).toContain('column.columnKey');
    expect(wizardSource).toContain('transaction_time');
  });

  it('loads and saves templates with amount mode and time column metadata', () => {
    expect(actionsSource).toContain('loadSavedBankImportMapping');
    expect(actionsSource).toContain('time_column');
    expect(actionsSource).toContain('amount_mode');
    expect(actionsSource).toContain('saved_template_applied');
  });
});
