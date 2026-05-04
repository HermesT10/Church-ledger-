'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assertWriteAllowed } from '@/lib/demo';
import { getActiveOrg } from '@/lib/org';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit';

export async function skipDashboardSetupAction(): Promise<void> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'update', 'settings');
  } catch (error) {
    redirect(`/dashboard?error=${encodeURIComponent(error instanceof PermissionError ? error.message : 'Permission denied.')}`);
  }

  const supabase = await createClient();
  await supabase
    .from('organisations')
    .update({
      setup_mode: false,
      setup_completed_at: new Date().toISOString(),
    })
    .eq('id', orgId);

  await supabase.from('workspace_setup_progress').upsert(
    {
      workspace_id: orgId,
      skipped: true,
      updated_by: user.id,
    },
    { onConflict: 'workspace_id' },
  );

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'workspace_setup_skipped',
    entityType: 'workspace_setup_progress',
    entityId: orgId,
  });

  revalidatePath('/dashboard');
  redirect('/dashboard');
}
