import { NextResponse } from 'next/server';
import { logAuditEvent } from '@/lib/audit';
import { getActiveOrg } from '@/lib/org';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { enforcePortalPermissionForContext } from '@/lib/portal-permissions';
import {
  EVIDENCE_MODULE_BY_ENTITY_TYPE,
  FINANCIAL_EVIDENCE_BUCKET,
} from '@/lib/evidence/config';

function parseEvidencePath(path: string | null): {
  orgId: string;
  entityType: string;
  storagePath: string;
} | null {
  if (!path) {
    return null;
  }

  const parts = path.split('/');
  if (parts.length < 3 || !parts[0] || !parts[1]) {
    return null;
  }

  return {
    orgId: parts[0],
    entityType: parts[1],
    storagePath: path,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = parseEvidencePath(searchParams.get('path'));

  if (!parsed) {
    return NextResponse.json({ error: 'Invalid evidence path.' }, { status: 400 });
  }

  const { orgId, role, user } = await getActiveOrg();
  if (parsed.orgId !== orgId) {
    return NextResponse.json({ error: 'Evidence not found.' }, { status: 404 });
  }

  const targetModule = EVIDENCE_MODULE_BY_ENTITY_TYPE[parsed.entityType];
  if (!targetModule) {
    return NextResponse.json({ error: 'Unsupported evidence type.' }, { status: 400 });
  }

  try {
    assertCanPerform(role, 'read', targetModule);
    await enforcePortalPermissionForContext({ orgId, role, user }, 'documents', 'view');
  } catch (error) {
    const message = error instanceof PermissionError ? error.message : 'Permission denied.';
    return NextResponse.json({ error: message }, { status: 403 });
  }

  const supabase = await createClient();
  if (parsed.entityType === 'invoice-submissions' && role !== 'admin' && role !== 'treasurer') {
    const submissionId = parsed.storagePath.split('/')[2];
    const { data: attachment } = await supabase
      .from('invoice_submission_attachments')
      .select('id')
      .eq('organisation_id', orgId)
      .eq('storage_path', parsed.storagePath)
      .eq('submission_id', submissionId)
      .maybeSingle();

    if (!attachment) {
      return NextResponse.json({ error: 'Evidence not found.' }, { status: 404 });
    }
  }
  if (parsed.entityType === 'cash-collection-submissions' && role !== 'admin' && role !== 'treasurer') {
    const submissionId = parsed.storagePath.split('/')[2];
    const { data: submission } = await supabase
      .from('cash_collection_submissions')
      .select('id')
      .eq('workspace_id', orgId)
      .eq('id', submissionId)
      .eq('submitted_by', user.id)
      .eq('attachment_path', parsed.storagePath)
      .maybeSingle();

    if (!submission) {
      return NextResponse.json({ error: 'Evidence not found.' }, { status: 404 });
    }
  }
  if (parsed.entityType === 'portal-expense-submissions' && role !== 'admin' && role !== 'treasurer') {
    const submissionId = parsed.storagePath.split('/')[2];
    const { data: submission } = await supabase
      .from('portal_expense_submissions')
      .select('id')
      .eq('workspace_id', orgId)
      .eq('id', submissionId)
      .eq('submitted_by', user.id)
      .eq('receipt_path', parsed.storagePath)
      .maybeSingle();

    if (!submission) {
      return NextResponse.json({ error: 'Evidence not found.' }, { status: 404 });
    }
  }

  const { data, error } = await supabase.storage
    .from(FINANCIAL_EVIDENCE_BUCKET)
    .createSignedUrl(parsed.storagePath, 60);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? 'Evidence not found.' }, { status: 404 });
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'view_financial_evidence',
    entityType: 'evidence',
    entityId: parsed.storagePath,
    metadata: {
      targetEntityType: parsed.entityType,
    },
  });

  return NextResponse.redirect(data.signedUrl);
}
