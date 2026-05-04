'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getActiveOrg } from '@/lib/org';
import type { PortalNotification, PortalNotificationType } from '@/lib/portal/types';

export async function createPortalNotification(params: {
  workspaceId: string;
  userId: string | null | undefined;
  type: PortalNotificationType;
  title: string;
  body?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  href?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!params.userId) return { error: null };

  const admin = createAdminClient();
  const { error } = await admin.from('portal_notifications').insert({
    workspace_id: params.workspaceId,
    user_id: params.userId,
    type: params.type,
    title: params.title,
    body: params.body ?? null,
    source_type: params.sourceType ?? null,
    source_id: params.sourceId ?? null,
    href: params.href ?? null,
    metadata: params.metadata ?? {},
  });

  return { error: error?.message ?? null };
}

export async function listPortalNotifications(limit = 12): Promise<PortalNotification[]> {
  const { orgId, user } = await getActiveOrg();
  const supabase = await createClient();
  const { data } = await supabase
    .from('portal_notifications')
    .select('id, type, title, body, href, read_at, created_at')
    .eq('workspace_id', orgId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => ({
    id: row.id,
    type: row.type as PortalNotificationType,
    title: row.title,
    body: row.body ?? null,
    href: row.href ?? null,
    readAt: row.read_at ?? null,
    createdAt: row.created_at,
  }));
}

export async function markPortalNotificationRead(notificationId: string) {
  const { orgId, user } = await getActiveOrg();
  const supabase = await createClient();
  const { error } = await supabase
    .from('portal_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('workspace_id', orgId)
    .eq('user_id', user.id)
    .eq('id', notificationId);

  revalidatePath('/portal/dashboard');
  return { error: error?.message ?? null };
}
