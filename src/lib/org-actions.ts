'use server';

import { createClient } from '@/lib/supabase/server';
import {
  clearActiveOrgCookie,
  getActiveOrg,
  setActiveOrgCookie,
} from '@/lib/org';

export async function switchActiveOrg(
  orgId: string,
): Promise<{ error: string | null }> {
  const { user, availableOrgs } = await getActiveOrg();

  if (!orgId) {
    return { error: 'Organisation is required.' };
  }

  const allowedOrg = availableOrgs.find((org) => org.orgId === orgId);
  if (!allowedOrg) {
    return { error: 'You do not have access to that organisation.' };
  }

  const supabase = await createClient();
  const { data: membership, error } = await supabase
    .from('memberships')
    .select('organisation_id')
    .eq('user_id', user.id)
    .eq('organisation_id', orgId)
    .eq('status', 'active')
    .maybeSingle();

  if (error || !membership) {
    return { error: error?.message ?? 'Active membership not found.' };
  }

  await setActiveOrgCookie(orgId);
  return { error: null };
}

export async function resetActiveOrgSelection(): Promise<void> {
  await clearActiveOrgCookie();
}
