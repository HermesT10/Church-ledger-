import type { DocumentProductionMetadata, DocumentSourceKind } from './types';

export function formatPeriodLabel(params: {
  periodStart?: string | null;
  periodEnd?: string | null;
  financialYear?: number | null;
}) {
  if (params.periodStart && params.periodEnd) {
    return `${params.periodStart} to ${params.periodEnd}`;
  }
  if (params.financialYear) {
    return `Financial year ${params.financialYear}`;
  }
  return 'Reporting period';
}

export function buildDocumentMetadata(params: {
  organisationId: string;
  organisationName: string;
  charityNumber?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  financialYear?: number | null;
  reportTitle: string;
  reportType?: string | null;
  sourceKind: DocumentSourceKind;
  sourceId?: string | null;
  generatedBy: string;
  version: number;
  final?: boolean;
  confidentialityText?: string;
}): DocumentProductionMetadata {
  const generatedAt = new Date().toISOString();
  return {
    organisationId: params.organisationId,
    organisationName: params.organisationName,
    charityNumber: params.charityNumber ?? null,
    periodLabel: formatPeriodLabel(params),
    periodStart: params.periodStart ?? null,
    periodEnd: params.periodEnd ?? null,
    reportTitle: params.reportTitle,
    reportType: params.reportType ?? null,
    sourceKind: params.sourceKind,
    sourceId: params.sourceId ?? null,
    generatedAt,
    generatedBy: params.generatedBy,
    version: params.version,
    status: params.final ? 'final' : 'draft',
    confidentialityText: params.confidentialityText ?? 'Confidential: prepared for authorised church finance, trustee, and examiner review.',
    footerText: `${params.reportTitle} · Version ${params.version} · Generated ${generatedAt}`,
  };
}
