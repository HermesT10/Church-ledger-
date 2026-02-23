'use client';

import { useState, useCallback } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Suspense } from 'react';
import { AppSidebar } from './app-sidebar';
import { MobileSidebar } from './mobile-sidebar';
import { EnvBanner } from './env-banner';
import { DemoBanner } from './demo-banner';

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
  orgName: string;
  role: string;
  children: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CollapsibleLayout({
  userName,
  orgName,
  role,
  children,
}: CollapsibleLayoutProps) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((prev) => !prev), []);

  return (
    <div className="relative flex flex-col min-h-screen">
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
          border-r border-sidebar-border bg-sidebar overflow-hidden
          transition-[width] duration-300 ease-in-out
          ${expanded ? EXPANDED_W : RAIL_W}
        `}
      >
        <AppSidebar
          userName={userName}
          orgName={orgName}
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
          ${expanded ? EXPANDED_ML : RAIL_ML}
        `}
      >
        {/* Mobile header with hamburger (hidden on desktop) */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-background px-4 py-3 md:hidden">
          <MobileSidebar userName={userName} orgName={orgName} role={role} />
          <span className="font-semibold text-sm">{orgName}</span>
        </header>

        <main className="flex-1">{children}</main>
      </div>
      </div>
    </div>
  );
}
