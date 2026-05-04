import JSZip from 'jszip';
import { checksumSha256, safeFilePart } from './hash';
import { withStandardSections } from './templates';
import type { DocumentModel, DocumentRenderResult } from './types';

function xmlEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function paragraph(text: string, style = '') {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  return `<w:p>${styleXml}<w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

function tableXml(headers: string[], rows: Array<Array<string | number | null>>) {
  const rowXml = [headers, ...rows].map((row) => `
    <w:tr>${row.map((cell) => `<w:tc><w:p><w:r><w:t>${xmlEscape(String(cell ?? ''))}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>
  `).join('');
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/></w:tblPr>${rowXml}</w:tbl>`;
}

export async function renderDocumentDocx(model: DocumentModel): Promise<DocumentRenderResult> {
  const prepared = withStandardSections(model);
  const body = [
    paragraph(prepared.metadata.reportTitle, 'Title'),
    paragraph(prepared.metadata.organisationName),
    paragraph(`Charity number: ${prepared.metadata.charityNumber || 'Not provided'}`),
    paragraph(`Period: ${prepared.metadata.periodLabel}`),
    paragraph(`Status: ${prepared.metadata.status.toUpperCase()} · Version ${prepared.metadata.version}`),
    prepared.metadata.status === 'draft' ? paragraph('DRAFT WATERMARK: This document has not been approved for final use.') : '',
    ...prepared.sections.flatMap((section) => [
      paragraph(section.title, 'Heading1'),
      ...(section.body ?? []).map((line) => paragraph(line)),
      ...(section.notes ?? []).map((note) => paragraph(`Note: ${note}`)),
      ...(section.tables ?? []).map((table) => tableXml(table.headers, table.rows)),
    ]),
    paragraph(prepared.metadata.footerText ?? ''),
    paragraph(prepared.metadata.confidentialityText ?? ''),
  ].join('');

  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.folder('_rels')?.file('.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.folder('word')?.file('document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}<w:sectPr/></w:body>
</w:document>`);

  const payload = await zip.generateAsync({ type: 'uint8array' });
  return {
    format: 'docx',
    fileName: `${safeFilePart(prepared.metadata.reportTitle)}-v${prepared.metadata.version}.docx`,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    payload,
    checksumSha256: checksumSha256(payload),
    metadata: prepared.metadata,
    validationSnapshot: prepared.validationSnapshot,
  };
}
