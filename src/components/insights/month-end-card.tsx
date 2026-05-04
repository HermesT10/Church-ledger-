'use client';

import Link from 'next/link';
import type { MonthEndChecklist } from '@/lib/insights/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

export function MonthEndCard({
  checklist,
}: {
  checklist: MonthEndChecklist;
}) {
  return (
    <Card className="rounded-2xl border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">Month-End Close</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{checklist.monthLabel}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/month-end">Open assistant</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>{checklist.completedCount} of {checklist.totalCount} steps complete</span>
            <span className="font-medium">{checklist.progressPercent}%</span>
          </div>
          <Progress value={checklist.progressPercent} />
        </div>
        <div className="space-y-2">
          {checklist.steps.slice(0, 3).map((step) => (
            <div key={step.key} className="rounded-lg border bg-muted/20 px-3 py-2">
              <p className="text-sm font-medium">{step.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{step.completionLabel}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
