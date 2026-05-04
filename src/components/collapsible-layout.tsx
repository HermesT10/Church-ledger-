'use client';

import { useState, useCallback } from 'react';
import { Suspense } from 'react';
import type { UserOrganisationMembership } from '@/lib/org';
import { AppSidebar } from './app-sidebar';
import { MobileSidebar } from './mobile-sidebar';
import { EnvBanner } from './env-banner';
import { DemoBanner } from './demo-banner';
import { UsageTracker } from './usage-tracker';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Collapsed rail width (matches w-16 = 4rem) */
const RAIL_W = 'w-[4.75rem]';
const RAIL_ML = 'md:ml-[4.75rem]';

/** Expanded sidebar width (matches w-60 = 15rem) */
const EXPANDED_W = 'w-[17.5rem]';
const EXPANDED_ML = 'md:ml-[17.5rem]';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface CollapsibleLayoutProps {
  userName: string;
  orgName: string;
  activeOrgId: string;
  organisations: UserOrganisationMembership[];
  role: string;
  children: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CollapsibleLayout({
  userName,
  orgName,
  activeOrgId,
  organisations,
  role,
  children,
}: CollapsibleLayoutProps) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((prev) => !prev), []);

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
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
          hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 z-50
          border-r border-sidebar-border bg-sidebar shadow-card overflow-hidden
          transition-[width] duration-300 ease-in-out
          ${expanded ? EXPANDED_W : RAIL_W}
        `}
      >
        <AppSidebar
          userName={userName}
          orgName={orgName}
          activeOrgId={activeOrgId}
          organisations={organisations}
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
          flex min-h-screen flex-1 flex-col
          transition-[margin-left] duration-300 ease-in-out
          ${expanded ? EXPANDED_ML : RAIL_ML}
        `}
      >
        {/* Mobile header with hamburger (hidden on desktop) */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/80 bg-card/95 px-4 py-3 shadow-sm backdrop-blur-sm md:hidden">
          <MobileSidebar
            userName={userName}
            orgName={orgName}
            activeOrgId={activeOrgId}
            organisations={organisations}
            role={role}
          />
          <span className="text-sm font-semibold text-foreground">{orgName}</span>
        </header>

        <main className="flex-1">
          <UsageTracker />
          {children}
        </main>
      </div>
      </div>
    </div>
  );
}
