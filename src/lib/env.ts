/* ------------------------------------------------------------------ */
/*  Environment awareness helpers                                      */
/* ------------------------------------------------------------------ */

export type AppEnv = 'development' | 'staging' | 'production';

/**
 * Returns the current application environment.
 * Reads NEXT_PUBLIC_APP_ENV first, then falls back to NODE_ENV.
 */
export function getAppEnv(): AppEnv {
  const raw =
    process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? 'development';
  if (raw === 'staging') return 'staging';
  if (raw === 'production') return 'production';
  return 'development';
}

/** Returns true when running in production. */
export function isProduction(): boolean {
  return getAppEnv() === 'production';
}

/** Returns true when running in a non-production environment. */
export function isDevelopment(): boolean {
  return getAppEnv() === 'development';
}
