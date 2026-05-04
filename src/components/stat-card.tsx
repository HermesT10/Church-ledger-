import Link from 'next/link';
import type { ReactNode } from 'react';

const TINT_CLASSES: Record<string, { panel: string; badge: string; icon: string }> = {
  emerald: { panel: 'border-border/70 bg-card', badge: 'bg-success-soft text-success', icon: 'text-success' },
  green:   { panel: 'border-border/70 bg-card', badge: 'bg-success-soft text-success', icon: 'text-success' },
  rose:    { panel: 'border-border/70 bg-card', badge: 'bg-danger-soft text-danger', icon: 'text-danger' },
  red:     { panel: 'border-border/70 bg-card', badge: 'bg-danger-soft text-danger', icon: 'text-danger' },
  amber:   { panel: 'border-border/70 bg-card', badge: 'bg-warning-soft text-warning', icon: 'text-warning' },
  orange:  { panel: 'border-border/70 bg-card', badge: 'bg-warning-soft text-warning', icon: 'text-warning' },
  violet:  { panel: 'border-border/70 bg-card', badge: 'bg-accent-soft text-primary', icon: 'text-primary' },
  purple:  { panel: 'border-border/70 bg-card', badge: 'bg-accent-soft text-primary', icon: 'text-primary' },
  indigo:  { panel: 'border-border/70 bg-card', badge: 'bg-accent-soft text-primary', icon: 'text-primary' },
  blue:    { panel: 'border-border/70 bg-card', badge: 'bg-info-soft text-info', icon: 'text-info' },
  teal:    { panel: 'border-border/70 bg-card', badge: 'bg-info-soft text-info', icon: 'text-info' },
  cyan:    { panel: 'border-border/70 bg-card', badge: 'bg-info-soft text-info', icon: 'text-info' },
  pink:    { panel: 'border-border/70 bg-card', badge: 'bg-danger-soft text-danger', icon: 'text-danger' },
  slate:   { panel: 'border-border/70 bg-card', badge: 'bg-surface-muted text-muted-foreground', icon: 'text-muted-foreground' },
};

export function StatCard({
  title,
  value,
  subtitle,
  href,
  gradient,
  tint,
  icon,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  /** When omitted with `tint`, renders a non-interactive summary card. */
  href?: string;
  /** @deprecated Use `tint` instead for the soft-card style */
  gradient?: string;
  /** Color name for soft tinted card — e.g. 'emerald', 'rose', 'blue' */
  tint?: string;
  icon: ReactNode;
}) {
  const t = tint ? TINT_CLASSES[tint] : undefined;

  if (t) {
    const panel = (
      <div
        className={`flex min-h-[128px] flex-col justify-between rounded-2xl border p-4 shadow-card ${
          href
            ? 'transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/20 group-hover:shadow-soft'
            : ''
        } ${t.panel}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">{title}</p>
            <p className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">{value}</p>
          </div>
          <span
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${t.badge} ${t.icon}`}
            aria-hidden="true"
          >
            {icon}
          </span>
        </div>
        {subtitle && (
          <p className="mt-3 text-xs leading-5 text-muted-foreground">{subtitle}</p>
        )}
      </div>
    );

    if (href) {
      return (
        <Link href={href} className="block group">
          {panel}
        </Link>
      );
    }

    return panel;
  }

  /* Legacy gradient style — kept for backward compatibility */
  if (!href) {
    return (
      <div className="block">
        <div
          className={`flex min-h-[128px] flex-col justify-between rounded-2xl border border-primary/20 bg-primary p-4 text-primary-foreground shadow-card ${gradient ?? ''}`}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium opacity-80">{title}</p>
            <span className="opacity-60" aria-hidden="true">{icon}</span>
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">{value}</p>
          {subtitle && (
            <p className="mt-1 text-xs opacity-70">{subtitle}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <Link href={href} className="block">
      <div
        className={`flex min-h-[128px] flex-col justify-between rounded-2xl border border-primary/20 bg-primary p-4 text-primary-foreground shadow-card transition-transform hover:scale-[1.01] ${gradient ?? ''}`}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium opacity-80">{title}</p>
          <span className="opacity-60" aria-hidden="true">{icon}</span>
        </div>
        <p className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">{value}</p>
        {subtitle && (
          <p className="mt-1 text-xs opacity-70">{subtitle}</p>
        )}
      </div>
    </Link>
  );
}
