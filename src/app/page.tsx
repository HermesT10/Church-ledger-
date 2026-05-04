import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  FileText,
  Gift,
  Landmark,
  Layers,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/logo';

const FEATURE_TILES = [
  {
    icon: Layers,
    title: 'Fund Accounting',
    description: 'Track restricted, unrestricted, and designated funds without losing the audit trail.',
  },
  {
    icon: Landmark,
    title: 'Bank Reconciliation',
    description: 'Import statements, match transactions, and keep cash records clean month by month.',
  },
  {
    icon: Gift,
    title: 'Gift Aid Ready',
    description: 'Manage declarations, donation eligibility, claims, and HMRC-ready schedules in one flow.',
  },
  {
    icon: FileText,
    title: 'Trustee Reporting',
    description: 'Turn day-to-day activity into board-ready summaries, SOFA views, and annual packs.',
  },
] as const;

const SHOWCASE_CARDS = [
  {
    title: 'Monthly cashflow',
    caption: 'Income, spend, and fund movement at a glance.',
    metric: '£18.4k',
    label: 'January income',
  },
  {
    title: 'Restricted funds',
    caption: 'Know what can be spent before decisions are made.',
    metric: '12',
    label: 'Active funds',
  },
] as const;

const TESTIMONIALS = [
  {
    eyebrow: 'Treasurer workflow',
    quote: 'Sunday giving, bills, Gift Aid, and fund reports sit together in one place so month end is easier to finish.',
    name: 'Treasurer',
    role: 'Local church finance team',
  },
  {
    eyebrow: 'Trustee confidence',
    quote: 'Trustees get clear summaries without needing to understand every accounting detail behind the numbers.',
    name: 'Trustee',
    role: 'Governance board',
  },
  {
    eyebrow: 'Audit-ready records',
    quote: 'Every posting, allocation, and reset has a trail, which makes reviews and handovers far less stressful.',
    name: 'Finance admin',
    role: 'Operations team',
  },
] as const;

function MarketingNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <Logo size={38} />
          <span className="text-lg font-bold tracking-tight">ChurchLedger</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
          <a href="#features" className="transition hover:text-foreground">Features</a>
          <a href="#reporting" className="transition hover:text-foreground">Reporting</a>
          <a href="#trust" className="transition hover:text-foreground">Trust</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild className="rounded-full px-5 shadow-card">
            <Link href="/signup">
              Get started
              <ArrowRight size={16} />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function PhoneMockup() {
  return (
    <div className="relative mx-auto h-[520px] max-w-[520px] lg:mr-0">
      <div className="absolute inset-x-4 top-10 h-80 rounded-[3rem] bg-gradient-to-br from-primary/20 via-chart-3/20 to-transparent blur-3xl" />
      <div className="landing-float absolute right-8 top-0 hidden h-[430px] w-[214px] rounded-[2.4rem] border-[10px] border-foreground bg-background shadow-modal sm:block">
        <div className="mx-auto mt-3 h-6 w-24 rounded-full bg-foreground" />
        <div className="p-5 pt-8">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Funds</span>
            <span>9:41</span>
          </div>
          <div className="mt-6 rounded-3xl bg-foreground p-4 text-background">
            <p className="text-xs text-background/60">Available cash</p>
            <p className="mt-2 text-3xl font-bold">£24,359</p>
            <div className="mt-4 h-2 rounded-full bg-background/20">
              <div className="h-2 w-2/3 rounded-full bg-primary" />
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {['General Fund', 'Youth Fund', 'Building Fund'].map((item, index) => (
              <div key={item} className="rounded-2xl border border-border/70 bg-card p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">{item}</span>
                  <span className="text-muted-foreground">{[64, 22, 14][index]}%</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-muted">
                  <div
                    className="h-1.5 rounded-full bg-primary"
                    style={{ width: `${[64, 22, 14][index]}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="landing-float-slow absolute left-0 top-28 w-[330px] rounded-[2rem] border border-border/70 bg-card/95 p-6 shadow-modal backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Cash position</p>
            <p className="mt-2 text-4xl font-bold tracking-tight">£24,359</p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-primary">
            <WalletCards size={22} />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-7 items-end gap-2">
          {[40, 54, 44, 70, 86, 61, 74].map((height, index) => (
            <div key={index} className="rounded-full bg-muted">
              <div
                className="rounded-full bg-gradient-to-t from-primary to-chart-2"
                style={{ height }}
              />
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between rounded-2xl bg-success-soft p-3 text-sm">
          <span className="font-medium text-success">Gift Aid claim ready</span>
          <span className="font-semibold text-success">£3,420</span>
        </div>
      </div>

      <div className="landing-float absolute bottom-10 right-4 w-64 rounded-3xl border border-border/70 bg-card p-4 shadow-card">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Recent activity</p>
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span>Sunday collection</span>
            <span className="font-semibold text-success">+£1,245</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Utilities</span>
            <span className="font-semibold text-danger">-£186</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Restricted grant</span>
            <span className="font-semibold text-success">+£5,000</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,color-mix(in_srgb,var(--primary)_18%,transparent),transparent_34%),radial-gradient(circle_at_20%_0%,color-mix(in_srgb,var(--chart-2)_14%,transparent),transparent_28%)]" />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-6 md:py-24 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:py-28">
        <div className="flex flex-col justify-center">
          <div className="landing-fade-up inline-flex w-fit items-center gap-2 rounded-full border border-border/70 bg-card/80 px-4 py-2 text-sm font-medium text-muted-foreground shadow-card backdrop-blur">
            <Sparkles size={15} className="text-primary" />
            Purpose-built finance for UK churches
          </div>
          <h1 className="landing-fade-up mt-7 max-w-3xl text-5xl font-black tracking-[-0.07em] text-foreground sm:text-6xl lg:text-7xl">
            Church finances made incredibly simple.
          </h1>
          <p className="landing-fade-up mt-6 max-w-xl text-base leading-8 text-muted-foreground sm:text-lg">
            Manage restricted funds, Gift Aid, bank reconciliation, budgets, and trustee reports in one calm workspace built for church teams.
          </p>
          <div className="landing-fade-up mt-9 flex flex-wrap gap-3">
            <Button size="lg" asChild className="h-12 rounded-full px-7 shadow-card">
              <Link href="/signup">
                Start free
                <ChevronRight size={18} />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="h-12 rounded-full px-7 bg-card/80">
              <a href="#features">Explore features</a>
            </Button>
          </div>
          <div className="landing-fade-up mt-10 grid max-w-xl grid-cols-3 gap-5 border-t border-border/70 pt-7">
            <div>
              <p className="text-3xl font-bold tracking-tight">SORP</p>
              <p className="mt-1 text-xs text-muted-foreground">Aware reporting</p>
            </div>
            <div>
              <p className="text-3xl font-bold tracking-tight">Roles</p>
              <p className="mt-1 text-xs text-muted-foreground">For trustees and finance teams</p>
            </div>
            <div>
              <p className="text-3xl font-bold tracking-tight">Audit</p>
              <p className="mt-1 text-xs text-muted-foreground">Trails by default</p>
            </div>
          </div>
        </div>
        <PhoneMockup />
      </div>
    </section>
  );
}

function DarkFeatureBand() {
  return (
    <section id="features" className="px-5 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-12 rounded-[2rem] bg-foreground p-8 text-background shadow-modal sm:rounded-[3rem] sm:p-12 lg:grid-cols-[0.75fr_1.25fr] lg:p-16">
        <div className="flex flex-col justify-between gap-10">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-background/45">Finally, a better way</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.06em] sm:text-5xl">
              Simple church payments, funds, and reports.
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <ShieldCheck size={20} />
            </div>
            <div className="text-sm">
              <p className="font-semibold">Secure, role-aware workflows</p>
              <p className="text-background/50">Designed for accountable stewardship.</p>
            </div>
          </div>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {FEATURE_TILES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div key={feature.title} className="border-b border-background/10 pb-8">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-background/10 bg-background/10">
                    <Icon size={20} />
                  </div>
                  <h3 className="text-lg font-semibold">{feature.title}</h3>
                </div>
                <p className="mt-5 text-sm leading-6 text-background/55">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PeaceOfMindSection() {
  return (
    <section id="reporting" className="overflow-hidden px-5 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-4xl text-5xl font-black tracking-[-0.07em] sm:text-6xl lg:text-7xl">
          Experience your finances with peace of mind.
        </h2>
        <div className="mt-12 grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="relative min-h-[420px] overflow-hidden rounded-[2rem] bg-[#071129] p-8 shadow-modal">
            <div className="absolute -right-24 top-8 h-80 w-80 rounded-full bg-primary/40 blur-3xl" />
            <div className="absolute -bottom-24 left-4 h-72 w-72 rounded-full bg-info/30 blur-3xl" />
            <div className="relative rounded-[1.75rem] border border-white/10 bg-white/10 p-6 text-white backdrop-blur">
              <p className="text-xs uppercase tracking-[0.2em] text-white/50">Trustee pack</p>
              <p className="mt-4 text-4xl font-bold">Ready for review</p>
              <div className="mt-8 space-y-4">
                {['Cash position reconciled', 'Gift Aid schedule checked', 'Fund report generated'].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-2xl bg-white/10 p-3 text-sm">
                    <CheckCircle2 size={16} className="text-success" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-7">
            <div className="border-b border-border/70 pb-7">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-lg font-bold">Fast month-end close</h3>
                <ArrowRight size={18} />
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                See open bank allocations, unreconciled lines, overspend risks, and report readiness before trustees ask.
              </p>
            </div>
            <div className="border-b border-border/70 pb-7">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-lg font-bold">User-friendly experience</h3>
                <ArrowRight size={18} />
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Treasurer, finance user, trustee, and auditor views keep each person focused on what matters to them.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="rounded-3xl bg-muted/70 p-6">
                <p className="text-5xl font-black tracking-tight">4</p>
                <p className="mt-1 text-sm font-medium">Core workflows</p>
                <p className="mt-8 text-sm text-muted-foreground">Funds, banking, Gift Aid, reports.</p>
              </div>
              <div className="rounded-3xl bg-foreground p-6 text-background">
                <p className="text-5xl font-black tracking-tight">24/7</p>
                <p className="mt-1 text-sm font-medium">Audit trail</p>
                <p className="mt-8 text-sm text-background/55">Every important action is recorded.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ShowcaseSection() {
  return (
    <section className="px-5 py-16 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Best experience</p>
          <h2 className="mt-3 text-4xl font-black tracking-[-0.06em] sm:text-5xl">Feel the difference in every finance task</h2>
        </div>
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {SHOWCASE_CARDS.map((card, index) => (
            <div key={card.title} className="min-h-[360px] rounded-[2rem] bg-gradient-to-br from-muted/60 to-card p-8 shadow-card">
              <div className="relative mx-auto h-52 max-w-sm">
                <div className="absolute left-4 top-0 w-64 rounded-3xl border border-border/70 bg-card p-5 shadow-card">
                  <p className="text-xs text-muted-foreground">{card.title}</p>
                  <p className="mt-3 text-3xl font-bold">{card.metric}</p>
                  <p className="mt-1 text-xs text-success">{card.label}</p>
                  <div className="mt-6 grid grid-cols-6 items-end gap-2">
                    {[36, 48, 42, 80, 55, 70].map((height, barIndex) => (
                      <div key={barIndex} className="rounded-full bg-muted">
                        <div
                          className={index === 0 ? 'rounded-full bg-primary' : 'rounded-full bg-success'}
                          style={{ height }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="landing-float absolute bottom-0 right-0 w-40 rounded-3xl border border-border/70 bg-card p-4 shadow-modal">
                  <BarChart3 size={18} className="text-primary" />
                  <p className="mt-5 text-sm font-semibold">Ready report</p>
                  <p className="mt-1 text-xs text-muted-foreground">Trustee summary</p>
                </div>
              </div>
              <div className="mt-7 text-center">
                <h3 className="text-lg font-bold">{card.title}</h3>
                <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">{card.caption}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustSection() {
  return (
    <section id="trust" className="overflow-hidden px-5 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-4xl text-5xl font-black tracking-[-0.07em] sm:text-6xl">
          Trusted by teams who need calm, clear stewardship.
        </h2>
        <div className="mt-10 grid border-y border-border/70 md:grid-cols-[0.6fr_1fr_1fr_1fr]">
          <div className="flex flex-col justify-center border-b border-border/70 p-8 md:border-b-0 md:border-r">
            <p className="text-5xl font-black">4.9</p>
            <p className="mt-3 text-sm text-muted-foreground">Designed for confidence, review, and handover.</p>
            <div className="mt-6 flex text-warning">★★★★★</div>
          </div>
          {TESTIMONIALS.map((item) => (
            <div key={item.eyebrow} className="border-b border-border/70 p-8 md:border-b-0 md:border-r last:border-r-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{item.eyebrow}</p>
              <p className="mt-6 text-sm leading-7">
                “{item.quote}”
              </p>
              <div className="mt-12">
                <p className="font-semibold">{item.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{item.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="px-5 pb-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-foreground p-8 text-background shadow-modal sm:rounded-[3rem] sm:p-12">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-background/45">Start fresh</p>
            <h2 className="mt-3 max-w-2xl text-4xl font-black tracking-[-0.06em] sm:text-5xl">
              Create your church finance workspace today.
            </h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button size="lg" asChild className="rounded-full bg-background px-7 text-foreground hover:bg-background/90">
              <Link href="/signup">Get started now</Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="rounded-full border-background/30 bg-transparent px-7 text-background hover:bg-background/10 hover:text-background">
              <Link href="/login">Log in</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingNav />
      <main>
        <HeroSection />
        <DarkFeatureBand />
        <PeaceOfMindSection />
        <ShowcaseSection />
        <TrustSection />
        <FinalCta />
      </main>
      <footer className="border-t border-border/70 px-5 py-8 text-sm text-muted-foreground sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Logo size={32} />
            <span className="font-semibold text-foreground">ChurchLedger</span>
          </div>
          <p>Simple, transparent church accounting.</p>
        </div>
      </footer>
    </div>
  );
}
