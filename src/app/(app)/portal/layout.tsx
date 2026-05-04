import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/page-shell';
import { Badge } from '@/components/ui/badge';
import { getCurrentPortalAccess } from '@/lib/portal/current-user';
import {
  PORTAL_PAGE_LABELS,
  type PortalPageKey,
} from '@/lib/portal-permission-constants';

const PORTAL_NAV: { href: string; page: PortalPageKey; label?: string }[] = [
  { href: '/portal/dashboard', page: 'dashboard' },
  { href: '/portal/budgets', page: 'budgets' },
  { href: '/portal/invoices', page: 'submit_invoices', label: 'Invoices' },
  { href: '/portal/cash-collections', page: 'cash_collections', label: 'Cash' },
  { href: '/portal/expenses', page: 'expenses' },
  { href: '/portal/calendar', page: 'calendar' },
  { href: '/portal/funds', page: 'restricted_funds', label: 'Funds' },
  { href: '/portal/income-register', page: 'income_register', label: 'Income register' },
  { href: '/portal/expense-register', page: 'expense_register', label: 'Expense register' },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  let access;
  try {
    access = await getCurrentPortalAccess();
  } catch {
    redirect('/dashboard');
  }

  const visibleNav = PORTAL_NAV.filter((item) => access.permissions.pages[item.page]);

  return (
    <PageShell className="py-6">
      <div className="mb-6 rounded-3xl border border-border/70 bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invited user portal</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">My Church Ledger Portal</h1>
          </div>
          <Badge variant="secondary">Limited access</Badge>
        </div>
        <nav className="mt-4 flex gap-2 overflow-x-auto">
          {visibleNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-full border border-border/70 px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
            >
              {item.label ?? PORTAL_PAGE_LABELS[item.page]}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </PageShell>
  );
}
