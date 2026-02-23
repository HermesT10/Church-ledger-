'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface ReportSectionProps {
  title: string;
  viewLink?: string;
  viewLabel?: string;
  children: React.ReactNode;
  canNavigate?: boolean;
}

export function ReportSection({
  title,
  viewLink,
  viewLabel,
  children,
  canNavigate = true,
}: ReportSectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {viewLink && viewLabel && canNavigate && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={viewLink} className="text-muted-foreground hover:text-foreground">
              {viewLabel}
            </Link>
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}
