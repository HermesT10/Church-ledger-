'use server';

import { getActiveOrg } from '@/lib/org';
import { logAuditEvent } from '@/lib/audit';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { documentFromReportSnapshot } from './adapters';
import { renderDocument } from './renderers';
import { uploadDocumentExport } from './storage';
import { createExportVersion, getNextExportVersion } from './versioning';
import type { DocumentExportFormat, ExportVersionRecord } from './types';
import type {
  ReportFilters,
  ReportSnapshot,
  ReportStatus,
  ReportTypeKey,
  ReportValidationResult,
} from '@/lib/reports/engine/types';
import { getReportDefinition } from '@/lib/reports/engine/registry';

function isReportManager(role: string | null | undefined) {
  return role === 'admin' || role === 'treasurer';
}

export async function generateStoredReportDocumentExport(params: {
  reportId: string;
  format: DocumentExportFormat;
}): Promise<{ data: ExportVersionRecord | null; error: string | null }> {
  const ctx = await getActiveOrg();
  if (!isReportManager(ctx.role)) {
    return { data: null, error: 'Only admins and treasurers can generate document exports.' };
  }

  const admin = createAdminClient();
  const { data: organisation } = await admin
    .from('organisations')
    .select('name, charity_number')
    .eq('id', ctx.orgId)
    .maybeSingle();

  const { data: row, error: fetchError } = await admin
    .from('report_versions')
    .select('*')
    .eq('workspace_id', ctx.orgId)
    .eq('id', params.reportId)
    .single();

  if (fetchError || !row) {
    return { data: null, error: fetchError?.message ?? 'Report version not found.' };
  }

  const status = row.status as ReportStatus;
  const final = ['approved', 'exported', 'archived'].includes(status);
  if (!final && params.format !== 'csv') {
    return { data: null, error: 'Approve the report before generating final PDF, Word, or Excel exports.' };
  }

  const snapshotPayload = row.snapshot_payload as { data?: unknown; commentary?: string[] } | null;
  const nextVersion = await getNextExportVersion({
    workspaceId: ctx.orgId,
    sourceKind: 'report_version',
    sourceId: params.reportId,
    format: params.format,
  });
  const snapshot: ReportSnapshot = {
    metadata: {
      report_id: row.id as string,
      workspace_id: row.workspace_id as string,
      report_type: row.report_type as ReportTypeKey,
      report_title: row.report_title as string,
      period_start: row.period_start as string,
      period_end: row.period_end as string,
      financial_year: row.financial_year as number | null,
      basis: row.basis as 'cash' | 'accruals',
      funds_included: row.funds_included as string[],
      filters_applied: row.filters_applied as ReportFilters,
      generated_by: ctx.user.id,
      generated_at: new Date().toISOString(),
      prepared_by: row.prepared_by as string,
      reviewed_by: row.reviewed_by as string | null,
      approved_by: row.approved_by as string | null,
      status,
      version: nextVersion,
    },
    definition: getReportDefinition(row.report_type as ReportTypeKey),
    data: snapshotPayload?.data ?? {},
    validation: (row.validation_summary ?? []) as ReportValidationResult[],
    traceability: [],
    commentary: snapshotPayload?.commentary ?? [],
    generated_at: new Date().toISOString(),
  };
  const model = documentFromReportSnapshot({
    snapshot,
    organisationName: String(organisation?.name ?? ctx.orgName),
    charityNumber: (organisation?.charity_number as string | null | undefined) ?? null,
  });
  const rendered = await renderDocument(model, params.format);
  const uploaded = await uploadDocumentExport({
    workspaceId: ctx.orgId,
    sourceKind: 'report_version',
    sourceId: params.reportId,
    result: rendered,
  });
  if (!uploaded.path) return { data: null, error: uploaded.error };

  const exportVersion = await createExportVersion({
    workspaceId: ctx.orgId,
    sourceKind: 'report_version',
    sourceReportId: params.reportId,
    sourceReportType: row.report_type as string,
    filePath: uploaded.path,
    result: rendered,
    generatedBy: ctx.user.id,
    status: final ? 'final' : 'draft',
  });
  if (!exportVersion.data) return exportVersion;

  await admin.from('report_exports').insert({
    workspace_id: ctx.orgId,
    report_version_id: params.reportId,
    report_type: row.report_type,
    format: params.format,
    file_name: rendered.fileName,
    storage_path: uploaded.path,
    checksum_sha256: rendered.checksumSha256,
    export_payload: {
      exportVersionId: exportVersion.data.id,
      contentType: rendered.contentType,
      bytes: rendered.payload.byteLength,
    },
    generated_by: ctx.user.id,
  });

  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'document_export_generated',
    entityType: 'export_version',
    entityId: exportVersion.data.id,
    metadata: { reportId: params.reportId, format: params.format, filePath: uploaded.path },
  });

  return exportVersion;
}

export async function listDocumentExportsForReport(reportId: string): Promise<{ data: ExportVersionRecord[]; error: string | null }> {
  const ctx = await getActiveOrg();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('export_versions')
    .select('id, workspace_id, source_report_id, source_report_type, source_kind, format, file_name, file_path, content_type, checksum_sha256, status, version, generated_at')
    .eq('workspace_id', ctx.orgId)
    .eq('source_kind', 'report_version')
    .eq('source_report_id', reportId)
    .order('generated_at', { ascending: false });

  if (error) return { data: [], error: error.message };
  return {
    data: (data ?? []).map((row) => ({
      id: row.id as string,
      workspaceId: row.workspace_id as string,
      sourceReportId: row.source_report_id as string | null,
      sourceReportType: row.source_report_type as string | null,
      sourceKind: row.source_kind as ExportVersionRecord['sourceKind'],
      format: row.format as ExportVersionRecord['format'],
      fileName: row.file_name as string,
      filePath: row.file_path as string,
      contentType: row.content_type as string,
      checksumSha256: row.checksum_sha256 as string,
      status: row.status as ExportVersionRecord['status'],
      version: row.version as number,
      generatedAt: row.generated_at as string,
    })),
    error: null,
  };
}

export async function assertCanDownloadDocumentExport() {
  const ctx = await getActiveOrg();
  try {
    assertCanPerform(ctx.role, 'read', 'reports');
  } catch (error) {
    return {
      ctx,
      canManageReports: false,
      error: error instanceof PermissionError ? error.message : 'Permission denied.',
    };
  }
  return { ctx, canManageReports: isReportManager(ctx.role), error: null };
}
