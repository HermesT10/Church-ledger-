'use client';

import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseBrowserEnv } from '@/lib/env';

export function createClient() {
  const env = getSupabaseBrowserEnv();
  return createBrowserClient(
    env.url,
    env.anonKey,
  );
}
