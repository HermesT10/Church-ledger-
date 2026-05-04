'use client';

import { useState, type ComponentType } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Banknote,
  BarChart3,
  Calendar,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  HeartHandshake,
  Landmark,
  PieChart,
  Presentation,
  Scale,
  Search,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type ReportGroup =
  | 'Financial Statements'
  | 'Management & Analysis'
  | 'Compliance & Controls'
  | 'Church Operations'
  | 'Packs & Snapshots';

type ReportAudience = 'Treasurer' | 'Trustee' | 'Leadership' | 'Examiner';
type ReportOutput = 'PDF' | 'Excel' | 'Word' | 'CSV' | 'Pack';
type PreviewType = 'bar' | 'line' | 'table' | 'checklist' | 'document' | 'donut';

interface ReportCardMeta {
  key: string;
  title: string;
  description: string;
  href: string;
  icon: ComponentType<{ className?: string; size?: number; 'aria-hidden'?: boolean }>;
  group: ReportGroup;
  audience: ReportAudience[];
  outputs: ReportOutput[];
  preview: PreviewType;
  featured?: boolean;
}

const REPORTS: ReportCardMeta[] = [
  {
    key: 'monthly-dashboard',
    title: 'Monthly Dashboard',
    description: 'Leadership-ready dashboard with monthly trends, risks, and next actions.',
    href: '/reports/monthly-dashboard',
    icon: BarChart3,
    group: 'Packs & Snapshots',
    audience: ['Treasurer', 'Trustee', 'Leadership'],
    outputs: ['PDF', 'CSV'],
    preview: 'line',
    featured: true,
  },
  {
    key: 'trustee-snapshot',
    title: 'Trustee Snapshot',
    description: 'Executive summary of cash, funds, variances, and forecast risk.',
    href: '/reports/trustee-snapshot',
    icon: Users,
    group: 'Packs & Snapshots',
    audience: ['Trustee', 'Leadership'],
    outputs: ['PDF', 'Word'],
    preview: 'document',
    featured: true,
  },
  {
    key: 'annual-report',
    title: 'Annual Report',
    description: 'Full-year annual pack with statements and supporting schedules.',
    href: '/reports/annual',
    icon: CalendarRange,
    group: 'Packs & Snapshots',
    audience: ['Treasurer', 'Trustee', 'Examiner'],
    outputs: ['PDF', 'Excel', 'Word', 'Pack'],
    preview: 'document',
    featured: true,
  },
  {
    key: 'agm-pack',
    title: 'AGM Pack',
    description: 'Presentation-ready annual summary for members and trustees.',
    href: '/reports/agm',
    icon: Users,
    group: 'Packs & Snapshots',
    audience: ['Trustee', 'Leadership'],
    outputs: ['PDF', 'Excel', 'Word', 'Pack'],
    preview: 'document',
    featured: true,
  },
  {
    key: 'income-statement',
    title: 'Income Statement',
    description: 'Revenue and expenses for a period with fund breakdown.',
    href: '/reports/income-statement',
    icon: FileText,
    group: 'Financial Statements',
    audience: ['Treasurer', 'Trustee', 'Examiner'],
    outputs: ['PDF', 'Excel', 'CSV'],
    preview: 'table',
  },
  {
    key: 'balance-sheet',
    title: 'Balance Sheet',
    description: 'Assets, liabilities, and net assets as of a date.',
    href: '/reports/balance-sheet',
    icon: Scale,
    group: 'Financial Statements',
    audience: ['Treasurer', 'Trustee', 'Examiner'],
    outputs: ['PDF', 'Excel', 'CSV'],
    preview: 'table',
  },
  {
    key: 'sofa',
    title: 'SOFA',
    description: 'Statement of Financial Activities by fund type.',
    href: '/reports/sofa',
    icon: Landmark,
    group: 'Financial Statements',
    audience: ['Treasurer', 'Trustee', 'Examiner'],
    outputs: ['PDF', 'Excel', 'Word', 'CSV'],
    preview: 'table',
  },
  {
    key: 'cash-flow',
    title: 'Cash Flow',
    description: 'Cash movements, opening and closing balances.',
    href: '/reports/cash-flow',
    icon: Banknote,
    group: 'Financial Statements',
    audience: ['Treasurer', 'Trustee', 'Examiner'],
    outputs: ['PDF', 'Excel', 'CSV'],
    preview: 'bar',
  },
  {
    key: 'trial-balance',
    title: 'Trial Balance',
    description: 'All accounts with debit and credit totals.',
    href: '/reports/trial-balance',
    icon: Activity,
    group: 'Financial Statements',
    audience: ['Treasurer', 'Examiner'],
    outputs: ['PDF', 'Excel', 'CSV'],
    preview: 'table',
  },
  {
    key: 'income-expense-summary',
    title: 'Income & Expense Summary',
    description: 'Monthly income, expense, net position, and category totals.',
    href: '/reports/income-expense-summary',
    icon: BarChart3,
    group: 'Management & Analysis',
    audience: ['Treasurer', 'Trustee'],
    outputs: ['PDF', 'Excel', 'CSV'],
    preview: 'bar',
  },
  {
    key: 'budget-vs-actual',
    title: 'Budget vs Actual',
    description: 'Compare planned budget to actual results.',
    href: '/reports/budget-vs-actual',
    icon: TrendingUp,
    group: 'Management & Analysis',
    audience: ['Treasurer', 'Trustee', 'Leadership'],
    outputs: ['PDF', 'Excel', 'CSV'],
    preview: 'bar',
  },
  {
    key: 'fund-movements',
    title: 'Fund Movements',
    description: 'Opening, income, expenses, and closing by fund.',
    href: '/reports/fund-movements',
    icon: PieChart,
    group: 'Management & Analysis',
    audience: ['Treasurer', 'Trustee', 'Examiner'],
    outputs: ['PDF', 'Excel', 'CSV'],
    preview: 'donut',
  },
  {
    key: 'forecast',
    title: 'Forecast',
    description: 'Year-end projection based on trend and baseline.',
    href: '/reports/forecast',
    icon: BarChart3,
    group: 'Management & Analysis',
    audience: ['Treasurer', 'Trustee', 'Leadership'],
    outputs: ['PDF', 'Excel', 'CSV'],
    preview: 'line',
  },
  {
    key: 'cash-position',
    title: 'Cash Position',
    description: 'Bank balances compared to GL balances.',
    href: '/reports/cash-position',
    icon: Banknote,
    group: 'Management & Analysis',
    audience: ['Treasurer', 'Trustee'],
    outputs: ['PDF', 'Excel', 'CSV'],
    preview: 'checklist',
  },
  {
    key: 'supplier-spend',
    title: 'Supplier Spend',
    description: 'Total spending by supplier for the year.',
    href: '/reports/supplier-spend',
    icon: ShoppingCart,
    group: 'Management & Analysis',
    audience: ['Treasurer', 'Trustee'],
    outputs: ['PDF', 'Excel', 'CSV'],
    preview: 'bar',
  },
  {
    key: 'bank-reconciliation',
    title: 'Bank Reconciliation',
    description: 'Latest statement, GL balance, and unreconciled items.',
    href: '/reports/bank-reconciliation-summary',
    icon: WalletCards,
    group: 'Compliance & Controls',
    audience: ['Treasurer', 'Trustee', 'Examiner'],
    outputs: ['PDF', 'Excel', 'CSV'],
    preview: 'checklist',
  },
  {
    key: 'gift-aid-summary',
    title: 'Gift Aid Summary',
    description: 'Claim status, reclaim opportunity, and declaration coverage.',
    href: '/reports/gift-aid-summary',
    icon: HeartHandshake,
    group: 'Compliance & Controls',
    audience: ['Treasurer', 'Trustee', 'Examiner'],
    outputs: ['PDF', 'CSV'],
    preview: 'checklist',
  },
  {
    key: 'charity-accounts-assistant',
    title: 'Charity Accounts Assistant',
    description: 'Guided accounts, trustee report, examiner pack, and Annual Return preparation.',
    href: '/reports/charity-accounts-assistant',
    icon: FileCheck2,
    group: 'Compliance & Controls',
    audience: ['Treasurer', 'Trustee', 'Examiner'],
    outputs: ['PDF', 'Word', 'Pack'],
    preview: 'checklist',
  },
  {
    key: 'year-end-close',
    title: 'Year-End Close',
    description: 'Guided close, period lock, filing pack, and Annual Return Assistant.',
    href: '/year-end-close',
    icon: ShieldCheck,
    group: 'Compliance & Controls',
    audience: ['Treasurer', 'Trustee', 'Examiner'],
    outputs: ['PDF', 'Pack'],
    preview: 'checklist',
  },
  {
    key: 'lettings-income',
    title: 'Lettings Income',
    description: 'Hall hire income by hirer, month, outstanding amounts, and year-to-date totals.',
    href: '/reports/lettings',
    icon: CalendarDays,
    group: 'Church Operations',
    audience: ['Treasurer', 'Leadership'],
    outputs: ['PDF', 'Excel', 'CSV'],
    preview: 'bar',
  },
  {
    key: 'leadership-snapshot',
    title: 'Leadership Snapshot',
    description: 'Plain-English board view with commentary, trends, and key actions.',
    href: '/reports/leadership-snapshot',
    icon: Presentation,
    group: 'Packs & Snapshots',
    audience: ['Trustee', 'Leadership'],
    outputs: ['PDF', 'Word'],
    preview: 'document',
  },
  {
    key: 'quarterly-report',
    title: 'Quarterly Report',
    description: 'Quarter-by-quarter income, expenses, and fund balances.',
    href: '/reports/quarterly',
    icon: Calendar,
    group: 'Packs & Snapshots',
    audience: ['Treasurer', 'Trustee', 'Leadership'],
    outputs: ['PDF', 'Excel', 'Word', 'CSV'],
    preview: 'document',
  },
  {
    key: 'export-pack',
    title: 'Export Pack',
    description: 'Download report outputs and supporting schedules for audit or handover.',
    href: '/reports/export-pack',
    icon: Download,
    group: 'Packs & Snapshots',
    audience: ['Treasurer', 'Examiner'],
    outputs: ['PDF', 'Excel', 'Word', 'CSV', 'Pack'],
    preview: 'document',
  },
];

