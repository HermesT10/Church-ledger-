import type { ReportValidationResult } from '@/lib/reports/engine/types';

export type DocumentExportFormat = 'pdf' | 'docx' | 'excel' | 'csv';

export type DocumentExportStatus = 'draft' | 'generated' | 'approved' | 'final' | 'archived';

export type DocumentSourceKind =
  | 'report_version'
  | 'annual_accounts'
  | 'trustee_pack'
  | 'year_end_filing_pack'
  | 'gift_aid_schedule'
  | 'audit_log'
  | 'fund_summary'
  | 'payroll_report'
  | 'bank_reconciliation_certificate'
  | 'evidence_index';

export type DocumentTemplateKey =
  | 'report-cover'
  | 'report-contents'
  | 'statement-page'
  | 'notes-page'
  | 'appendix-page'
  | 'signature-approval-page'
  | 'evidence-index'
  | 'export-footer';

export interface DocumentProductionMetadata {
  organisationId: string;
  organisationName: string;
  charityNumber?: string | null;
  periodLabel: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  reportTitle: string;
  reportType?: string | null;
  sourceKind: DocumentSourceKind;
  sourceId?: string | null;
  generatedAt: string;
  generatedBy: string;
  version: number;
  status: Extract<DocumentExportStatus, 'draft' | 'final'>;
  confidentialityText?: string;
  footerText?: string;
}

export interface DocumentTable {
  title: string;
  headers: string[];
  rows: Array<Array<string | number | null>>;
  formulas?: Array<{ cell: string; formula: string; result?: number }>;
}

export interface DocumentSection {
  id: string;
  template: DocumentTemplateKey;
  title: string;
  body?: string[];
  tables?: DocumentTable[];
  notes?: string[];
}

export interface DocumentModel {
  metadata: DocumentProductionMetadata;
  sections: DocumentSection[];
  evidenceIndex?: DocumentTable;
  validationSnapshot: ReportValidationResult[];
}

export interface DocumentRenderResult {
  format: DocumentExportFormat;
  fileName: string;
  contentType: string;
  payload: Uint8Array;
  checksumSha256: string;
  metadata: DocumentProductionMetadata;
  validationSnapshot: ReportValidationResult[];
}

export interface ExportVersionRecord {
  id: string;
  workspaceId: string;
  sourceReportId?: string | null;
  sourceReportType?: string | null;
  sourceKind: DocumentSourceKind;
  format: DocumentExportFormat;
  fileName: string;
  filePath: string;
  contentType: string;
  checksumSha256: string;
  status: DocumentExportStatus;
  version: number;
  generatedAt: string;
}
