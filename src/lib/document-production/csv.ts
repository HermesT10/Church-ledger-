import { buildCsv, type CsvColumn } from '@/lib/exports/csvExport';
import { checksumSha256, safeFilePart, textBytes } from './hash';
import type { DocumentModel, DocumentRenderResult } from './types';

type CsvRow = Record<string, string | number | null>;

export function renderDocumentCsv(model: DocumentModel): DocumentRenderResult {
  const rows: CsvRow[] = [];
  rows.push({
    section: 'Metadata',
    item: 'Report title',
    value: model.metadata.reportTitle,
  });
  rows.push({ section: 'Metadata', item: 'Organisation', value: model.metadata.organisationName });
  rows.push({ section: 'Metadata', item: 'Period', value: model.metadata.periodLabel });
  rows.push({ section: 'Metadata', item: 'Status', value: model.metadata.status });

  for (const section of model.sections) {
    rows.push({ section: section.title, item: 'Template', value: section.template });
    for (const body of section.body ?? []) rows.push({ section: section.title, item: 'Narrative', value: body });
    for (const table of section.tables ?? []) {
      rows.push({ section: section.title, item: table.title, value: table.headers.join(' | ') });
      for (const row of table.rows) rows.push({ section: section.title, item: table.title, value: row.map((cell) => cell ?? '').join(' | ') });
    }
  }

  const columns: CsvColumn<CsvRow>[] = [
    { header: 'Section', accessor: (row) => row.section },
    { header: 'Item', accessor: (row) => row.item },
    { header: 'Value', accessor: (row) => row.value },
  ];
  const payloadText = buildCsv(rows, columns);
  const payload = textBytes(payloadText);

  return {
    format: 'csv',
    fileName: `${safeFilePart(model.metadata.reportTitle)}-v${model.metadata.version}.csv`,
    contentType: 'text/csv; charset=utf-8',
    payload,
    checksumSha256: checksumSha256(payload),
    metadata: model.metadata,
    validationSnapshot: model.validationSnapshot,
  };
}
