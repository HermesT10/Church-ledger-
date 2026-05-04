import { NextResponse } from 'next/server';
import { logAuditEvent } from '@/lib/audit';
import { createDocumentExportSignedUrl } from '@/lib/document-production/storage';
import { assertCanDownloadDocumentExport } from '@/lib/document-production/actions';
import { getExportVersionForDownload } from '@/lib/document-production/versioning';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ exportVersionId: string }> },
) {
  const { exportVersionId } = await params;
  const auth = await assertCanDownloadDocumentExport();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: 403 });
  }

  const exportVersion = await getExportVersionForDownload({
    workspaceId: auth.ctx.orgId,
    exportVersionId,
    canManageReports: auth.canManageReports,
  });
  if (!exportVersion.data) {
    return NextResponse.json({ error: exportVersion.error ?? 'Export not found.' }, { status: 404 });
  }

  const signed = await createDocumentExportSignedUrl(exportVersion.data.filePath, 60);
  if (!signed.url) {
    return NextResponse.json({ error: signed.error ?? 'Export not found.' }, { status: 404 });
  }

  await logAuditEvent({
    orgId: auth.ctx.orgId,
    userId: auth.ctx.user.id,
    action: 'document_export_downloaded',
    entityType: 'export_version',
    entityId: exportVersion.data.id,
    metadata: {
      format: exportVersion.data.format,
      sourceKind: exportVersion.data.sourceKind,
      sourceReportId: exportVersion.data.sourceReportId,
    },
  });

  return NextResponse.redirect(signed.url);
}
