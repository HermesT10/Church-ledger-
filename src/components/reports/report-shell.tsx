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
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {title}
          {asOfDate && (
            <span className="text-base font-normal text-muted-foreground ml-1">
              as of {asOfDate}
            </span>
          )}
        </h1>
        {description && (
          <p className="text-muted-foreground text-sm mt-1">{description}</p>
        )}
      </div>

      {/* Sub-nav tabs */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm border-b pb-2">
        {REPORT_TABS.map((tab) => {
          const isActive = activeReport === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={
                isActive
                  ? 'font-semibold text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:underline'
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Action button */}
      {action && <div>{action}</div>}

      {/* Error */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Content */}
      {children}
    </div>
  );
}
