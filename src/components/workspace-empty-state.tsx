import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';

export function WorkspaceEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="border-dashed border-border/80 bg-card">
      <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center sm:p-12">
        <div className="rounded-2xl bg-accent-soft p-4 text-primary">{icon}</div>
        <div className="space-y-1">
          <p className="text-base font-semibold">{title}</p>
          <p className="mx-auto max-w-xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {action ? <div className="pt-1">{action}</div> : null}
      </CardContent>
    </Card>
  );
}
