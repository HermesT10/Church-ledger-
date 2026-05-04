'use server';

import { assertWriteAllowed } from '@/lib/demo';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit';
import { logServerFailure } from '@/lib/monitoring';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { enforcePortalPermissionForContext } from '@/lib/portal-permissions';
import {
  buildEvidenceAccessPath,
  EVIDENCE_MODULE_BY_ENTITY_TYPE,
  FINANCIAL_EVIDENCE_BUCKET,
} from '@/lib/evidence/config';

function slugifyFileName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function uploadFinancialEvidence(
  formData: FormData,
): Promise<{ url: string | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  const file = formData.get('file');
  const entityType = String(formData.get('entityType') ?? 'general').trim() || 'general';
  const targetModule = EVIDENCE_MODULE_BY_ENTITY_TYPE[entityType];

  if (!targetModule) {
    return { url: null, error: 'Unsupported evidence type.' };
  }

  try {
    assertCanPerform(role, 'create', targetModule);
    await enforcePortalPermissionForContext({ orgId, role, user }, 'documents', 'upload');
  } catch (error) {
    return {
      url: null,
      error: error instanceof PermissionError ? error.message : 'Permission denied.',
    };
  }

  if (!(file instanceof File)) {
    return { url: null, error: 'No file provided.' };
  }

  if (file.size === 0) {
    return { url: null, error: 'The selected file is empty.' };
  }

  const maxBytes = 10 * 1024 * 1024;
  if (file.size > maxBytes) {
    return { url: null, error: 'Files must be smaller than 10MB.' };
  }

  const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
  const safeBase = slugifyFileName(file.name.replace(/\.[^.]+$/, '')) || 'evidence';
  const safeExt = ext ? `.${slugifyFileName(ext)}` : '';
  const path = `${orgId}/${entityType}/${Date.now()}-${safeBase}${safeExt}`;

  const supabase = await createClient();
  const bytes = await file.arrayBuffer();

  const { error } = await supabase.storage
    .from(FINANCIAL_EVIDENCE_BUCKET)
    .upload(path, bytes, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

  if (error) {
    await logServerFailure({
      area: 'evidence',
      event: 'upload_failed',
      error,
      metadata: {
        orgId,
        userId: user.id,
        entityType,
        path,
      },
      capture: false,
    });
    return { url: null, error: error.message };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'upload_financial_evidence',
    entityType: 'evidence',
    entityId: path,
    metadata: {
      targetEntityType: entityType,
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type || 'application/octet-stream',
    },
  });
  return { url: buildEvidenceAccessPath(path), error: null };
}
