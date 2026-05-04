'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FileCheck2,
  FileStack,
  Gift,
  History,
  Landmark,
  ScrollText,
  Upload,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { GiftAidWorkflowDashboard } from '@/lib/giftaid/types';

const TABS = [
  { href: '/gift-aid', label: 'Overview', icon: Gift, exact: true },
  { href: '/gift-aid/donors', label: 'Donors', icon: Users },
  { href: '/gift-aid/declarations', label: 'Declarations', icon: FileCheck2 },
  { href: '/gift-aid/claim-builder', label: 'Claims', icon: FileStack },
  { href: '/gift-aid/reconciliation', label: 'HMRC payments', icon: Landmark },
  { href: '/gift-aid/statements', label: 'Statements', icon: ScrollText },
] as const;

const JOURNEY_STEPS: Record<string, string> = {
  ingest: 'Imported',
  match: 'Matched',
  validate: 'Declarations',
  prepare_claim: 'Ready',
  export: 'Submitted',
  track_audit: 'Paid',
};

export function GiftAidWorkspaceShell({
  dashboard,
  canReview,
  canExport,
  children,
}: {
  dashboard: GiftAidWorkflowDashboard;
  canReview: boolean;
  canExport: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const detailRoute = /^\/gift-aid\/[^/]+$/.test(pathname);

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card px-6 py-5 shadow-card">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Gift Aid</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Understand what can be claimed, what needs review, and what is ready for HMRC.
          </p>
        </div>
        {canReview || canExport ? (
          <div className="flex flex-wrap gap-2">
            {canExport ? (
              <Button asChild>
                <Link href="/gift-aid/claim-builder">
                  <FileStack size={14} aria-hidden="true" />
                  Create claim batch
                </Link>
              </Button>
            ) : null}
            {canReview ? (
              <Button asChild variant="outline">
                <Link href="/giving-imports">
                  <Upload size={14} aria-hidden="true" />
                  Import donations
                </Link>
              </Button>
            ) : null}
            {canExport ? (
              <Button asChild variant="outline">
                <Link href="/gift-aid/claim-history">
                  <History size={14} aria-hidden="true" />
                  Claim history
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Gift Aid journey — single-line pipeline */}
      <div className="flex items-center overflow-x-auto rounded-xl border border-border/70 bg-card px-5 py-3 shadow-card">
        <span className="mr-4 shrink-0 text-xs font-semibold text-muted-foreground">Journey</span>
        {dashboard.stages.map((stage, index) => {
          const stepLabel = JOURNEY_STEPS[stage.id] ?? stage.label;
          const hasWork = stage.count > 0;
          return (
            <div key={stage.id} className="flex shrink-0 items-center">
              {index > 0 ? (
                <span className="mx-2.5 text-border text-sm" aria-hidden="true">›</span>
              ) : null}
              <span className={cn('text-sm', hasWork ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                {stepLabel}
              </span>
              {hasWork ? (
                <span className="ml-1.5 rounded-full bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                  {stage.count}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Tab nav */}
      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-border/70 bg-card p-2 shadow-card">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active =
            tab.href === '/gift-aid/claim-builder'
              ? pathname.startsWith(tab.href) || pathname.startsWith('/gift-aid/claim-history') || detailRoute
              : tab.href === '/gift-aid/reconciliation' || tab.href === '/gift-aid/statements'
                ? pathname.startsWith(tab.href)
                : 'exact' in tab && tab.exact
                  ? pathname === tab.href
                  : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent-soft hover:text-primary'
              )}
            >
              <Icon size={16} aria-hidden="true" />
              {tab.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
