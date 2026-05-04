import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function ActionToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card p-3 shadow-card',
        className,
      )}
    >
      {children}
    </div>
  );
}
