'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList, FileText, Receipt, MessageSquare } from 'lucide-react';

const WORKFLOW_TABS: readonly { label: string; href: string; icon: typeof ClipboardList; exact?: boolean }[] = [
  { label: 'Overview', href: '/workflows', icon: ClipboardList, exact: true },
  { label: 'Invoices', href: '/workflows/invoices', icon: FileText },
  { label: 'Expenses', href: '/workflows/expenses', icon: Receipt },
  { label: 'Messages', href: '/workflows/messages', icon: MessageSquare },
];

export default function WorkflowsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b">
        {WORKFLOW_TABS.map((tab) => {
          const isActive = tab.exact
            ? pathname === tab.href
            : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
