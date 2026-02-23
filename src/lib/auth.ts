import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isDemoMode, getDemoOrgConfig } from '@/lib/demo';
import type { User } from '@supabase/supabase-js';

/**
 * Build a lightweight fake User object for demo mode.
 * Only `id` and `email` are typically accessed by server actions.
 */
function buildDemoUser(): User {
  const config = getDemoOrgConfig();
  return {
    id: config.fakeUserId,
    email: 'demo@churchledger.app',
    app_metadata: {},
    user_metadata: { full_name: 'Demo User' },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  } as User;
}

/**
 * Returns the authenticated user, or null if not logged in.
 * Uses getUser() (not getSession()) because it always revalidates
 * with the Supabase Auth server — safer for server-side checks.
 * In demo mode, returns a fake user without hitting Supabase.
 */
export async function getSession() {
  if (await isDemoMode()) return buildDemoUser();

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
}

/**
 * Returns the authenticated user, or redirects to /login if not logged in.
 * Use in Server Components, Server Actions, and Route Handlers that
 * must only be accessible to authenticated users.
 * In demo mode, returns a fake user without redirecting.
 */
export async function requireSession() {
  const user = await getSession();
  if (!user) redirect('/login');
  return user;
}
