'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import type { InsightSnapshot, MonthEndChecklistStep } from '@/lib/insights/types';
import { completeMonthEndReview, toggleMonthEndStep } from '@/lib/insights/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

function StepAction({
  step,
  reviewMonth,
  canManage,
}: {
  step: MonthEndChecklistStep;
  reviewMonth: string;
  canManage: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  if (!step.isManual) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href={step.href}>Open</Link>
      </Button>
    );
  }

  if (!canManage) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href={step.href}>Open</Link>
      </Button>
    );
  }

  if (step.key === 'mark_review_complete') {
    return (
      <Button
        size="sm"
        disabled={isPending || step.status === 'complete'}
        onClick={() => {
          startTransition(async () => {
            const result = await completeMonthEndReview({ reviewMonth });
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success('Month-end review marked complete.');
            window.location.reload();
          });
        }}
      >
        {step.status === 'complete' ? 'Completed' : 'Mark complete'}
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant={step.status === 'complete' ? 'outline' : 'default'}
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await toggleMonthEndStep({
            reviewMonth,
            stepKey: step.key,
            complete: step.status !== 'complete',
          });
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success(
            step.status === 'complete'
              ? 'Step reopened.'
              : 'Step marked complete.',
          );
          window.location.reload();
        });
      }}
    >
      {step.status === 'complete' ? 'Reopen' : 'Mark complete'}
    </Button>
  );
}

export function MonthEndClient({
  snapshot,
  role,
}: {
  snapshot: InsightSnapshot;
  role: string;
}) {
  const canManage =
    role === 'admin' || role === 'treasurer' || role === 'finance_user';

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card className="rounded-2xl border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">
              {snapshot.monthEnd.monthLabel} close progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span>
                  {snapshot.monthEnd.completedCount} of {snapshot.monthEnd.totalCount}{' '}
                  steps complete
                </span>
                <span className="font-medium">
                  {snapshot.monthEnd.progressPercent}%
                </span>
              </div>
              <Progress value={snapshot.monthEnd.progressPercent} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {snapshot.narratives.map((item) => (
                <div key={item.id} className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Action-focused alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.indicators.slice(0, 4).map((indicator) => (
              <div key={indicator.id} className="rounded-xl border bg-muted/20 p-4">
                <p className="text-sm font-semibold">{indicator.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{indicator.value}</p>
                <p className="mt-2 text-sm text-muted-foreground">{indicator.explanation}</p>
                <Button asChild variant="ghost" size="sm" className="mt-2 px-0">
                  <Link href={indicator.href}>Open</Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Month-end checklist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {snapshot.monthEnd.steps.map((step, index) => (
            <div
              key={step.key}
              className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 lg:flex-row lg:items-start lg:justify-between"
            >
              <div className="space-y-1">
                <p className="text-sm font-semibold">
                  {index + 1}. {step.title}
                </p>
                <p className="text-sm text-muted-foreground">{step.description}</p>
                <p className="text-sm font-medium">{step.recommendedAction}</p>
                <p className="text-xs text-muted-foreground">{step.completionLabel}</p>
              </div>
              <StepAction
                step={step}
                reviewMonth={snapshot.monthEnd.reviewMonth}
                canManage={canManage}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
