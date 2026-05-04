'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function DashboardWidgetCard({
  title,
  href,
  actionLabel = 'View all',
  tint: _tint,
  children,
  contentClassName,
  className,
}: {
  title: string;
  href: string;
  actionLabel?: string;
  /** @deprecated No longer affects appearance — cards use neutral white style */
  tint?: string;
  children: ReactNode;
  contentClassName?: string;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        'rounded-2xl border shadow-card backdrop-blur-sm',
        className
      )}
    >
      <CardHeader className="border-b border-border/40 pb-4 pt-5 px-5">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {actionLabel}
            <ChevronRight size={12} aria-hidden="true" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className={cn('px-5 pb-5 pt-4', contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}
