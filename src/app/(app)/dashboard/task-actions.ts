'use server';

import { revalidatePath } from 'next/cache';
import { getActiveOrg } from '@/lib/org';
import { canPerform } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { invalidateOrgReportCache } from '@/lib/cache';

export async function setDashboardTaskCompletion(taskId: string, completed: boolean): Promise<{ error?: string }> {
  const ctx = await getActiveOrg();
  const permission = canPerform(ctx.role, 'update', 'workflows');
  if (!permission.allowed) {
    return { error: permission.reason ?? 'You do not have permission to update dashboard tasks.' };
  }

  const supabase = await createClient();
  const { data: task, error: taskError } = await supabase
    .from('dashboard_tasks')
    .select('id, calendar_event_id')
    .eq('workspace_id', ctx.orgId)
    .eq('id', taskId)
    .maybeSingle();

  if (taskError || !task) {
    return { error: taskError?.message ?? 'Dashboard task not found.' };
  }

  const completedAt = completed ? new Date().toISOString() : null;
  const { error } = await supabase
    .from('dashboard_tasks')
    .update({
      status: completed ? 'completed' : 'active',
      completed_at: completedAt,
      completed_by: completed ? ctx.user.id : null,
    })
    .eq('workspace_id', ctx.orgId)
    .eq('id', taskId);

  if (error) {
    return { error: error.message };
  }

  if (task.calendar_event_id) {
    await supabase
      .from('calendar_events')
      .update({
        status: completed ? 'completed' : 'scheduled',
        updated_by: ctx.user.id,
      })
      .eq('workspace_id', ctx.orgId)
      .eq('id', task.calendar_event_id);
  }

  invalidateOrgReportCache(ctx.orgId);
  revalidatePath('/dashboard');
  revalidatePath('/calendar');
  return {};
}
