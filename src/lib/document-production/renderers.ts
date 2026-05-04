import { renderDocumentCsv } from './csv';
import { renderDocumentDocx } from './docx';
import { renderDocumentExcel } from './excel';
import { renderDocumentPdf } from './pdf';
import type { DocumentExportFormat, DocumentModel, DocumentRenderResult } from './types';

export async function renderDocument(model: DocumentModel, format: DocumentExportFormat): Promise<DocumentRenderResult> {
  if (format === 'pdf') return renderDocumentPdf(model);
  if (format === 'docx') return renderDocumentDocx(model);
  if (format === 'excel') return renderDocumentExcel(model);
  return renderDocumentCsv(model);
}
