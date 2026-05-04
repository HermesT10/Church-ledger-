import { createClient } from '@supabase/supabase-js';
import { getServerEnv } from '@/lib/env.server';

/**
 * Creates a Supabase client with the service-role key.
 *
 * This client BYPASSES Row Level Security — use it only in trusted
 * server-side code where you have already verified the caller's identity
 * (e.g. after requireSession()).
 *
 * Never expose this client or the service-role key to the browser.
 *
 * Key source: `SUPABASE_SERVICE_ROLE_KEY` (legacy JWT) or `SUPABASE_SECRET_KEY` (`sb_secret_…`),
 * resolved in `getServerEnv()`.
 */
export function createAdminClient() {
  const env = getServerEnv();

  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
