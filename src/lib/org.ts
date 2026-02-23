import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { isDemoMode, getDemoOrgConfig } from '@/lib/demo';

// TODO: implement org switcher / persisted active org for multi-org support

/**
 * Returns the current user, their active organisation ID, and their role.
 * Only selects memberships with status = 'active'.
 * Selects the oldest membership (by created_at) for deterministic results.
 * Redirects to onboarding if the user has no active memberships.
 *
 * In demo mode, returns the configured demo org without querying memberships.
 */
export async function getActiveOrg() {
  const user = await requireSession();

  if (await isDemoMode()) {
    const config = getDemoOrgConfig();
    return {
      user,
      orgId: config.orgId,
      role: config.role,
    };
  }

  const supabase = await createClient();

  // Only select active memberships (excludes 'invited' and 'disabled')
  const { data } = await supabase
    .from('memberships')
    .select('organisation_id, role, status')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!data) {
    // Check if user has a disabled membership → redirect to login with error
    const { data: disabled } = await supabase
      .from('memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'disabled')
      .limit(1)
      .maybeSingle();

    if (disabled) {
      redirect('/login?error=' + encodeURIComponent('Your account has been disabled. Contact your administrator.'));
    }

    redirect('/onboarding');
  }

  return {
    user,
    orgId: data.organisation_id as string,
    role: data.role as string,
  };
}
