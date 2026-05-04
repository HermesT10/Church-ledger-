import { createAdminClient } from '@/lib/supabase/admin';
import { safeFilePart } from './hash';
import type { DocumentRenderResult, DocumentSourceKind } from './types';

export const DOCUMENT_EXPORTS_BUCKET = 'document-exports';

export function buildDocumentExportPath(params: {
  workspaceId: string;
  sourceKind: DocumentSourceKind;
  sourceId?: string | null;
  version: number;
  fileName: string;
}) {
  const sourceId = safeFilePart(params.sourceId ?? 'general');
  return `${params.workspaceId}/${params.sourceKind}/${sourceId}/v${params.version}/${safeFilePart(params.fileName)}`;
}

export async function uploadDocumentExport(params: {
  workspaceId: string;
  sourceKind: DocumentSourceKind;
  sourceId?: string | null;
  result: DocumentRenderResult;
}): Promise<{ path: string | null; error: string | null }> {
  const path = buildDocumentExportPath({
    workspaceId: params.workspaceId,
    sourceKind: params.sourceKind,
    sourceId: params.sourceId,
    version: params.result.metadata.version,
    fileName: params.result.fileName,
  });
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(DOCUMENT_EXPORTS_BUCKET)
    .upload(path, params.result.payload, {
      contentType: params.result.contentType,
      upsert: true,
    });

  if (error) return { path: null, error: error.message };
  return { path, error: null };
}

export async function createDocumentExportSignedUrl(filePath: string, expiresInSeconds = 60) {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(DOCUMENT_EXPORTS_BUCKET)
    .createSignedUrl(filePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return { url: null, error: error?.message ?? 'Document export not found.' };
  }

  return { url: data.signedUrl, error: null };
}
