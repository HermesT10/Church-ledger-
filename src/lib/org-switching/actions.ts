'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { listUserOrganisations } from '@/lib/org';
import { logAuditEvent } from '@/lib/audit';
import { trackProductEvent } from '@/lib/analytics/server';

export async function switchActiveOrganisation(
  organisationId: string,
): Promise<{ error: string | null }> {
  const user = await requireSession();
  const memberships = await listUserOrganisations();
  const target = memberships.find((membership) => membership.orgId === organisationId);

  if (!target) {
    return { error: 'You do not have access to that organisation.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ active_organisation_id: organisationId })
    .eq('id', user.id);

  if (error) {
    return { error: error.message };
  }

  await Promise.all([
    logAuditEvent({
      orgId: organisationId,
      userId: user.id,
      action: 'switch_active_organisation',
      entityType: 'profile',
      entityId: user.id,
      metadata: {
        organisationName: target.orgName,
      },
    }),
    trackProductEvent({
      organisationId,
      userId: user.id,
      eventType: 'org_switch',
      moduleKey: 'workspace',
      path: '/dashboard',
      metadata: {
        organisationName: target.orgName,
      },
    }),
  ]);

  revalidatePath('/', 'layout');
  return { error: null };
}
