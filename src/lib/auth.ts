import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Returns the authenticated user, or null if not logged in.
 * Uses getUser() (not getSession()) because it always revalidates
 * with the Supabase Auth server — safer for server-side checks.
 */
export async function getSession() {
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
 */
export async function requireSession() {
  const user = await getSession();
  if (!user) redirect('/login');
  return user;
}
