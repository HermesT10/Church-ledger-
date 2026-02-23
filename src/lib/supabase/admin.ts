import { createClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase client with the service-role key.
 *
 * This client BYPASSES Row Level Security — use it only in trusted
 * server-side code where you have already verified the caller's identity
 * (e.g. after requireSession()).
 *
 * Never expose this client or the service-role key to the browser.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.'
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
