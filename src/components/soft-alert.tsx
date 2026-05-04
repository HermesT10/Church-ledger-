import type { ReactNode } from 'react';

const VARIANTS: Record<string, string> = {
  error: 'bg-danger-soft border-danger/20 text-danger',
  warning: 'bg-warning-soft border-warning/20 text-warning',
  info: 'bg-info-soft border-info/20 text-info',
  success: 'bg-success-soft border-success/20 text-success',
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
      className={`rounded-2xl border px-4 py-3 text-sm flex items-start gap-2 shadow-xs ${VARIANTS[variant]} ${className ?? ''}`}
    >
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div>{children}</div>
    </div>
  );
}
