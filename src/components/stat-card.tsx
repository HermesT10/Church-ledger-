import Link from 'next/link';
import type { ReactNode } from 'react';

/* Tint color presets — maps a color name to soft card classes */
const TINT_CLASSES: Record<string, { bg: string; border: string; icon: string }> = {
  emerald:  { bg: 'bg-emerald-100/70', border: 'border-emerald-200/50', icon: 'text-emerald-600 dark:text-emerald-400' },
  rose:     { bg: 'bg-rose-100/70',    border: 'border-rose-200/50',    icon: 'text-rose-600 dark:text-rose-400' },
  amber:    { bg: 'bg-amber-100/65',   border: 'border-amber-200/50',   icon: 'text-amber-600 dark:text-amber-400' },
  violet:   { bg: 'bg-violet-100/65',  border: 'border-violet-200/50',  icon: 'text-violet-600 dark:text-violet-400' },
  blue:     { bg: 'bg-blue-100/70',    border: 'border-blue-200/50',    icon: 'text-blue-600 dark:text-blue-400' },
  teal:     { bg: 'bg-teal-100/65',    border: 'border-teal-200/50',    icon: 'text-teal-600 dark:text-teal-400' },
  cyan:     { bg: 'bg-cyan-100/65',    border: 'border-cyan-200/50',    icon: 'text-cyan-600 dark:text-cyan-400' },
  orange:   { bg: 'bg-orange-100/65',  border: 'border-orange-200/50',  icon: 'text-orange-600 dark:text-orange-400' },
  red:      { bg: 'bg-red-100/70',     border: 'border-red-200/50',     icon: 'text-red-600 dark:text-red-400' },
  pink:     { bg: 'bg-pink-100/65',    border: 'border-pink-200/50',    icon: 'text-pink-600 dark:text-pink-400' },
  indigo:   { bg: 'bg-indigo-100/65',  border: 'border-indigo-200/50',  icon: 'text-indigo-600 dark:text-indigo-400' },
  slate:    { bg: 'bg-slate-100/65',   border: 'border-slate-200/50',   icon: 'text-slate-600 dark:text-slate-400' },
  green:    { bg: 'bg-green-100/70',   border: 'border-green-200/50',   icon: 'text-green-600 dark:text-green-400' },
  purple:   { bg: 'bg-purple-100/65',  border: 'border-purple-200/50',  icon: 'text-purple-600 dark:text-purple-400' },
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
  href: string;
  /** @deprecated Use `tint` instead for the soft-card style */
  gradient?: string;
  /** Color name for soft tinted card — e.g. 'emerald', 'rose', 'blue' */
  tint?: string;
  icon: ReactNode;
}) {
  const t = tint ? TINT_CLASSES[tint] : undefined;

  if (t) {
    return (
      <Link href={href} className="block group">
        <div
          className={`rounded-[1.5rem] border bg-white/98 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:border-slate-300 hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)] ${t.border}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
                {title}
              </p>
              <p className="mt-3 text-[2.35rem] font-semibold tracking-tight text-slate-800">{value}</p>
              {subtitle && (
                <p className="mt-2 text-[13px] text-slate-500">{subtitle}</p>
              )}
            </div>
            <span
              className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${t.bg} ${t.icon} shadow-inner`}
              aria-hidden="true"
            >
              {icon}
            </span>
          </div>
          <div className={`mt-4 h-1 rounded-full opacity-80 ${t.bg}`} />
        </div>
      </Link>
    );
  }

  /* Legacy gradient style — kept for backward compatibility */
  return (
    <Link href={href} className="block">
      <div
        className={`rounded-xl p-5 text-white shadow-lg ring-1 ring-white/20 transition-transform hover:scale-[1.02] ${gradient}`}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium opacity-80">{title}</p>
          <span className="opacity-60" aria-hidden="true">{icon}</span>
        </div>
        <p className="mt-2 text-4xl font-bold tracking-tight">{value}</p>
        {subtitle && (
          <p className="mt-1 text-xs opacity-70">{subtitle}</p>
        )}
      </div>
    </Link>
  );
}
