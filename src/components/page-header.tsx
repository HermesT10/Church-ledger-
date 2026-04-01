import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-[1.75rem] border border-border/80 bg-white/98 px-6 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:flex-row sm:items-end sm:justify-between lg:px-6">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
          Workspace
        </p>
        <h1 className="mt-2 text-[2.1rem] font-semibold tracking-tight text-slate-800">{title}</h1>
        {subtitle && (
          <p className="mt-1 max-w-3xl text-[15px] leading-6 text-slate-500">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3 self-start sm:self-auto">{actions}</div>}
    </div>
  );
}
