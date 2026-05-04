import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const toneClasses = {
  default: 'bg-card text-foreground',
  primary: 'bg-accent-soft text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
};

export function MetricCard({
  label,
  value,
  description,
  icon,
  href,
  tone = 'default',
  className,
}: {
  label: string;
  value: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  href?: string;
  tone?: keyof typeof toneClasses;
  className?: string;
}) {
  const content = (
    <div
      className={cn(
        'group rounded-2xl border border-border/70 bg-card p-5 shadow-card transition-all duration-200 hover:border-primary/20 hover:shadow-soft',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">{label}</p>
          <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">{value}</div>
        </div>
        {icon ? (
          <span className={cn('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', toneClasses[tone])}>
            {icon}
          </span>
        ) : null}
      </div>
      {description ? (
        <p className="mt-3 text-sm leading-5 text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );

  return href ? (
    <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl">
      {content}
    </Link>
  ) : content;
}
