import { createAdminClient } from '@/lib/supabase/admin';
import { getAppEnv } from '@/lib/env';

/* ------------------------------------------------------------------ */
/*  logAuditEvent                                                      */
/* ------------------------------------------------------------------ */

export interface AuditEventParams {
  orgId: string;
  userId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Writes an immutable audit log entry.
 * Uses the admin client to bypass RLS.
 * Automatically captures the current environment.
 *
 * This is fire-and-forget -- errors are logged to console
 * but never thrown, so the calling action is not disrupted.
 */
export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('audit_log').insert({
      organisation_id: params.orgId,
      user_id: params.userId,
      action: params.action,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      metadata: params.metadata ?? {},
      environment: getAppEnv(),
    });
  } catch (err) {
    // Never let audit logging break the primary action
    console.error('[AUDIT] Failed to write audit event:', err);
  }
}
