import type { ReportExportFormat } from '@/lib/reports/engine/types';
import type { TrusteePack, TrusteePackExportResult } from './types';
import { documentFromTrusteePack, renderDocument } from '@/lib/document-production';
import type { DocumentRenderResult } from '@/lib/document-production/types';

function metadata(pack: TrusteePack) {
  return {
    reportType: pack.type,
    status: pack.approval.status,
    generatedAt: new Date().toISOString(),
    sectionCount: pack.sections.length,
    commentaryCount: pack.commentary.length,
  };
}

function textPack(pack: TrusteePack) {
  return [
    pack.title,
    pack.periodLabel,
    '',
    'Commentary',
    ...pack.commentary.map((item) => `${item.title}: ${item.adminOverrideText ?? item.editableText}`),
    '',
    'Sections',
    ...pack.sections.map((section) => `${section.title}: ${section.status}`),
  ].join('\n');
}

export function buildTrusteePackPdfExport(pack: TrusteePack): TrusteePackExportResult {
  return {
    format: 'pdf',
    filename: `${pack.type}-${pack.periodEnd}.pdf`,
    mimeType: 'application/pdf',
    content: `PDF document-production renderer\n\n${textPack(pack)}`,
    metadata: metadata(pack),
  };
}

export function buildTrusteePackDocxExport(pack: TrusteePack): TrusteePackExportResult {
  return {
    format: 'docx',
    filename: `${pack.type}-${pack.periodEnd}.docx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    content: `DOCX document-production renderer\n\n${textPack(pack)}`,
    metadata: metadata(pack),
  };
}

export function buildTrusteePackExcelExport(pack: TrusteePack): TrusteePackExportResult {
  return {
    format: 'excel',
    filename: `${pack.type}-appendix-${pack.periodEnd}.xlsx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    content: JSON.stringify({
      sections: pack.sections.map((section) => ({
        key: section.key,
        title: section.title,
        metrics: section.metrics,
        table: section.table,
      })),
      commentary: pack.commentary,
      definitions: pack.definitions,
      approval: pack.approval,
      renderer: 'exceljs-document-production',
    }),
    metadata: metadata(pack),
  };
}

export function buildTrusteePackExport(pack: TrusteePack, format: ReportExportFormat): TrusteePackExportResult {
  if (format === 'pdf') return buildTrusteePackPdfExport(pack);
  if (format === 'docx') return buildTrusteePackDocxExport(pack);
  return buildTrusteePackExcelExport(pack);
}

export async function renderTrusteePackDocumentExport(
  pack: TrusteePack,
  format: ReportExportFormat,
): Promise<DocumentRenderResult> {
  return renderDocument(documentFromTrusteePack(pack), format === 'excel' ? 'excel' : format);
}
