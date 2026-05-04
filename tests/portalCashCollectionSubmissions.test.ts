import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260430093500_portal_cash_collection_submissions.sql', import.meta.url),
  'utf8',
);
const actions = readFileSync(
  new URL('../src/lib/portal/cash-collection-submissions.ts', import.meta.url),
  'utf8',
);
const cashActions = readFileSync(
  new URL('../src/lib/cash/actions.ts', import.meta.url),
  'utf8',
);
const types = readFileSync(
  new URL('../src/lib/cash/types.ts', import.meta.url),
  'utf8',
);
const portalPage = readFileSync(
  new URL('../src/app/(app)/portal/cash-collections/page.tsx', import.meta.url),
  'utf8',
);
const portalClient = readFileSync(
  new URL('../src/app/(app)/portal/cash-collections/portal-cash-collections-client.tsx', import.meta.url),
  'utf8',
);
const adminPage = readFileSync(
  new URL('../src/app/(app)/cash/collection-submissions/page.tsx', import.meta.url),
  'utf8',
);
const adminClient = readFileSync(
  new URL('../src/app/(app)/cash/collection-submissions/submissions-admin-client.tsx', import.meta.url),
  'utf8',
);
const evidenceConfig = readFileSync(
  new URL('../src/lib/evidence/config.ts', import.meta.url),
  'utf8',
);
const evidenceRoute = readFileSync(
  new URL('../src/app/api/evidence/route.ts', import.meta.url),
  'utf8',
);
const dashboard = readFileSync(
  new URL('../src/lib/portal/dashboard.ts', import.meta.url),
  'utf8',
);
const refreshHook = readFileSync(
  new URL('../src/app/(app)/portal/use-portal-refresh.ts', import.meta.url),
  'utf8',
);

describe('portal cash collection submissions', () => {
  it('creates a scoped intake table with lifecycle, RLS, indexes, and realtime', () => {
    expect(migration).toContain('create table if not exists public.cash_collection_submissions');
    for (const field of ['collection_date', 'amount_pence', 'detail', 'signed_by', 'collection_type', 'linked_cash_batch_id', 'linked_bank_transaction_id']) {
      expect(migration).toContain(field);
    }
    for (const status of ['draft', 'submitted', 'reviewed', 'banked', 'reconciled', 'rejected']) {
      expect(migration).toContain(status);
      expect(types).toContain(`'${status}'`);
    }
    expect(migration).toContain('submitted_by = auth.uid()');
    expect(migration).toContain('public.is_org_treasurer_or_admin(workspace_id)');
    expect(migration).toContain('alter publication supabase_realtime add table public.cash_collection_submissions');
  });

  it('implements draft, submit, review, reject, convert, bank link, and signed-by derivation actions', () => {
    for (const action of [
      'listPortalCashCollectionSubmissions',
      'listPortalCashCollectionFormOptions',
      'savePortalCashCollectionDraft',
      'submitPortalCashCollection',
      'updatePortalCashCollectionDraft',
      'reviewCashCollectionSubmission',
      'rejectCashCollectionSubmission',
      'convertSubmissionToCashCollection',
      'linkSubmissionToBankTransaction',
    ]) {
      expect(actions).toContain(action);
    }
    expect(actions).toContain("select('full_name, email')");
    expect(actions).toContain("scope: 'assigned_funds'");
    expect(actions).toContain('requireSubmit: true');
    expect(actions).toContain("from('cash_collections')");
    expect(actions).toContain("from('cash_collection_lines')");
  });

  it('uses private evidence for attachments', () => {
    expect(evidenceConfig).toContain("'cash-collection-submissions': 'cash'");
    expect(actions).toContain('uploadPortalCashCollectionAttachment');
    expect(actions).toContain('FINANCIAL_EVIDENCE_BUCKET');
    expect(actions).toContain('buildEvidenceAccessPath(storagePath)');
    expect(evidenceRoute).toContain("parsed.entityType === 'cash-collection-submissions'");
    expect(evidenceRoute).toContain("from('cash_collection_submissions')");
  });

  it('builds portal and admin UI flows', () => {
    expect(portalPage).toContain('PortalCashCollectionsClient');
    expect(portalClient).toContain('Add collection');
    expect(portalClient).toContain('Digital cash count sheet');
    expect(portalClient).toContain('Signed by');
    expect(portalClient).toContain('SheetContent');
    expect(adminPage).toContain('CashCollectionSubmissionsAdminClient');
    expect(adminClient).toContain('Mark reviewed');
    expect(adminClient).toContain('Reject');
    expect(adminClient).toContain('Convert to cash collection batch');
    expect(adminClient).toContain('Link bank transaction');
  });

  it('updates dashboard, realtime, banking sync, and notifications', () => {
    expect(dashboard).toContain("from('cash_collection_submissions')");
    expect(dashboard).toContain("eq('submitted_by', userId)");
    expect(refreshHook).toContain("table: 'cash_collection_submissions'");
    expect(migration).toContain('sync_cash_collection_submission_banked_state');
    expect(migration).toContain('handle_cash_collection_submission_bank_match');
    expect(cashActions).toContain("type: 'cash_collection_banked'");
    expect(actions).toContain("type: 'cash_collection_reconciled'");
  });
});
