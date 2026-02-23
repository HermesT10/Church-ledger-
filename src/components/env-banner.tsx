'use client';

import { getAppEnv, type AppEnv } from '@/lib/env';

/* ------------------------------------------------------------------ */
/*  Style map per environment                                          */
/* ------------------------------------------------------------------ */

const ENV_STYLES: Record<
  AppEnv,
  { bg: string; text: string; label: string } | null
> = {
  development: {
    bg: 'bg-blue-600',
    text: 'text-white',
    label: 'Development Environment',
  },
  staging: {
    bg: 'bg-amber-500',
    text: 'text-white',
    label: 'Staging Environment',
  },
  production: null, // hidden in production
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function EnvBanner() {
  const env = getAppEnv();
  const style = ENV_STYLES[env];

  if (!style) return null;

  return (
    <div
      className={`${style.bg} ${style.text} text-center text-xs font-medium py-1 px-2 select-none z-[100] relative`}
      role="status"
      aria-label={`Current environment: ${env}`}
    >
      {style.label}
    </div>
  );
}
