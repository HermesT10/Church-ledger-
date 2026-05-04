'use client';

import type { ReactNode } from 'react';

interface ReportEmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function ReportEmptyState({
  title,
  description,
  action,
}: ReportEmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-border/80 bg-card/75 p-10 text-center shadow-card">
      <div className="mx-auto inline-flex rounded-full border border-border/70 bg-surface-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Report Empty State
      </div>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
