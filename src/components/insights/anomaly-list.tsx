'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import type { AnomalyFinding } from '@/lib/insights/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function AnomalyList({
  title,
  items,
}: {
  title: string;
  items: AnomalyFinding[];
}) {
  return (
    <Card className="rounded-2xl border shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
            No unusual variances are currently flagged.
          </div>
        ) : (
          items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="block rounded-xl border bg-muted/20 p-4 hover:bg-muted/30"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-amber-500" />
                <p className="text-sm font-semibold">{item.title}</p>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{item.explanation}</p>
              <div className="mt-3 flex items-center gap-2 text-sm font-medium">
                <span>{item.recommendedAction}</span>
                <ArrowRight size={14} />
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
