'use server';

import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { assertWriteAllowed } from '@/lib/demo';
import { logAuditEvent } from '@/lib/audit';

export interface ErasureRequestRow {
  id: string;
  organisation_id: string;
  requester_user_id: string;
  scope: string;
  status: string;
  reason: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  notes: string | null;
  requester_name?: string | null;
}

export async function listErasureRequests(orgId: string): Promise<{
  data: ErasureRequestRow[];
  error: string | null;
}> {
  const { role } = await getActiveOrg();
  try {
    assertCanPerform(role, 'read', 'settings');
  } catch {
    return { data: [], error: 'Permission denied' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('data_erasure_requests')
    .select(`
      id,
      organisation_id,
      requester_user_id,
      scope,
      status,
      reason,
      created_at,
      resolved_at,
      resolved_by,
      notes
    `)
    .eq('organisation_id', orgId)
    .order('created_at', { ascending: false });

  if (error) return { data: [], error: error.message };

  const rows = data ?? [];
  const userIds = [...new Set(rows.map((r) => r.requester_user_id))];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds);

  const profileMap = new Map(profiles?.map((p) => [p.id, p.full_name]) ?? []);

  return {
    data: rows.map((r) => ({
      ...r,
      requester_name: profileMap.get(r.requester_user_id) ?? null,
    })),
    error: null,
  };
}

export async function resolveErasureRequest(
  requestId: string,
  status: 'completed' | 'rejected',
  notes?: string,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanPerform(role, 'update', 'settings');
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : 'Permission denied' };
  }

  const supabase = await createClient();

  const { data: req, error: fetchErr } = await supabase
    .from('data_erasure_requests')
    .select('id, organisation_id, status')
    .eq('id', requestId)
    .single();

  if (fetchErr || !req) {
    return { error: fetchErr?.message ?? 'Request not found' };
  }

  if (req.organisation_id !== orgId) {
    return { error: 'Request does not belong to your organisation' };
  }

  if (req.status !== 'pending' && req.status !== 'in_progress') {
    return { error: 'Request has already been resolved' };
  }

  const { error: updateErr } = await supabase
    .from('data_erasure_requests')
    .update({
      status,
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
      notes: notes?.trim() || null,
    })
    .eq('id', requestId);

  if (updateErr) return { error: updateErr.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'data_erasure_request_resolved',
    entityType: 'data_erasure_request',
    entityId: requestId,
    metadata: { newStatus: status, notes: notes?.trim() || null },
  });

  return { error: null };
}
