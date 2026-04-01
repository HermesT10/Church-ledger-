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
    <div className="flex min-h-[calc(100vh-4rem)] gap-6 px-5 py-6 lg:px-8 lg:py-8">
      {/* Sidebar */}
      <aside className="hidden w-72 shrink-0 md:block">
        <div className="sticky top-6 rounded-[1.5rem] border border-border/80 bg-white/98 p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <nav className="space-y-1">
          {REPORT_NAV.map((item, idx) => {
            if ('type' in item && item.type === 'divider') {
              return (
                <p key={idx} className="px-3 pt-4 pb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
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
                className={`flex items-center gap-2.5 rounded-xl border border-transparent px-3 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'border-transparent bg-primary text-primary-foreground font-medium shadow-[0_8px_20px_rgba(120,76,255,0.18)]'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon size={14} />
                {nav.label}
              </Link>
            );
          })}
        </nav>
        </div>
      </aside>

      {/* Content */}
      <main className="min-w-0 flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
