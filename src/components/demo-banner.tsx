'use client';

import { useSearchParams } from 'next/navigation';

/**
 * Visible banner shown on every page when demo mode is active.
 * Detection: checks for ?demo=1 in the URL (the middleware validates
 * the full triple-gate; this component only shows the banner client-side).
 */
export function DemoBanner() {
  const searchParams = useSearchParams();
  const isDemo = searchParams.get('demo') === '1';

  if (!isDemo) return null;

  return (
    <div
      className="bg-red-600 text-white text-center text-xs font-bold py-1.5 px-2 select-none z-[110] relative tracking-wide"
      role="status"
      aria-label="Demo mode active — read-only"
    >
      DEMO MODE (read-only)
    </div>
  );
}
