import type { ReactNode } from 'react';

export function PageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`max-w-7xl mx-auto px-6 py-6 space-y-6 ${className ?? ''}`}>
      {children}
    </div>
  );
}
