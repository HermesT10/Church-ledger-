import type { ReactNode } from 'react';

const VARIANTS: Record<string, string> = {
  error: 'bg-red-100/70 border-red-200/55 text-red-700 shadow-sm dark:bg-red-950/20 dark:border-red-800/20 dark:text-red-400',
  warning: 'bg-amber-100/70 border-amber-200/55 text-amber-700 shadow-sm dark:bg-amber-950/20 dark:border-amber-800/20 dark:text-amber-400',
  info: 'bg-blue-100/70 border-blue-200/55 text-blue-700 shadow-sm dark:bg-blue-950/20 dark:border-blue-800/20 dark:text-blue-400',
  success: 'bg-emerald-100/70 border-emerald-200/55 text-emerald-700 shadow-sm dark:bg-emerald-950/20 dark:border-emerald-800/20 dark:text-emerald-400',
};

export function SoftAlert({
  variant = 'error',
  icon,
  children,
  className,
}: {
  variant?: 'error' | 'warning' | 'info' | 'success';
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[1.5rem] border px-4 py-3 text-sm flex items-start gap-3 backdrop-blur-sm ${VARIANTS[variant]} ${className ?? ''}`}
    >
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div>{children}</div>
    </div>
  );
}
