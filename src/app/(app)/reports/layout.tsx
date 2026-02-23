'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  FileText,
  Scale,
  Banknote,
  TrendingUp,
  Calendar,
  CalendarRange,
  Users,
  Download,
  Activity,
  PieChart,
  Landmark,
  DollarSign,
  ShoppingCart,
} from 'lucide-react';

const REPORT_NAV = [
  { label: 'Overview', href: '/reports', icon: BarChart3, exact: true },
  { type: 'divider' as const, label: 'Financial Statements' },
  { label: 'Income Statement', href: '/reports/income-statement', icon: FileText },
  { label: 'Balance Sheet', href: '/reports/balance-sheet', icon: Scale },
  { label: 'SOFA', href: '/reports/sofa', icon: Landmark },
  { label: 'Cash Flow', href: '/reports/cash-flow', icon: Banknote },
  { label: 'Trial Balance', href: '/reports/trial-balance', icon: Activity },
  { type: 'divider' as const, label: 'Analysis' },
  { label: 'Budget vs Actual', href: '/reports/budget-vs-actual', icon: TrendingUp },
  { label: 'Fund Movements', href: '/reports/fund-movements', icon: PieChart },
  { label: 'Forecast', href: '/reports/forecast', icon: TrendingUp },
  { label: 'Cash Position', href: '/reports/cash-position', icon: DollarSign },
  { label: 'Supplier Spend', href: '/reports/supplier-spend', icon: ShoppingCart },
  { type: 'divider' as const, label: 'Packs & Snapshots' },
  { label: 'Trustee Snapshot', href: '/reports/trustee-snapshot', icon: Users },
  { label: 'Quarterly Report', href: '/reports/quarterly', icon: Calendar },
  { label: 'Annual Report', href: '/reports/annual', icon: CalendarRange },
  { label: 'AGM Pack', href: '/reports/agm', icon: Users },
  { label: 'Export Pack', href: '/reports/export-pack', icon: Download },
] as const;

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r bg-muted/30 overflow-y-auto hidden md:block">
        <nav className="py-4 px-2 space-y-0.5">
          {REPORT_NAV.map((item, idx) => {
            if ('type' in item && item.type === 'divider') {
              return (
                <p key={idx} className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {item.label}
                </p>
              );
            }

            const nav = item as { label: string; href: string; icon: React.ComponentType<{ size?: number }>; exact?: boolean };
            const isActive = nav.exact
              ? pathname === nav.href
              : pathname.startsWith(nav.href);
            const Icon = nav.icon;

            return (
              <Link
                key={nav.href}
                href={nav.href}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon size={14} />
                {nav.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
