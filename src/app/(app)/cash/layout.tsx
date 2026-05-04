import Link from 'next/link';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';

const TABS = [
  { label: 'Overview', href: '/cash' },
  { label: 'Collections', href: '/cash/collections' },
  { label: 'Spends', href: '/cash/spends' },
  { label: 'Deposits', href: '/cash/deposits' },
  { label: 'Ledger', href: '/cash/ledger' },
];

export default async function CashLayout({ children }: { children: ReactNode }) {
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') ?? '';

  return (
    <PageShell>
      <PageHeader
        title="Cash Management"
        subtitle="Manage cash collections, petty cash, and bank deposits."
      />

      {/* Sub-navigation tabs */}
      <nav className="flex flex-wrap gap-2 rounded-2xl border border-border/70 bg-card p-2 shadow-card">
        {TABS.map((tab) => {
          const isActive =
            tab.href === '/cash'
              ? pathname === '/cash' || pathname === ''
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </PageShell>
  );
}
