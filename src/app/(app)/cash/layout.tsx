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
      <nav className="app-tab-bar">
        <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const isActive =
            tab.href === '/cash'
              ? pathname === '/cash' || pathname === ''
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`${
                isActive
                  ? 'app-tab-link-active'
                  : 'app-tab-link'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
        </div>
      </nav>

      {children}
    </PageShell>
  );
}
