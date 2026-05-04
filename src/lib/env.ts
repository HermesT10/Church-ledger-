import { z } from 'zod';

/* ------------------------------------------------------------------ */
/*  Environment awareness helpers                                      */
/* ------------------------------------------------------------------ */

export type AppEnv = 'development' | 'staging' | 'production';

function optionalString(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
  NEXT_PUBLIC_APP_ENV: z.enum(['development', 'staging', 'production']).optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

function resolveAppEnv(raw?: string | null): AppEnv {
  if (raw === 'staging') return 'staging';
  if (raw === 'production') return 'production';
  return 'development';
}

/**
 * Returns the current application environment.
 * Reads NEXT_PUBLIC_APP_ENV first, then falls back to NODE_ENV.
 */
export function getAppEnv(): AppEnv {
  return resolveAppEnv(
    process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? 'development',
  );
}

export function getPublicEnv(): PublicEnv {
  const anonKey =
    optionalString(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ??
    optionalString(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  return publicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: optionalString(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    NEXT_PUBLIC_SITE_URL: optionalString(process.env.NEXT_PUBLIC_SITE_URL),
    NEXT_PUBLIC_SENTRY_DSN: optionalString(process.env.NEXT_PUBLIC_SENTRY_DSN),
    NEXT_PUBLIC_APP_ENV: resolveAppEnv(
      process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? 'development',
    ),
  });
}

export function getSupabaseBrowserEnv(): {
  url: string;
  anonKey: string;
} {
  const env = getPublicEnv();

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY env vars.',
    );
  }

  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

/** Returns true when running in production. */
export function isProduction(): boolean {
  return getAppEnv() === 'production';
}

/** Returns true when running in a non-production environment. */
export function isDevelopment(): boolean {
  return getAppEnv() === 'development';
}
