import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260430083100_portal_invoice_submissions.sql', import.meta.url),
  'utf8',
);
const workflows = readFileSync(
  new URL('../src/lib/workflows/actions.ts', import.meta.url),
  'utf8',
);
const workflowTypes = readFileSync(
  new URL('../src/lib/workflows/types.ts', import.meta.url),
  'utf8',
);
const portalPage = readFileSync(
  new URL('../src/app/(app)/portal/invoices/page.tsx', import.meta.url),
  'utf8',
);
const portalClient = readFileSync(
  new URL('../src/app/(app)/portal/invoices/portal-invoices-client.tsx', import.meta.url),
  'utf8',
);
const adminClient = readFileSync(
  new URL('../src/app/(app)/workflows/invoices/invoices-client.tsx', import.meta.url),
  'utf8',
);
const bills = readFileSync(
  new URL('../src/lib/bills/actions.ts', import.meta.url),
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
const refreshHook = readFileSync(
  new URL('../src/app/(app)/portal/use-portal-refresh.ts', import.meta.url),
  'utf8',
);

describe('portal invoice submissions', () => {
  it('adds lifecycle schema, hardens RLS, and indexes payment links', () => {
    for (const status of ['draft', 'submitted', 'under_review', 'change_requested', 'scheduled_for_payment', 'paid', 'voided']) {
      expect(migration).toContain(status);
      expect(workflowTypes).toContain(`'${status}'`);
    }
    expect(migration).toContain('submitted_by = auth.uid()');
    expect(migration).toContain("status in ('draft', 'submitted')");
    expect(migration).toContain('invoice_submission_attachments');
    expect(migration).toContain('idx_inv_sub_payment_run_id');
    expect(migration).toContain('invoice_submissions_bill_id_fkey');
  });

  it('syncs invoice status from bill and payment-run state', () => {
    expect(migration).toContain('sync_invoice_submission_payment_state');
    expect(migration).toContain("when v_bill.status = 'paid' then 'paid'");
    expect(migration).toContain("then 'scheduled_for_payment'");
    expect(migration).toContain('trg_invoice_submission_payment_run_item_insert');
    expect(migration).toContain('trg_invoice_submission_bill_paid');
    expect(bills).toContain("type: 'invoice_scheduled'");
    expect(bills).toContain("type: 'invoice_paid'");
  });

  it('uses explicit server transitions and scoped portal permission checks', () => {
    for (const action of [
      'savePortalInvoiceDraft',
      'submitPortalInvoice',
      'updatePortalInvoiceDraft',
      'markInvoiceUnderReview',
      'requestInvoiceChanges',
      'voidInvoiceSubmission',
      'linkInvoiceSubmissionToPaymentState',
    ]) {
      expect(workflows).toContain(action);
    }
    expect(workflows).toContain("scope: 'assigned_budgets'");
    expect(workflows).toContain("scope: 'assigned_funds'");
    expect(workflows).toContain("scope: 'assigned_categories'");
    expect(workflows).toContain('requireSubmit: true');
  });

  it('moves invoice attachments to the private evidence access model', () => {
    expect(evidenceConfig).toContain("'invoice-submissions': 'workflows'");
    expect(workflows).toContain('uploadPortalInvoiceAttachment');
    expect(workflows).toContain('FINANCIAL_EVIDENCE_BUCKET');
    expect(workflows).toContain('buildEvidenceAccessPath(storagePath)');
    expect(evidenceRoute).toContain("parsed.entityType === 'invoice-submissions'");
    expect(evidenceRoute).toContain("from('invoice_submission_attachments')");
  });

  it('builds portal and admin UI for the full lifecycle', () => {
    expect(portalPage).toContain('PortalInvoicesClient');
    expect(portalClient).toContain('savePortalInvoiceDraft');
    expect(portalClient).toContain('uploadPortalInvoiceAttachment');
    expect(portalClient).toContain('submitPortalInvoice');
    expect(portalClient).toContain('Changes requested:');
    expect(adminClient).toContain('markInvoiceUnderReview');
    expect(adminClient).toContain('requestInvoiceChanges');
    expect(adminClient).toContain('voidInvoiceSubmission');
    expect(adminClient).toContain('scheduled_for_payment');
    expect(refreshHook).toContain("table: 'invoice_submissions'");
    expect(refreshHook).toContain("table: 'invoice_submission_attachments'");
  });
});
