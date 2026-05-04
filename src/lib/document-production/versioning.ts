import { createAdminClient } from '@/lib/supabase/admin';
import type { DocumentExportFormat, DocumentExportStatus, DocumentRenderResult, DocumentSourceKind, ExportVersionRecord } from './types';

type ExportVersionRow = {
  id: string;
  workspace_id: string;
  source_report_id: string | null;
  source_report_type: string | null;
  source_kind: DocumentSourceKind;
  format: DocumentExportFormat;
  file_name: string;
  file_path: string;
  content_type: string;
  checksum_sha256: string;
  status: DocumentExportStatus;
  version: number;
  generated_at: string;
};

function mapExportVersion(row: ExportVersionRow): ExportVersionRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    sourceReportId: row.source_report_id,
    sourceReportType: row.source_report_type,
    sourceKind: row.source_kind,
    format: row.format,
    fileName: row.file_name,
    filePath: row.file_path,
    contentType: row.content_type,
    checksumSha256: row.checksum_sha256,
    status: row.status,
    version: row.version,
    generatedAt: row.generated_at,
  };
}

export async function getNextExportVersion(params: {
  workspaceId: string;
  sourceKind: DocumentSourceKind;
  sourceId?: string | null;
  format: DocumentExportFormat;
}) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('export_versions')
    .select('version')
    .eq('workspace_id', params.workspaceId)
    .eq('source_kind', params.sourceKind)
    .eq('format', params.format)
    .eq('source_report_id', params.sourceId ?? null)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  return Number(data?.version ?? 0) + 1;
}

export async function createExportVersion(params: {
  workspaceId: string;
  sourceKind: DocumentSourceKind;
  sourceReportId?: string | null;
  sourceReportType?: string | null;
  filePath: string;
  result: DocumentRenderResult;
  generatedBy: string;
  status?: DocumentExportStatus;
}): Promise<{ data: ExportVersionRecord | null; error: string | null }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('export_versions')
    .insert({
      workspace_id: params.workspaceId,
      source_report_id: params.sourceReportId ?? null,
      source_report_type: params.sourceReportType ?? null,
      source_kind: params.sourceKind,
      format: params.result.format,
      file_name: params.result.fileName,
      file_path: params.filePath,
      content_type: params.result.contentType,
      checksum_sha256: params.result.checksumSha256,
      status: params.status ?? (params.result.metadata.status === 'final' ? 'final' : 'generated'),
      version: params.result.metadata.version,
      validation_snapshot: params.result.validationSnapshot,
      metadata: params.result.metadata,
      generated_by: params.generatedBy,
      generated_at: params.result.metadata.generatedAt,
    })
    .select('id, workspace_id, source_report_id, source_report_type, source_kind, format, file_name, file_path, content_type, checksum_sha256, status, version, generated_at')
    .single();

  if (error) return { data: null, error: error.message };
  return { data: mapExportVersion(data as ExportVersionRow), error: null };
}

export async function getExportVersionForDownload(params: {
  workspaceId: string;
  exportVersionId: string;
  canManageReports: boolean;
}): Promise<{ data: ExportVersionRecord | null; error: string | null }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('export_versions')
    .select('id, workspace_id, source_report_id, source_report_type, source_kind, format, file_name, file_path, content_type, checksum_sha256, status, version, generated_at')
    .eq('workspace_id', params.workspaceId)
    .eq('id', params.exportVersionId)
    .maybeSingle();

  if (error || !data) return { data: null, error: error?.message ?? 'Export version not found.' };
  const row = data as ExportVersionRow;
  if (!params.canManageReports && !['approved', 'final'].includes(row.status)) {
    return { data: null, error: 'This export is not available for download yet.' };
  }

  return { data: mapExportVersion(row), error: null };
}
