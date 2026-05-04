import { buildDocumentMetadata } from './metadata';
import type { DocumentModel, DocumentSourceKind, DocumentTable } from './types';

function rowsFromRecords(records: Array<Record<string, unknown>>): DocumentTable {
  const headers = Array.from(new Set(records.flatMap((record) => Object.keys(record))));
  return {
    title: 'Schedule',
    headers,
    rows: records.map((record) => headers.map((header) => {
      const value = record[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    })),
  };
}

export function documentFromSchedule(params: {
  workspaceId: string;
  organisationName: string;
  charityNumber?: string | null;
  title: string;
  sourceKind: DocumentSourceKind;
  sourceId?: string | null;
  generatedBy: string;
  periodLabel?: string;
  final?: boolean;
  records: Array<Record<string, unknown>>;
  notes?: string[];
}): DocumentModel {
  return {
    metadata: {
      ...buildDocumentMetadata({
        organisationId: params.workspaceId,
        organisationName: params.organisationName,
        charityNumber: params.charityNumber ?? null,
        reportTitle: params.title,
        sourceKind: params.sourceKind,
        sourceId: params.sourceId ?? null,
        generatedBy: params.generatedBy,
        version: 1,
        final: params.final ?? false,
      }),
      periodLabel: params.periodLabel ?? 'Reporting period',
    },
    validationSnapshot: [],
    sections: [
      {
        id: `${params.sourceKind}-schedule`,
        template: 'statement-page',
        title: params.title,
        notes: params.notes,
        tables: [rowsFromRecords(params.records)],
      },
    ],
  };
}

export function documentFromGiftAidSchedule(params: Omit<Parameters<typeof documentFromSchedule>[0], 'sourceKind'>) {
  return documentFromSchedule({ ...params, sourceKind: 'gift_aid_schedule' });
}

export function documentFromAuditLog(params: Omit<Parameters<typeof documentFromSchedule>[0], 'sourceKind'>) {
  return documentFromSchedule({ ...params, sourceKind: 'audit_log' });
}

export function documentFromFundSummary(params: Omit<Parameters<typeof documentFromSchedule>[0], 'sourceKind'>) {
  return documentFromSchedule({ ...params, sourceKind: 'fund_summary' });
}

export function documentFromPayrollReport(params: Omit<Parameters<typeof documentFromSchedule>[0], 'sourceKind'>) {
  return documentFromSchedule({ ...params, sourceKind: 'payroll_report' });
}

export function documentFromBankReconciliationCertificate(params: Omit<Parameters<typeof documentFromSchedule>[0], 'sourceKind'>) {
  return documentFromSchedule({ ...params, sourceKind: 'bank_reconciliation_certificate' });
}

export function documentFromEvidenceIndex(params: Omit<Parameters<typeof documentFromSchedule>[0], 'sourceKind'>) {
  return documentFromSchedule({ ...params, sourceKind: 'evidence_index' });
}
