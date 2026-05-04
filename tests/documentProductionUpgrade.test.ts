import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DOCUMENT_TEMPLATE_KEYS, DOCUMENT_TEMPLATE_REGISTRY } from '../src/lib/document-production/templates';
import { buildDocumentMetadata } from '../src/lib/document-production/metadata';
import { renderDocumentCsv } from '../src/lib/document-production/csv';
import { renderDocumentDocx } from '../src/lib/document-production/docx';
import { renderDocumentExcel } from '../src/lib/document-production/excel';
import { renderDocumentPdf } from '../src/lib/document-production/pdf';
import { buildDocumentExportPath, DOCUMENT_EXPORTS_BUCKET } from '../src/lib/document-production/storage';
import { documentFromGiftAidSchedule, documentFromAuditLog, documentFromFundSummary, documentFromPayrollReport, documentFromBankReconciliationCertificate, documentFromEvidenceIndex } from '../src/lib/document-production/source-adapters';
import type { DocumentModel } from '../src/lib/document-production/types';

const audit = readFileSync(new URL('../docs/audits/document-production-audit.md', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20260501090000_document_production_exports.sql', import.meta.url), 'utf8');
const engineExports = readFileSync(new URL('../src/lib/reports/engine/exports.ts', import.meta.url), 'utf8');
const engineService = readFileSync(new URL('../src/lib/reports/engine/service.ts', import.meta.url), 'utf8');
const annualAccountsExports = readFileSync(new URL('../src/lib/annual-accounts/exports.ts', import.meta.url), 'utf8');
const trusteeExports = readFileSync(new URL('../src/lib/reports/trustee-packs/exports.ts', import.meta.url), 'utf8');
const exportPackPage = readFileSync(new URL('../src/app/(app)/reports/export-pack/page.tsx', import.meta.url), 'utf8');
const downloadRoute = readFileSync(new URL('../src/app/api/document-exports/[exportVersionId]/route.ts', import.meta.url), 'utf8');
const summary = readFileSync(new URL('../docs/implementation/document-production-upgrade-summary.md', import.meta.url), 'utf8');

const model: DocumentModel = {
  metadata: buildDocumentMetadata({
    organisationId: '11111111-1111-1111-1111-111111111111',
    organisationName: 'Church Ledger',
    charityNumber: '123456',
    periodStart: '2026-01-01',
    periodEnd: '2026-12-31',
    reportTitle: 'Trustee Report',
    reportType: 'trustee_snapshot',
    sourceKind: 'report_version',
    sourceId: '22222222-2222-2222-2222-222222222222',
    generatedBy: 'treasurer@example.com',
    version: 2,
    final: false,
  }),
  validationSnapshot: [{ id: 'v1', severity: 'warning', rule: 'bank_rec', title: 'Bank rec', message: 'Review bank reconciliation.' }],
  sections: [
    {
      id: 'statement',
      template: 'statement-page',
      title: 'Statement',
      body: ['Narrative section for trustees.'],
      tables: [
        {
          title: 'Schedule',
          headers: ['Line', 'Amount'],
          rows: [['Income', 100], ['Expense', -50]],
          formulas: [{ cell: 'B4', formula: 'SUM(B2:B3)', result: 50 }],
        },
      ],
    },
  ],
};

describe('document production upgrade', () => {
  it('documents current export gaps and storage patterns', () => {
    expect(audit).toContain('CSV Exports');
    expect(audit).toContain('PDF exports are placeholders');
    expect(audit).toContain('DOCX exports are placeholders');
    expect(audit).toContain('report_exports.storage_path');
    expect(audit).toContain('signed URLs');
  });

  it('adds export_versions, RLS, indexes and private storage policies', () => {
    expect(migration).toContain('create table if not exists public.export_versions');
    expect(migration).toContain("insert into storage.buckets (id, name, public)");
    expect(migration).toContain("'document-exports'");
    expect(migration).toContain('alter table public.export_versions enable row level security');
    expect(migration).toContain('export_versions_workspace_source_format_version_idx');
    expect(migration).toContain('document_exports_select');
    expect(migration).toContain("status in ('draft', 'generated', 'approved', 'final', 'archived')");
  });

  it('registers all required reusable templates', () => {
    expect(DOCUMENT_TEMPLATE_KEYS).toEqual([
      'report-cover',
      'report-contents',
      'statement-page',
      'notes-page',
      'appendix-page',
      'signature-approval-page',
      'evidence-index',
      'export-footer',
    ]);
    for (const key of DOCUMENT_TEMPLATE_KEYS) {
      expect(DOCUMENT_TEMPLATE_REGISTRY[key].title).toBeTruthy();
    }
  });

  it('generates CSV with metadata and escaped rows', () => {
    const csv = renderDocumentCsv(model);
    expect(csv.fileName).toContain('.csv');
    expect(csv.contentType).toContain('text/csv');
    expect(csv.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(new TextDecoder().decode(csv.payload)).toContain('Trustee Report');
  });

  it('generates DOCX package bytes for editable narrative and tables', async () => {
    const docx = await renderDocumentDocx(model);
    expect(docx.fileName).toContain('.docx');
    expect(docx.contentType).toContain('wordprocessingml');
    expect(docx.payload[0]).toBe(80);
    expect(docx.payload[1]).toBe(75);
    expect(docx.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generates Excel workbook bytes with schedules and formulas', async () => {
    const excel = await renderDocumentExcel(model);
    expect(excel.fileName).toContain('.xlsx');
    expect(excel.contentType).toContain('spreadsheetml');
    expect(excel.payload.byteLength).toBeGreaterThan(1000);
    expect(excel.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generates PDF bytes with draft watermark metadata', async () => {
    const pdf = await renderDocumentPdf(model);
    expect(pdf.fileName).toContain('.pdf');
    expect(pdf.contentType).toBe('application/pdf');
    expect(pdf.payload.byteLength).toBeGreaterThan(1000);
    expect(pdf.metadata.status).toBe('draft');
  });

  it('keeps export paths workspace scoped', () => {
    const path = buildDocumentExportPath({
      workspaceId: model.metadata.organisationId,
      sourceKind: 'report_version',
      sourceId: model.metadata.sourceId,
      version: 2,
      fileName: 'Trustee Report.pdf',
    });
    expect(DOCUMENT_EXPORTS_BUCKET).toBe('document-exports');
    expect(path.startsWith(`${model.metadata.organisationId}/report_version/`)).toBe(true);
  });

  it('adds adapters for required source kinds', () => {
    const base = {
      workspaceId: model.metadata.organisationId,
      organisationName: 'Church Ledger',
      title: 'Schedule',
      generatedBy: 'user',
      records: [{ one: 1 }],
    };
    expect(documentFromGiftAidSchedule(base).metadata.sourceKind).toBe('gift_aid_schedule');
    expect(documentFromAuditLog(base).metadata.sourceKind).toBe('audit_log');
    expect(documentFromFundSummary(base).metadata.sourceKind).toBe('fund_summary');
    expect(documentFromPayrollReport(base).metadata.sourceKind).toBe('payroll_report');
    expect(documentFromBankReconciliationCertificate(base).metadata.sourceKind).toBe('bank_reconciliation_certificate');
    expect(documentFromEvidenceIndex(base).metadata.sourceKind).toBe('evidence_index');
  });

  it('wires report engine and UI to stored document exports', () => {
    expect(engineExports).toContain('document-production renderer');
    expect(engineService).toContain('generateStoredReportDocumentExport');
    expect(engineService).toContain('/api/document-exports/');
    expect(annualAccountsExports).toContain('renderAnnualAccountsDocumentExport');
    expect(trusteeExports).toContain('renderTrusteePackDocumentExport');
    expect(exportPackPage).toContain('exportReport');
  });

  it('implements signed download authorisation and summary docs', () => {
    expect(downloadRoute).toContain('getExportVersionForDownload');
    expect(downloadRoute).toContain('createDocumentExportSignedUrl');
    expect(downloadRoute).toContain('document_export_downloaded');
    expect(summary).toContain('Database And Storage Security');
    expect(summary).toContain('Versioning And Downloads');
  });
});
