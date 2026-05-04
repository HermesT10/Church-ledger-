import type { AnnualAccountsExportDescriptor, AnnualAccountsPack } from './types';
import { hasAnnualAccountsBlockers } from './validation';
import { documentFromAnnualAccountsPack, renderDocument } from '@/lib/document-production';
import type { DocumentExportFormat, DocumentRenderResult } from '@/lib/document-production/types';

export const ANNUAL_ACCOUNTS_EXPORTS: AnnualAccountsExportDescriptor[] = [
  {
    format: 'pdf',
    label: 'Final accounts PDF',
    description: 'Trustee-ready accounts pack with watermark, approval page and generated metadata.',
    requiresApproval: true,
  },
  {
    format: 'docx',
    label: 'Editable DOCX',
    description: 'Editable trustee report and notes pack for examiner or trustee review.',
    requiresApproval: false,
  },
  {
    format: 'excel',
    label: 'Excel schedules',
    description: 'Supporting schedules for SOFA, balance sheet, notes and fund movements.',
    requiresApproval: false,
  },
  {
    format: 'evidence-index',
    label: 'Evidence index',
    description: 'Index of linked supporting evidence for examiner review.',
    requiresApproval: false,
  },
];

export interface AnnualAccountsExportResult {
  format: AnnualAccountsExportDescriptor['format'];
  filename: string;
  mimeType: string;
  content: string;
  metadata: {
    version: number;
    watermark: 'DRAFT' | 'FINAL';
    generatedAt: string;
    approved: boolean;
    validationStatus: 'passed' | 'blocked' | 'needs_review';
  };
}

function exportMetadata(pack: AnnualAccountsPack) {
  const blocked = hasAnnualAccountsBlockers(pack.validationResults);
  return {
    version: 1,
    watermark: pack.approval.final ? 'FINAL' as const : 'DRAFT' as const,
    generatedAt: new Date().toISOString(),
    approved: pack.approval.final,
    validationStatus: blocked ? 'blocked' as const : pack.validationResults.some((item) => item.status === 'needs_review') ? 'needs_review' as const : 'passed' as const,
  };
}

export function buildAnnualAccountsPdfExport(pack: AnnualAccountsPack): AnnualAccountsExportResult {
  return {
    format: 'pdf',
    filename: `annual-accounts-${pack.financialYear}.pdf`,
    mimeType: 'application/pdf',
    content: 'PDF document-production renderer: cover, contents, statements, notes, approval page, evidence index, footer, and draft/final watermark.',
    metadata: exportMetadata(pack),
  };
}

export function buildAnnualAccountsDocxExport(pack: AnnualAccountsPack): AnnualAccountsExportResult {
  return {
    format: 'docx',
    filename: `annual-accounts-${pack.financialYear}.docx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    content: 'DOCX document-production renderer: editable trustee narrative, structured headings, preserved tables, notes, and approval page.',
    metadata: exportMetadata(pack),
  };
}

export function buildAnnualAccountsExcelExport(pack: AnnualAccountsPack): AnnualAccountsExportResult {
  const rows = pack.sofaRows.map((row) => [
    row.label,
    row.unrestrictedPence,
    row.restrictedPence,
    row.designatedPence,
    row.totalCurrentYearPence,
    row.totalPriorYearPence,
  ]);
  return {
    format: 'excel',
    filename: `annual-accounts-schedules-${pack.financialYear}.xlsx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    content: JSON.stringify({ sheets: { sofa: rows, balanceSheet: pack.balanceSheetRows, notes: pack.notes }, renderer: 'exceljs-document-production' }),
    metadata: exportMetadata(pack),
  };
}

export async function renderAnnualAccountsDocumentExport(
  pack: AnnualAccountsPack,
  format: DocumentExportFormat,
): Promise<DocumentRenderResult> {
  return renderDocument(documentFromAnnualAccountsPack(pack), format);
}

export function buildAnnualAccountsEvidenceIndexExport(pack: AnnualAccountsPack): AnnualAccountsExportResult {
  return {
    format: 'evidence-index',
    filename: `annual-accounts-evidence-index-${pack.financialYear}.csv`,
    mimeType: 'text/csv',
    content: [
      'Title,Source,Reference,Date,Amount Pence',
      ...pack.evidenceIndex.map((item) =>
        [item.title, item.source, item.reference, item.date ?? '', item.amountPence ?? ''].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','),
      ),
    ].join('\n'),
    metadata: exportMetadata(pack),
  };
}