const GROUP_ORDER: ReportGroup[] = [
  'Financial Statements',
  'Management & Analysis',
  'Compliance & Controls',
  'Church Operations',
  'Packs & Snapshots',
];

const OUTPUTS: Array<'all' | ReportOutput> = ['all', 'PDF', 'Excel', 'Word', 'CSV', 'Pack'];
const AUDIENCES: Array<'all' | ReportAudience> = ['all', 'Treasurer', 'Trustee', 'Leadership', 'Examiner'];
const GROUPS: Array<'all' | ReportGroup> = ['all', ...GROUP_ORDER];

function MiniPreview({ type }: { type: PreviewType }) {
  if (type === 'line') {
    return (
      <div className="flex h-24 items-end gap-2 rounded-2xl bg-muted/35 p-4">
        {[28, 42, 36, 56, 48, 68].map((height, index) => (
          <span key={index} className="flex-1 rounded-full bg-info/25" style={{ height }} />
        ))}
      </div>
    );
  }

  if (type === 'bar') {
    return (
      <div className="flex h-24 items-end gap-2 rounded-2xl bg-muted/35 p-4">
        {[52, 34, 70, 44, 62].map((height, index) => (
          <span key={index} className="flex-1 rounded-t-xl bg-primary/25" style={{ height }} />
        ))}
      </div>
    );
  }

  if (type === 'donut') {
    return (
      <div className="flex h-24 items-center justify-center rounded-2xl bg-muted/35">
        <div className="h-16 w-16 rounded-full border-[12px] border-primary/20 border-t-primary/50" />
      </div>
    );
  }

  if (type === 'checklist') {
    return (
      <div className="space-y-2 rounded-2xl bg-muted/35 p-4">
        {[0, 1, 2].map((item) => (
          <div key={item} className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            <span className="h-2 flex-1 rounded-full bg-border/80" />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'document') {
    return (
      <div className="relative h-24 rounded-2xl bg-muted/35 p-4">
        <div className="absolute left-6 top-5 h-14 w-10 rounded-lg border bg-background shadow-card" />
        <div className="absolute left-12 top-3 h-16 w-11 rounded-lg border bg-background shadow-card" />
        <div className="absolute left-[74px] top-6 h-12 w-20 space-y-2 rounded-lg border bg-background p-3 shadow-card">
          <span className="block h-1.5 rounded-full bg-border" />
          <span className="block h-1.5 rounded-full bg-border" />
          <span className="block h-1.5 w-2/3 rounded-full bg-border" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl bg-muted/35 p-4">
      {[0, 1, 2, 3].map((item) => (
        <span key={item} className="block h-2 rounded-full bg-border/80" />
      ))}
    </div>
  );
}

function ReportCard({ report, featured = false }: { report: ReportCardMeta; featured?: boolean }) {
  const Icon = report.icon;

  return (
    <Card className={cn(
      'group h-full overflow-hidden rounded-3xl border-border/70 bg-card shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-soft',
      featured && 'min-h-[320px]',
    )}>
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Icon size={19} aria-hidden />
          </span>
          <Badge variant="secondary">Not generated yet</Badge>
        </div>
        <div>
          <h3 className="text-base font-semibold tracking-tight group-hover:text-primary">{report.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{report.description}</p>
        </div>
        <MiniPreview type={report.preview} />
        <div className="mt-auto space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {report.outputs.slice(0, 3).map((output) => (
              <Badge key={output} variant="outline" className="text-[10px]">
                {output}
              </Badge>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" className="flex-1">
              <Link href={report.href} aria-label={`Open ${report.title}`}>
                Open
                <ArrowRight size={14} aria-hidden />
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/reports/export-pack" aria-label={`Open export pack for ${report.title}`}>
                Export
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReportsRightPanel() {
  const flow = [
    { label: 'Review Monthly Dashboard', href: '/reports/monthly-dashboard' },
    { label: 'Check Bank Reconciliation', href: '/reports/bank-reconciliation-summary' },
    { label: 'Review Budget vs Actual', href: '/reports/budget-vs-actual' },
    { label: 'Generate Trustee Snapshot', href: '/reports/trustee-snapshot' },
    { label: 'Export Pack', href: '/reports/export-pack' },
  ];

  return (
    <div className="space-y-5">
      <Card className="rounded-3xl border-border/70 bg-card shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Recommended Report Flow</CardTitle>
          <p className="text-xs text-muted-foreground">A clean order for trustee-ready monthly reporting.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {flow.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition hover:bg-accent/45"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                {index + 1}
              </span>
              <span className="flex-1 font-medium">{item.label}</span>
              <ArrowRight size={14} className="text-muted-foreground" />
            </Link>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-border/70 bg-card shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Report Health</CardTitle>
          <p className="text-xs text-muted-foreground">Readiness indicators for the reporting pack.</p>
        </CardHeader>
        <CardContent className="grid gap-3">
          {[
            ['Reports ready', 'Routes available'],
            ['Needs review', 'Reconciliation and mappings'],
            ['Last export', 'Not generated yet'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-muted/35 px-4 py-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-sm font-semibold">{value}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-3xl border-border/70 bg-card shadow-card">
        <CardHeader>
          <CardTitle className="text-base">Recently Generated</CardTitle>
          <p className="text-xs text-muted-foreground">Generated report exports will appear here.</p>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl border border-dashed border-border/80 p-5 text-sm text-muted-foreground">
            No report exports generated yet. Start with the Export Pack when you are ready to share reports.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ReportsCommandCentre() {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<'all' | ReportGroup>('all');
  const [output, setOutput] = useState<'all' | ReportOutput>('all');
  const [audience, setAudience] = useState<'all' | ReportAudience>('all');

  const featuredReports = REPORTS.filter((report) => report.featured);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredReports = REPORTS.filter((report) => {
    if (report.featured) return false;
    if (group !== 'all' && report.group !== group) return false;
    if (output !== 'all' && !report.outputs.includes(output)) return false;
    if (audience !== 'all' && !report.audience.includes(audience)) return false;
    if (!normalizedQuery) return true;
    return `${report.title} ${report.description}`.toLowerCase().includes(normalizedQuery);
  });
  const groupedReports = GROUP_ORDER.map((groupName) => ({
    groupName,
    reports: filteredReports.filter((report) => report.group === groupName),
  })).filter((section) => section.reports.length > 0);

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-card to-surface-muted/60 p-6 shadow-card">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Badge variant="secondary">Reporting command centre</Badge>
            <h1 className="mt-4 text-3xl font-bold tracking-tight">Reports</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Generate trustee-ready reports, financial statements, compliance summaries, and annual packs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/reports/export-pack">Create Report Pack</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/reports/export-pack">Export Pack</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/year-end-close">Year-End Assistant</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Featured Reports</h2>
          <p className="text-sm text-muted-foreground">Start here for monthly oversight, trustee review, and annual packs.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {featuredReports.map((report) => (
            <ReportCard key={report.key} report={report} featured />
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="rounded-3xl border-border/70 bg-card shadow-card">
            <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_180px_150px_170px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search reports"
                  className="pl-9"
                />
              </div>
              <select value={group} onChange={(event) => setGroup(event.target.value as typeof group)} className="h-10 rounded-xl border border-border/70 bg-background px-3 text-sm">
                {GROUPS.map((item) => (
                  <option key={item} value={item}>{item === 'all' ? 'All categories' : item}</option>
                ))}
              </select>
              <select value={output} onChange={(event) => setOutput(event.target.value as typeof output)} className="h-10 rounded-xl border border-border/70 bg-background px-3 text-sm">
                {OUTPUTS.map((item) => (
                  <option key={item} value={item}>{item === 'all' ? 'All outputs' : item}</option>
                ))}
              </select>
              <select value={audience} onChange={(event) => setAudience(event.target.value as typeof audience)} className="h-10 rounded-xl border border-border/70 bg-background px-3 text-sm">
                {AUDIENCES.map((item) => (
                  <option key={item} value={item}>{item === 'all' ? 'All audiences' : item}</option>
                ))}
              </select>
            </CardContent>
          </Card>

          {groupedReports.length === 0 ? (
            <Card className="rounded-3xl border-dashed border-border/80">
              <CardContent className="p-8 text-center">
                <p className="text-sm font-semibold">No reports match those filters.</p>
                <p className="mt-1 text-sm text-muted-foreground">Clear search or choose a broader category.</p>
              </CardContent>
            </Card>
          ) : (
            groupedReports.map((section) => (
              <section key={section.groupName} className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">{section.groupName}</h2>
                  <p className="text-sm text-muted-foreground">{section.reports.length} report{section.reports.length === 1 ? '' : 's'} available</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                  {section.reports.map((report) => (
                    <ReportCard key={report.key} report={report} />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        <ReportsRightPanel />
      </div>
    </div>
  );
}
