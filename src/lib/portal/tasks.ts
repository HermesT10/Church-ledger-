'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveOrg } from '@/lib/org';
import type { PortalTask, PortalTaskStatus } from '@/lib/portal/types';

export async function listPortalTasks(limit = 8): Promise<PortalTask[]> {
  const { orgId, user } = await getActiveOrg();
  const supabase = await createClient();
  const { data } = await supabase
    .from('portal_tasks')
    .select('id, title, description, due_at, status, assigned_by, updated_by, calendar_events(id, title, start_at)')
    .eq('workspace_id', orgId)
    .eq('assigned_to', user.id)
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(limit);

  return (data ?? []).map((row) => {
    const event = Array.isArray(row.calendar_events) ? row.calendar_events[0] : row.calendar_events;
    return {
      id: row.id,
      title: row.title,
      description: row.description ?? null,
      dueAt: row.due_at ?? null,
      status: row.status as PortalTaskStatus,
      assignedBy: row.assigned_by ?? null,
      updatedBy: row.updated_by ?? null,
      calendarEvent: event ? {
        id: event.id,
        title: event.title,
        startAt: event.start_at,
        href: `/portal/calendar?event=${event.id}`,
      } : null,
    };
  });
}

export async function updatePortalTaskStatus(taskId: string, status: PortalTaskStatus) {
  const { orgId, user } = await getActiveOrg();
  const supabase = await createClient();
  const { error } = await supabase
    .from('portal_tasks')
    .update({
      status,
      updated_by: user.id,
      completed_at: status === 'done' ? new Date().toISOString() : null,
    })
    .eq('workspace_id', orgId)
    .eq('assigned_to', user.id)
    .eq('id', taskId);

  revalidatePath('/portal/dashboard');
  return { error: error?.message ?? null };
}
