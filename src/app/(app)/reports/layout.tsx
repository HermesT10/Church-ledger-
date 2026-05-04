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
  HeartHandshake,
  WalletCards,
  Presentation,
} from 'lucide-react';

const REPORT_NAV = [
  { label: 'Overview', href: '/reports', icon: BarChart3, exact: true },
  { type: 'divider' as const, label: 'Financial Statements' },
  { label: 'Monthly Dashboard', href: '/reports/monthly-dashboard', icon: BarChart3 },
  { label: 'Income Statement', href: '/reports/income-statement', icon: FileText },
  { label: 'Balance Sheet', href: '/reports/balance-sheet', icon: Scale },
  { label: 'SOFA', href: '/reports/sofa', icon: Landmark },
  { label: 'Cash Flow', href: '/reports/cash-flow', icon: Banknote },
  { label: 'Trial Balance', href: '/reports/trial-balance', icon: Activity },
  { type: 'divider' as const, label: 'Analysis' },
  { label: 'Budget vs Actual', href: '/reports/budget-vs-actual', icon: TrendingUp },
  { label: 'Fund Movements', href: '/reports/fund-movements', icon: PieChart },
  { label: 'Bank Reconciliation', href: '/reports/bank-reconciliation-summary', icon: WalletCards },
  { label: 'Gift Aid Summary', href: '/reports/gift-aid-summary', icon: HeartHandshake },
  { label: 'Forecast', href: '/reports/forecast', icon: TrendingUp },
  { label: 'Cash Position', href: '/reports/cash-position', icon: DollarSign },
  { label: 'Supplier Spend', href: '/reports/supplier-spend', icon: ShoppingCart },
  { type: 'divider' as const, label: 'Packs & Snapshots' },
  { label: 'Trustee Snapshot', href: '/reports/trustee-snapshot', icon: Users },
  { label: 'Leadership Snapshot', href: '/reports/leadership-snapshot', icon: Presentation },
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
      <aside className="hidden w-64 shrink-0 overflow-y-auto border-r border-border/70 bg-background/80 md:block">
        <nav className="space-y-1 px-3 py-4">
          {REPORT_NAV.map((item, idx) => {
            if ('type' in item && item.type === 'divider') {
              return (
                <p key={idx} className="px-3 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
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
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground font-medium shadow-card'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
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
