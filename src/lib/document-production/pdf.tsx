import React from 'react';
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { checksumSha256, safeFilePart } from './hash';
import { withStandardSections } from './templates';
import type { DocumentModel, DocumentRenderResult, DocumentTable } from './types';

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#111827',
  },
  title: {
    fontSize: 22,
    marginBottom: 8,
    fontWeight: 700,
  },
  subtitle: {
    color: '#6b7280',
    marginBottom: 4,
  },
  section: {
    marginTop: 18,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 8,
  },
  paragraph: {
    marginBottom: 5,
    lineHeight: 1.5,
  },
  table: {
    display: 'flex',
    width: 'auto',
    borderWidth: 1,
    borderColor: '#d1d5db',
    marginTop: 6,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerCell: {
    flex: 1,
    padding: 5,
    fontWeight: 700,
    backgroundColor: '#f3f4f6',
  },
  cell: {
    flex: 1,
    padding: 5,
  },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 36,
    right: 36,
    color: '#6b7280',
    fontSize: 8,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 6,
  },
  watermark: {
    position: 'absolute',
    top: 280,
    left: 130,
    fontSize: 64,
    color: '#d1d5db',
    opacity: 0.25,
    transform: 'rotate(-30deg)',
  },
});

function PdfTable({ table }: { table: DocumentTable }) {
  return (
    <View style={styles.table}>
      <View style={styles.row} fixed>
        {table.headers.map((header) => <Text key={header} style={styles.headerCell}>{header}</Text>)}
      </View>
      {table.rows.map((row, rowIndex) => (
        <View key={`${table.title}-${rowIndex}`} style={styles.row} wrap={false}>
          {row.map((cell, cellIndex) => <Text key={`${rowIndex}-${cellIndex}`} style={styles.cell}>{String(cell ?? '')}</Text>)}
        </View>
      ))}
    </View>
  );
}

function PdfDocument({ model }: { model: DocumentModel }) {
  const prepared = withStandardSections(model);
  return (
    <Document title={prepared.metadata.reportTitle} author={prepared.metadata.generatedBy}>
      <Page size="A4" style={styles.page} wrap>
        {prepared.metadata.status === 'draft' ? <Text style={styles.watermark}>DRAFT</Text> : null}
        <Text style={styles.subtitle}>Professional report pack</Text>
        <Text style={styles.title}>{prepared.metadata.reportTitle}</Text>
        <Text style={styles.subtitle}>{prepared.metadata.organisationName}</Text>
        <Text style={styles.subtitle}>Charity number: {prepared.metadata.charityNumber || 'Not provided'}</Text>
        <Text style={styles.subtitle}>Period: {prepared.metadata.periodLabel}</Text>
        <Text style={styles.subtitle}>Status: {prepared.metadata.status.toUpperCase()} · Version {prepared.metadata.version}</Text>

        {prepared.sections.map((section) => (
          <View key={section.id} style={styles.section} wrap>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {(section.body ?? []).map((line, index) => <Text key={`${section.id}-body-${index}`} style={styles.paragraph}>{line}</Text>)}
            {(section.notes ?? []).map((note, index) => <Text key={`${section.id}-note-${index}`} style={styles.paragraph}>Note: {note}</Text>)}
            {(section.tables ?? []).map((table) => <PdfTable key={table.title} table={table} />)}
          </View>
        ))}

        <Text style={styles.footer} fixed render={({ pageNumber, totalPages }) =>
          `${prepared.metadata.footerText} · Page ${pageNumber} of ${totalPages} · ${prepared.metadata.confidentialityText}`
        } />
      </Page>
    </Document>
  );
}

export async function renderDocumentPdf(model: DocumentModel): Promise<DocumentRenderResult> {
  const payload = new Uint8Array(await renderToBuffer(<PdfDocument model={model} />));
  return {
    format: 'pdf',
    fileName: `${safeFilePart(model.metadata.reportTitle)}-v${model.metadata.version}.pdf`,
    contentType: 'application/pdf',
    payload,
    checksumSha256: checksumSha256(payload),
    metadata: model.metadata,
    validationSnapshot: model.validationSnapshot,
  };
}
