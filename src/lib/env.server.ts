import { z } from 'zod';
import { getAppEnv, getPublicEnv, type AppEnv } from '@/lib/env';

const optionalString = z.string().min(1).optional();

function normalizeOptional(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
  SENTRY_AUTH_TOKEN: optionalString,
  SENTRY_ORG: optionalString,
  SENTRY_PROJECT: optionalString,
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .optional(),
  DEMO_MODE: z.enum(['true', 'false']).optional(),
  DEMO_MODE_KEY: optionalString,
  DEMO_ORG_ID: optionalString,
  VERCEL_URL: optionalString,
  NEXT_PUBLIC_VERCEL_URL: optionalString,
  VERCEL_GIT_COMMIT_SHA: optionalString,
  GITHUB_SHA: optionalString,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedServerEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) {
    return cachedServerEnv;
  }

  cachedServerEnv = serverEnvSchema.parse({
    ...getPublicEnv(),
    SUPABASE_SERVICE_ROLE_KEY: normalizeOptional(
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY,
    ),
    SENTRY_AUTH_TOKEN: normalizeOptional(process.env.SENTRY_AUTH_TOKEN),
    SENTRY_ORG: normalizeOptional(process.env.SENTRY_ORG),
    SENTRY_PROJECT: normalizeOptional(process.env.SENTRY_PROJECT),
    LOG_LEVEL: normalizeOptional(process.env.LOG_LEVEL),
    DEMO_MODE: normalizeOptional(process.env.DEMO_MODE) as 'true' | 'false' | undefined,
    DEMO_MODE_KEY: normalizeOptional(process.env.DEMO_MODE_KEY),
    DEMO_ORG_ID: normalizeOptional(process.env.DEMO_ORG_ID),
    VERCEL_URL: normalizeOptional(process.env.VERCEL_URL),
    NEXT_PUBLIC_VERCEL_URL: normalizeOptional(process.env.NEXT_PUBLIC_VERCEL_URL),
    VERCEL_GIT_COMMIT_SHA: normalizeOptional(process.env.VERCEL_GIT_COMMIT_SHA),
    GITHUB_SHA: normalizeOptional(process.env.GITHUB_SHA),
  });

  return cachedServerEnv;
}

export function getSiteUrl(): string {
  const publicSiteUrl = normalizeOptional(process.env.NEXT_PUBLIC_SITE_URL);
  if (publicSiteUrl) {
    return publicSiteUrl;
  }

  const vercelUrl =
    normalizeOptional(process.env.NEXT_PUBLIC_VERCEL_URL) ??
    normalizeOptional(process.env.VERCEL_URL);
  if (vercelUrl) {
    return `https://${vercelUrl}`;
  }

  return 'http://localhost:3000';
}

export function getReleaseId(): string | null {
  return (
    normalizeOptional(process.env.VERCEL_GIT_COMMIT_SHA) ??
    normalizeOptional(process.env.GITHUB_SHA) ??
    null
  );
}

export function getLogLevel(defaultLevel = 'info'): string {
  return normalizeOptional(process.env.LOG_LEVEL) ?? defaultLevel;
}

export function getRuntimeMetadata(): {
  appEnv: AppEnv;
  release: string | null;
  siteUrl: string;
} {
  return {
    appEnv: getAppEnv(),
    release: getReleaseId(),
    siteUrl: getSiteUrl(),
  };
}
