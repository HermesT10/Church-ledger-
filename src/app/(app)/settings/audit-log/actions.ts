'use server';

import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import type { AuditLogEntry, AuditLogResult } from './types';

/* ------------------------------------------------------------------ */
/*  getAuditLog                                                        */
/* ------------------------------------------------------------------ */

export async function getAuditLog(
  orgId: string,
  opts: { page?: number; limit?: number } = {},
): Promise<AuditLogResult> {
  const { role } = await getActiveOrg();

  try {
    assertCanPerform(role, 'read', 'settings');
  } catch (e) {
    return {
      data: [],
      total: 0,
      error: e instanceof PermissionError ? e.message : 'Permission denied.',
    };
  }

  const page = opts.page ?? 1;
  const limit = opts.limit ?? 50;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const supabase = await createClient();

  // Get total count
  const { count } = await supabase
    .from('audit_log')
    .select('*', { count: 'exact', head: true })
    .eq('organisation_id', orgId);

  // Get paginated data with user profiles
  const { data, error } = await supabase
    .from('audit_log')
    .select('*, profiles(full_name)')
    .eq('organisation_id', orgId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    return { data: [], total: 0, error: error.message };
  }

  const entries: AuditLogEntry[] = (data ?? []).map((row: Record<string, unknown>) => {
    const profile = row.profiles as { full_name: string | null } | null;
    return {
      id: row.id as string,
      userId: row.user_id as string,
      userName: profile?.full_name ?? null,
      action: row.action as string,
      entityType: (row.entity_type as string) ?? null,
      entityId: (row.entity_id as string) ?? null,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      environment: row.environment as string,
      createdAt: row.created_at as string,
    };
  });

  return { data: entries, total: count ?? 0, error: null };
}
