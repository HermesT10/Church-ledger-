import type { ReactNode } from 'react';

export function PageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`app-page-shell ${className ?? ''}`}>
      {children}
    </div>
  );
}
