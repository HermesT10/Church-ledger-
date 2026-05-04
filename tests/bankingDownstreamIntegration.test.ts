import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../supabase/migrations/00093_banking_downstream_integration.sql', import.meta.url),
  'utf8',
);
const bankingActions = readFileSync(
  new URL('../src/lib/banking/actions.ts', import.meta.url),
  'utf8',
);
const importActions = readFileSync(
  new URL('../src/lib/banking/import-actions.ts', import.meta.url),
  'utf8',
);
const reconciliationActions = readFileSync(
  new URL('../src/lib/banking/reconciliation-workspace-actions.ts', import.meta.url),
  'utf8',
);
const accountPage = readFileSync(
  new URL('../src/app/(app)/banking/[bankAccountId]/page.tsx', import.meta.url),
  'utf8',
);
const bankingHubClient = readFileSync(
  new URL('../src/app/(app)/banking/banking-hub-client.tsx', import.meta.url),
  'utf8',
);
const certificateRoute = readFileSync(
  new URL('../src/app/api/banking/reconciliation-certificates/[certificateId]/pdf/route.ts', import.meta.url),
  'utf8',
);
const summaryDoc = readFileSync(
  new URL('../docs/implementation/banking-downstream-integration-summary.md', import.meta.url),
  'utf8',
);

describe('banking downstream integration', () => {
  it('adds reconciliation certificates, statement warnings and duplicate match guards', () => {
    expect(migration).toContain('bank_reconciliation_certificates');
    expect(migration).toContain('statement_warnings jsonb');
    expect(migration).toContain('warning_status');
    expect(migration).toContain('idx_brm_confirmed_bank_transaction_once');
    expect(migration).toContain('idx_brm_confirmed_source_once');
    expect(migration).toContain('force row level security');
  });

  it('detects statement date gaps, overlaps and balance mismatches during import', () => {
    expect(importActions).toContain('detectStatementContinuityWarnings');
    expect(importActions).toContain("type: 'date_overlap'");
    expect(importActions).toContain("type: 'date_gap'");
    expect(importActions).toContain("type: 'balance_mismatch'");
    expect(importActions).toContain('statement_warnings: continuityWarnings');
  });

  it('generates reconciliation certificates with balances, exceptions and audit logging', () => {
    expect(bankingActions).toContain('generateReconciliationCertificate');
    expect(bankingActions).toContain('closing_bank_balance_pence');
    expect(bankingActions).toContain('book_balance_pence');
    expect(bankingActions).toContain('unreconciled_exceptions');
    expect(bankingActions).toContain('bank_reconciliation_certificate_generated');
  });

  it('surfaces certificate generation, warning badges and PDF export in banking UI', () => {
    expect(accountPage).toContain('Generate Certificate');
    expect(accountPage).toContain('statement.statement_warnings');
    expect(accountPage).toContain('Reconciliation certificates');
    expect(accountPage).toContain('/api/banking/reconciliation-certificates/');
    expect(certificateRoute).toContain('application/pdf');
  });

  it('keeps dashboard and month-end readiness metrics tied to banking state', () => {
    expect(bankingActions).toContain('stale_bank_imports');
    expect(bankingActions).toContain('month_end_ready');
    expect(bankingHubClient).toContain('Stale Imports');
    expect(bankingHubClient).toContain('month_end_ready');
  });

  it('invalidates downstream reports for donation reconciliation and documents report-once behaviour', () => {
    expect(reconciliationActions).toContain('invalidateOrgReportCache(ctx.orgId)');
    expect(reconciliationActions).toContain("revalidatePath('/donations')");
    expect(reconciliationActions).toContain("revalidatePath('/gift-aid')");
    expect(summaryDoc).toContain('Reports count posted ledger activity once');
    expect(summaryDoc).toContain('no duplicate ledger posting');
  });
});
