'use client';

import { useState, useCallback } from 'react';
import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { MobileSidebar } from './mobile-sidebar';
import { EnvBanner } from './env-banner';
import { DemoBanner } from './demo-banner';
import type { OrgOption } from '@/lib/org';

/**
 * Desktop nav is client-only (no SSR) so:
 * - Cursor/browser tooling cannot inject `data-cursor-ref` (etc.) into SSR `<a>` nodes before hydration.
 * - `AppSidebar` initial state can safely read `localStorage` without SSR/client mismatch.
 */
const AppSidebar = dynamic(
  () => import('./app-sidebar').then((mod) => mod.AppSidebar),
  {
    ssr: false,
    loading: () => <DesktopSidebarSkeleton />,
  },
);

function DesktopSidebarSkeleton() {
  return (
    <div
      className="flex h-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground"
      aria-hidden
    >
      <div className="flex items-center justify-center border-b border-sidebar-border px-2 py-4">
        <div className="h-10 w-10 animate-pulse rounded-2xl bg-sidebar-accent/35" />
      </div>
      <div className="flex flex-1 flex-col gap-2 px-2 py-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="h-10 w-full animate-pulse rounded-2xl bg-sidebar-accent/25"
          />
        ))}
      </div>
      <div className="border-t border-sidebar-border p-3">
        <div className="mx-auto h-10 w-10 animate-pulse rounded-full bg-sidebar-accent/35" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Collapsed rail width (matches w-16 = 4rem) */
const RAIL_W = 'w-16';
const RAIL_ML = 'md:ml-16';

/** Expanded sidebar width (matches w-60 = 15rem) */
const EXPANDED_W = 'w-60';
const EXPANDED_ML = 'md:ml-60';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface CollapsibleLayoutProps {
  userName: string;
  orgId: string;
  orgName: string;
  availableOrgs: OrgOption[];
  role: string;
  children: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CollapsibleLayout({
  userName,
  orgId,
  orgName,
  availableOrgs,
  role,
  children,
}: CollapsibleLayoutProps) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((prev) => !prev), []);

  return (
    <div className="relative flex min-h-screen flex-col bg-transparent">
      {/* ================================================================ */}
      {/*  Environment banner (dev / staging only)                         */}
      {/* ================================================================ */}
      <EnvBanner />
      <Suspense>
        <DemoBanner />
      </Suspense>

      <div className="relative flex flex-1">
      {/* ================================================================ */}
      {/*  DESKTOP sidebar rail / expanded  (hidden on mobile)             */}
      {/* ================================================================ */}
      <aside
        className={`
          hidden md:flex md:flex-col md:fixed md:inset-y-3 md:left-3 z-50
          rounded-[1.75rem] border border-sidebar-border bg-sidebar/92 shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur-md overflow-hidden
          transition-[width] duration-300 ease-in-out
          ${expanded ? EXPANDED_W : RAIL_W}
        `}
      >
        <AppSidebar
          userName={userName}
          currentOrgId={orgId}
          orgName={orgName}
          availableOrgs={availableOrgs}
          role={role}
          collapsed={!expanded}
          onToggle={toggle}
        />
      </aside>

      {/* ================================================================ */}
      {/*  Main content area                                               */}
      {/* ================================================================ */}
      <div
        className={`
          flex flex-1 flex-col min-h-screen
          transition-[margin-left] duration-300 ease-in-out
          ${expanded ? 'md:ml-[16.5rem]' : 'md:ml-[5.25rem]'}
        `}
      >
        {/* Mobile header with hamburger (hidden on desktop) */}
        <header className="sticky top-0 z-30 m-3 flex items-center gap-3 rounded-2xl border bg-card/88 px-4 py-3 shadow-sm backdrop-blur md:hidden">
          <MobileSidebar
            userName={userName}
            currentOrgId={orgId}
            orgName={orgName}
            availableOrgs={availableOrgs}
            role={role}
          />
          <span className="font-semibold text-sm">{orgName}</span>
        </header>

        <main className="flex-1 pb-6">{children}</main>
      </div>
      </div>
    </div>
  );
}
