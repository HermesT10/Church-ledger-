import type { AnnualAccountsPack } from '@/lib/annual-accounts/types';
import type { ReportSnapshot } from '@/lib/reports/engine/types';
import type { TrusteePack } from '@/lib/reports/trustee-packs/types';
import { buildDocumentMetadata } from './metadata';
import type { DocumentModel, DocumentProductionMetadata, DocumentSection, DocumentTable } from './types';

function valueSummary(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value).slice(0, 500);
}

function objectTable(title: string, value: unknown): DocumentTable {
  if (Array.isArray(value)) {
    return {
      title,
      headers: ['Index', 'Value'],
      rows: value.slice(0, 500).map((item, index) => [index + 1, valueSummary(item)]),
    };
  }
  if (value && typeof value === 'object') {
    return {
      title,
      headers: ['Field', 'Value'],
      rows: Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, valueSummary(item)]),
    };
  }
  return { title, headers: ['Value'], rows: [[valueSummary(value)]] };
}

export function documentFromReportSnapshot(params: {
  snapshot: ReportSnapshot;
  organisationName?: string;
  charityNumber?: string | null;
}): DocumentModel {
  const metadata = buildDocumentMetadata({
    organisationId: params.snapshot.metadata.workspace_id,
    organisationName: params.organisationName ?? 'Organisation',
    charityNumber: params.charityNumber ?? null,
    periodStart: params.snapshot.metadata.period_start,
    periodEnd: params.snapshot.metadata.period_end,
    financialYear: params.snapshot.metadata.financial_year,
    reportTitle: params.snapshot.metadata.report_title,
    reportType: params.snapshot.metadata.report_type,
    sourceKind: 'report_version',
    sourceId: params.snapshot.metadata.report_id,
    generatedBy: params.snapshot.metadata.generated_by,
    version: params.snapshot.metadata.version,
    final: ['approved', 'exported', 'archived'].includes(params.snapshot.metadata.status),
  });

  return {
    metadata,
    validationSnapshot: params.snapshot.validation,
    sections: [
      {
        id: 'commentary',
        template: 'notes-page',
        title: 'Trustee commentary',
        body: params.snapshot.commentary.length > 0 ? params.snapshot.commentary : [params.snapshot.definition.trusteeExplanation],
      },
      {
        id: 'statement',
        template: 'statement-page',
        title: params.snapshot.definition.title,
        tables: [objectTable(params.snapshot.definition.title, params.snapshot.data)],
      },
      {
        id: 'validation',
        template: 'appendix-page',
        title: 'Validation snapshot',
        tables: [
          {
            title: 'Validation snapshot',
            headers: ['Severity', 'Rule', 'Title', 'Message'],
            rows: params.snapshot.validation.map((item) => [item.severity, item.rule, item.title, item.message]),
          },
        ],
      },
    ],
  };
}

export function documentFromAnnualAccountsPack(pack: AnnualAccountsPack): DocumentModel {
  const metadata = buildDocumentMetadata({
    organisationId: String((pack.sourceReports.organisationId as string | undefined) ?? 'workspace'),
    organisationName: pack.charityDetails.charityName,
    charityNumber: pack.charityDetails.charityNumber,
    periodStart: pack.periodStart,
    periodEnd: pack.periodEnd,
    financialYear: pack.financialYear,
    reportTitle: `Annual Accounts ${pack.financialYear}`,
    reportType: 'annual_accounts',
    sourceKind: 'annual_accounts',
    sourceId: String(pack.financialYear),
    generatedBy: pack.generatedBy ?? 'system',
    version: 1,
    final: pack.approval.final,
  });

  const sofa: DocumentTable = {
    title: 'SOFA',
    headers: ['Line', 'Unrestricted', 'Restricted', 'Designated', 'Current year', 'Prior year'],
    rows: pack.sofaRows.map((row) => [
      row.label,
      row.unrestrictedPence,
      row.restrictedPence,
      row.designatedPence,
      row.totalCurrentYearPence,
      row.totalPriorYearPence,
    ]),
  };
  const balanceSheet: DocumentTable = {
    title: 'Balance sheet',
    headers: ['Section', 'Line', 'Current year', 'Prior year'],
    rows: pack.balanceSheetRows.map((row) => [row.section, row.label, row.currentYearPence, row.priorYearPence]),
  };
  const notes: DocumentSection = {
    id: 'notes',
    template: 'notes-page',
    title: 'Notes to the accounts',
    body: pack.notes.map((note) => `${note.title}: ${note.text}`),
  };

  return {
    metadata,
    validationSnapshot: pack.validationResults.map((item) => ({
      id: item.id,
      severity: item.severity === 'blocker' ? 'blocker' : item.severity === 'warning' ? 'warning' : 'info',
      rule: item.id,
      title: item.title,
      message: item.message,
    })),
    evidenceIndex: {
      title: 'Evidence index',
      headers: ['Title', 'Source', 'Reference', 'Date', 'Amount pence'],
      rows: pack.evidenceIndex.map((item) => [item.title, item.source, item.reference, item.date ?? '', item.amountPence ?? '']),
    },
    sections: [
      { id: 'trustee-report', template: 'notes-page', title: 'Trustees Annual Report', body: Object.values(pack.narrativeSections).map(valueSummary) },
      { id: 'sofa', template: 'statement-page', title: 'Statement of Financial Activities', tables: [sofa] },
      { id: 'balance-sheet', template: 'statement-page', title: 'Balance Sheet', tables: [balanceSheet] },
      notes,
      { id: 'evidence-index', template: 'evidence-index', title: 'Evidence Index', tables: [{
        title: 'Evidence index',
        headers: ['Title', 'Source', 'Reference', 'Date', 'Amount pence'],
        rows: pack.evidenceIndex.map((item) => [item.title, item.source, item.reference, item.date ?? '', item.amountPence ?? '']),
      }] },
    ],
  };
}

export function documentFromTrusteePack(pack: TrusteePack): DocumentModel {
  const metadata: DocumentProductionMetadata = buildDocumentMetadata({
    organisationId: 'workspace',
    organisationName: 'Organisation',
    periodStart: pack.periodStart,
    periodEnd: pack.periodEnd,
    reportTitle: pack.title,
    reportType: pack.reportType,
    sourceKind: 'trustee_pack',
    sourceId: pack.id,
    generatedBy: pack.approval.preparedBy ?? 'system',
    version: 1,
    final: pack.approval.status === 'approved',
  });

  return {
    metadata,
    validationSnapshot: [],
    sections: [
      {
        id: 'commentary',
        template: 'notes-page',
        title: 'Commentary',
        body: pack.commentary.map((item) => `${item.title}: ${item.adminOverrideText ?? item.editableText}`),
      },
      ...pack.sections.map<DocumentSection>((section) => ({
        id: section.key,
        template: 'statement-page',
        title: section.title,
        body: section.narrative,
        tables: section.table ? [{ title: section.title, headers: section.table.headers, rows: section.table.rows }] : undefined,
      })),
    ],
  };
}
