'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react';
import type { HealthIndicator, InsightSeverity } from '@/lib/insights/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function severityIcon(severity: InsightSeverity) {
  switch (severity) {
    case 'critical':
      return <ShieldAlert size={16} className="text-rose-500" />;
    case 'caution':
      return <AlertTriangle size={16} className="text-amber-500" />;
    case 'positive':
      return <CheckCircle2 size={16} className="text-emerald-500" />;
    default:
      return <Info size={16} className="text-sky-500" />;
  }
}

export function IndicatorList({
  title,
  items,
}: {
  title: string;
  items: HealthIndicator[];
}) {
  return (
    <Card className="rounded-2xl border shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border bg-muted/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                {severityIcon(item.severity)}
                <div>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.value}</p>
                </div>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href={item.href}>Open</Link>
              </Button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{item.explanation}</p>
            <p className="mt-2 text-sm font-medium">{item.recommendedAction}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
