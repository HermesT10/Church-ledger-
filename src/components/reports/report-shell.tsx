'use client';

import Link from 'next/link';
import { REPORT_TABS } from './report-tabs';

interface ReportShellProps {
  title: string;
  description?: string;
  asOfDate?: string;
  activeReport: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  error?: string | null;
}

export function ReportShell({
  title,
  description,
  asOfDate,
  activeReport,
  action,
  children,
  error,
}: ReportShellProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-[1.75rem] border border-border/80 bg-white/98 px-6 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
          Report
        </p>
        <h1 className="mt-2 text-[2rem] font-semibold tracking-tight text-slate-800">
          {title}
          {asOfDate && (
            <span className="ml-1 text-base font-normal text-slate-500">
              as of {asOfDate}
            </span>
          )}
        </h1>
        {description && (
          <p className="mt-1 text-[15px] text-slate-500">{description}</p>
        )}
      </div>

      {/* Sub-nav tabs */}
      <div className="app-filter-bar">
      <div className="flex flex-wrap gap-2 text-sm">
        {REPORT_TABS.map((tab) => {
          const isActive = activeReport === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={
                isActive
                  ? 'rounded-xl bg-primary px-3 py-2 font-semibold text-primary-foreground shadow-[0_8px_20px_rgba(120,76,255,0.18)]'
                  : 'rounded-xl px-3 py-2 text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      </div>

      {/* Action button */}
      {action && <div className="app-toolbar">{action}</div>}

      {/* Error */}
      {error && (
        <p className="rounded-2xl border border-destructive/20 bg-destructive/8 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Content */}
      {children}
    </div>
  );
}
