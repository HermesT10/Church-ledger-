'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { trackPathView } from '@/lib/analytics/actions';

const STORAGE_PREFIX = 'tracked-path:';
const TTL_MS = 15 * 60 * 1000;

export function UsageTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || typeof window === 'undefined') {
      return;
    }

    const key = `${STORAGE_PREFIX}${pathname}`;
    const now = Date.now();
    const previous = window.sessionStorage.getItem(key);

    if (previous) {
      const lastTracked = Number(previous);
      if (Number.isFinite(lastTracked) && now - lastTracked < TTL_MS) {
        return;
      }
    }

    window.sessionStorage.setItem(key, String(now));
    void trackPathView(pathname).catch(() => {
      // Analytics should never interrupt navigation or page actions.
    });
  }, [pathname]);

  return null;
}
