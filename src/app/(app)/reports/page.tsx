import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import {
  FileText,
  Scale,
  Landmark,
  Banknote,
  Activity,
  TrendingUp,
  PieChart,
  DollarSign,
  ShoppingCart,
  Users,
  Calendar,
  CalendarRange,
  Download,
  BarChart3,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';

const REPORT_CARDS = [
  {
    title: 'Income Statement',
    description: 'Revenue and expenses for a period with fund breakdown.',
    href: '/reports/income-statement',
    icon: FileText,
    color: 'text-emerald-600',
    bg: 'bg-emerald-100/75',
    border: 'border-emerald-200/50',
  },
  {
    title: 'Balance Sheet',
    description: 'Assets, liabilities, and net assets as of a date.',
    href: '/reports/balance-sheet',
    icon: Scale,
    color: 'text-blue-600',
    bg: 'bg-blue-100/75',
    border: 'border-blue-200/50',
  },
  {
    title: 'SOFA',
    description: 'Statement of Financial Activities by fund type.',
    href: '/reports/sofa',
    icon: Landmark,
    color: 'text-violet-600',
    bg: 'bg-violet-100/75',
    border: 'border-violet-200/50',
  },
  {
    title: 'Cash Flow',
    description: 'Cash movements, opening and closing balances.',
    href: '/reports/cash-flow',
    icon: Banknote,
    color: 'text-teal-600',
    bg: 'bg-teal-100/75',
    border: 'border-teal-200/50',
  },
  {
    title: 'Trial Balance',
    description: 'All accounts with debit and credit totals.',
    href: '/reports/trial-balance',
    icon: Activity,
    color: 'text-slate-600',
    bg: 'bg-slate-100/75',
    border: 'border-slate-200/50',
  },
  {
    title: 'Budget vs Actual',
    description: 'Compare planned budget to actual results.',
    href: '/reports/budget-vs-actual',
    icon: TrendingUp,
    color: 'text-amber-600',
    bg: 'bg-amber-100/75',
    border: 'border-amber-200/50',
  },
  {
    title: 'Fund Movements',
    description: 'Opening, income, expenses, and closing by fund.',
    href: '/reports/fund-movements',
    icon: PieChart,
    color: 'text-rose-600',
    bg: 'bg-rose-100/75',
    border: 'border-rose-200/50',
  },
  {
    title: 'Forecast',
    description: 'Year-end projection based on trend and baseline.',
    href: '/reports/forecast',
    icon: BarChart3,
    color: 'text-cyan-600',
    bg: 'bg-cyan-100/75',
    border: 'border-cyan-200/50',
  },
  {
    title: 'Cash Position',
    description: 'Bank balances compared to GL balances.',
    href: '/reports/cash-position',
    icon: DollarSign,
    color: 'text-green-600',
    bg: 'bg-green-100/75',
    border: 'border-green-200/50',
  },
  {
    title: 'Supplier Spend',
    description: 'Total spending by supplier for the year.',
    href: '/reports/supplier-spend',
    icon: ShoppingCart,
    color: 'text-orange-600',
    bg: 'bg-orange-100/75',
    border: 'border-orange-200/50',
  },
  {
    title: 'Trustee Snapshot',
    description: 'Executive summary: cash, funds, variances, forecast.',
    href: '/reports/trustee-snapshot',
    icon: Users,
    color: 'text-indigo-600',
    bg: 'bg-indigo-100/75',
    border: 'border-indigo-200/50',
  },
  {
    title: 'Quarterly Report',
    description: 'Quarter-by-quarter income, expenses, and fund balances.',
    href: '/reports/quarterly',
    icon: Calendar,
    color: 'text-purple-600',
    bg: 'bg-purple-100/75',
    border: 'border-purple-200/50',
  },
  {
    title: 'Annual Report',
    description: 'Full-year pack with all key financial statements.',
    href: '/reports/annual',
    icon: CalendarRange,
    color: 'text-pink-600',
    bg: 'bg-pink-100/75',
    border: 'border-pink-200/50',
  },
  {
    title: 'AGM Pack',
    description: 'Simplified, presentation-ready summary for members.',
    href: '/reports/agm',
    icon: Users,
    color: 'text-fuchsia-600',
    bg: 'bg-fuchsia-100/75',
    border: 'border-fuchsia-200/50',
  },
  {
    title: 'Export Pack',
    description: 'Download all reports as CSV files.',
    href: '/reports/export-pack',
    icon: Download,
    color: 'text-gray-600',
    bg: 'bg-gray-100/75',
    border: 'border-gray-200/50',
  },
];

export default async function ReportsLandingPage() {
  await getActiveOrg();

  return (
    <PageShell>
      <PageHeader
        title="Reports"
        subtitle="Generate financial statements, analysis reports, and trustee packs — all derived from the General Ledger."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORT_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href} href={card.href} className="group">
              <Card className={`h-full border transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-1 hover:ring-primary/15 ${card.border}`}>
                <CardContent className="flex items-start gap-4 px-5 pb-5 pt-5">
                  <div className={`rounded-2xl p-3 shadow-inner ${card.bg} shrink-0`}>
                    <Icon size={18} className={card.color} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Report
                    </p>
                    <p className="mt-2 text-base font-semibold group-hover:text-primary transition-colors">
                      {card.title}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                      {card.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </PageShell>
  );
}
