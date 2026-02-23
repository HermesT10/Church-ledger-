import Link from 'next/link';
import {
  Layers,
  Gift,
  BarChart3,
  ArrowLeftRight,
  TrendingUp,
  Users,
  Landmark,
  Plus,
  ShieldCheck,
  ChevronRight,
  BookOpen,
  PieChart,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';

/* ------------------------------------------------------------------ */
/*  Feature data                                                       */
/* ------------------------------------------------------------------ */

const FEATURES = [
  {
    icon: Layers,
    title: 'Fund Management',
    description: 'Track restricted, unrestricted, and designated funds with full SORP compliance.',
    tint: 'bg-emerald-100/70 dark:bg-emerald-950/20',
    iconBg: 'bg-emerald-200 dark:bg-emerald-900/40',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    icon: Gift,
    title: 'Gift Aid Tracking',
    description: 'Manage declarations, calculate claims, and maximise tax reclaims effortlessly.',
    tint: 'bg-pink-100/70 dark:bg-pink-950/20',
    iconBg: 'bg-pink-200 dark:bg-pink-900/40',
    iconColor: 'text-pink-600 dark:text-pink-400',
  },
  {
    icon: BarChart3,
    title: 'Budgets & Forecasts',
    description: 'Set annual budgets, track variance, and forecast cash flow across your funds.',
    tint: 'bg-amber-100/70 dark:bg-amber-950/20',
    iconBg: 'bg-amber-200 dark:bg-amber-900/40',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    icon: ArrowLeftRight,
    title: 'Bank Reconciliation',
    description: 'Import bank statements, auto-match transactions, and reconcile with confidence.',
    tint: 'bg-blue-100/70 dark:bg-blue-950/20',
    iconBg: 'bg-blue-200 dark:bg-blue-900/40',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    icon: TrendingUp,
    title: 'Reports & Compliance',
    description: 'Generate trustee reports, SOFA statements, and full audit trails in one click.',
    tint: 'bg-violet-100/70 dark:bg-violet-950/20',
    iconBg: 'bg-violet-200 dark:bg-violet-900/40',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
  {
    icon: Users,
    title: 'Multi-User Roles',
    description: 'Admin, treasurer, finance user, trustee viewer — everyone sees what they need.',
    tint: 'bg-cyan-100/70 dark:bg-cyan-950/20',
    iconBg: 'bg-cyan-200 dark:bg-cyan-900/40',
    iconColor: 'text-cyan-600 dark:text-cyan-400',
  },
] as const;

const TRUST_POINTS = [
  'Built for UK churches & charities',
  'Charity SORP-aware accounting',
  'Gift Aid ready out of the box',
  'Full audit trail & data export',
] as const;

/* ------------------------------------------------------------------ */
/*  Floating Showcase Cards (hero right)                               */
/* ------------------------------------------------------------------ */

function HeroShowcase() {
  return (
    <div className="relative w-full max-w-[400px] h-[420px] mx-auto">
      {/* Card 1: Balance */}
      <div className="absolute top-0 left-0 bg-white rounded-2xl shadow-xl p-5 w-[220px] border border-gray-100 dark:bg-gray-900 dark:border-gray-800">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
            <Landmark size={20} className="text-blue-600 dark:text-blue-400" />
          </div>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Current Balance
          </span>
        </div>
        <p className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
          £24,359
        </p>
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 font-medium">+12.4% from last month</p>
      </div>

      {/* Card 2: Fund Allocation */}
      <div className="absolute top-[110px] right-0 bg-white rounded-2xl shadow-xl p-5 w-[190px] border border-gray-100 dark:bg-gray-900 dark:border-gray-800">
        <div className="flex items-center justify-center mb-3">
          <div className="relative w-20 h-20">
            <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" className="text-gray-100 dark:text-gray-800" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#3b82f6" strokeWidth="3" strokeDasharray="65 35" strokeLinecap="round" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#f59e0b" strokeWidth="3" strokeDasharray="20 80" strokeDashoffset="-65" strokeLinecap="round" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#10b981" strokeWidth="3" strokeDasharray="15 85" strokeDashoffset="-85" strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold text-gray-800 dark:text-gray-100">65%</span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400">General</span>
            </div>
          </div>
        </div>
        <p className="text-center text-xs font-medium text-gray-500 dark:text-gray-400">Fund Allocation</p>
      </div>

      {/* Card 3: Recent Activity */}
      <div className="absolute bottom-[60px] left-[10px] bg-white rounded-2xl shadow-xl p-4 w-[240px] border border-gray-100 dark:bg-gray-900 dark:border-gray-800">
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3">Recent Activity</p>
        <div className="space-y-2.5">
          {[
            { label: 'Sunday Collection', amount: '+£1,245', color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'Utility Bill', amount: '-£186', color: 'text-rose-600 dark:text-rose-400' },
            { label: 'Gift Aid Claim', amount: '+£3,420', color: 'text-emerald-600 dark:text-emerald-400' },
          ].map((tx) => (
            <div key={tx.label} className="flex items-center justify-between text-xs">
              <span className="text-gray-600 dark:text-gray-400">{tx.label}</span>
              <span className={`font-semibold tabular-nums ${tx.color}`}>{tx.amount}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Card 4: Quick Action */}
      <div className="absolute bottom-0 right-[20px] bg-white rounded-2xl shadow-xl p-4 w-[160px] border border-dashed border-gray-200 dark:bg-gray-900 dark:border-gray-700">
        <div className="flex flex-col items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white shadow-lg">
            <Plus size={20} />
          </div>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">New Journal</span>
          <span className="text-[10px] text-gray-400">or import CSV</span>
        </div>
      </div>

      {/* Decorative gradient blur */}
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-400/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-violet-400/20 rounded-full blur-3xl pointer-events-none" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* ============================================================ */}
      {/*  Navbar                                                       */}
      {/* ============================================================ */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b border-border/50">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo size={36} />
            <span className="text-lg font-bold tracking-tight">ChurchLedger</span>
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild className="bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white shadow-md">
              <Link href="/signup">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ============================================================ */}
      {/*  Hero                                                         */}
      {/* ============================================================ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50/80 via-white to-violet-50/80 dark:from-blue-950/30 dark:via-background dark:to-violet-950/30 pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-6 py-20 lg:py-28">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Left: copy */}
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-100/80 dark:bg-blue-900/30 px-4 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 mb-6">
                <BookOpen size={14} />
                Purpose-built for UK churches
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]">
                Church finances,{' '}
                <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                  made simple
                </span>
              </h1>
              <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-md">
                Manage funds, track Gift Aid, reconcile bank accounts, and generate trustee reports — all in one place.
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-8">
                <Button asChild size="lg" className="bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-700 hover:to-violet-700 text-white shadow-lg h-12 px-8 text-base">
                  <Link href="/signup">
                    Get Started Free
                    <ChevronRight size={18} />
                  </Link>
                </Button>
                <Button variant="outline" size="lg" asChild className="h-12 px-8 text-base">
                  <a href="#features">See Features</a>
                </Button>
              </div>
              <div className="flex items-center gap-6 mt-8 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={15} className="text-emerald-500" />
                  Free to start
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={15} className="text-emerald-500" />
                  No credit card
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={15} className="text-emerald-500" />
                  SORP-ready
                </span>
              </div>
            </div>

            {/* Right: showcase */}
            <div className="hidden lg:block">
              <HeroShowcase />
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  Features                                                     */}
      {/* ============================================================ */}
      <section id="features" className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Everything your church needs
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              From Sunday collections to year-end reports, ChurchLedger handles the full financial lifecycle.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className={`rounded-2xl border border-transparent p-6 transition-shadow hover:shadow-lg ${f.tint}`}
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 ${f.iconBg}`}>
                    <Icon size={22} className={f.iconColor} />
                  </div>
                  <h3 className="text-base font-semibold mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {f.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  Trust / credibility strip                                    */}
      {/* ============================================================ */}
      <section className="border-y bg-muted/30">
        <div className="max-w-7xl mx-auto px-6 py-16">
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-4">
              <ShieldCheck size={24} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-6">
              Built with trust at the core
            </h2>
            <div className="flex flex-wrap justify-center gap-x-10 gap-y-4">
              {TRUST_POINTS.map((point) => (
                <span key={point} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                  {point}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  How it works                                                 */}
      {/* ============================================================ */}
      <section className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Up and running in minutes
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              No complicated setup. No accounting degree required.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              {
                step: '1',
                title: 'Create your organisation',
                description: 'Sign up, name your church, and invite your treasurer and trustees.',
              },
              {
                step: '2',
                title: 'Set up your funds & accounts',
                description: 'Use our guided setup wizard or import your existing chart of accounts.',
              },
              {
                step: '3',
                title: 'Start recording & reporting',
                description: 'Record journals, reconcile your bank, and generate reports instantly.',
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 text-white flex items-center justify-center mx-auto mb-4 text-lg font-bold shadow-lg">
                  {item.step}
                </div>
                <h3 className="text-base font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  CTA                                                          */}
      {/* ============================================================ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-violet-600 pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_60%)] pointer-events-none" />
        <div className="relative max-w-3xl mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
            Ready to simplify your church finances?
          </h2>
          <p className="mt-4 text-lg text-blue-100 max-w-lg mx-auto">
            Join churches already using ChurchLedger to manage their funds with clarity and confidence.
          </p>
          <div className="flex flex-wrap justify-center gap-4 mt-8">
            <Button asChild size="lg" className="bg-white text-blue-700 hover:bg-blue-50 shadow-lg h-12 px-8 text-base font-semibold">
              <Link href="/signup">
                Get Started Free
                <ChevronRight size={18} />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  Footer                                                       */}
      {/* ============================================================ */}
      <footer className="border-t bg-muted/20">
        <div className="max-w-7xl mx-auto px-6 py-10">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Logo size={28} />
              <span className="text-sm font-semibold">ChurchLedger</span>
            </div>
            <p className="text-xs text-muted-foreground">
              &copy; {new Date().getFullYear()} ChurchLedger. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
