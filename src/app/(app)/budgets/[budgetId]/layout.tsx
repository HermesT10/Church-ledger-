'use client';

import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';

const TABS = [
  { label: 'Monthly Planning', href: '' },
  { label: 'Annual View', href: '/annual' },
  { label: 'Grid Editor', href: '/grid' },
] as const;

export default function BudgetDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useParams<{ budgetId: string }>();
  const base = `/budgets/${params.budgetId}`;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Sub-navigation */}
      <div className="flex border-b">
        {TABS.map((tab) => {
          const href = `${base}${tab.href}`;
          const isActive =
            tab.href === ''
              ? pathname === base || pathname === base + '/'
              : pathname.startsWith(href);
          return (
            <Link
              key={tab.href}
              href={href}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
