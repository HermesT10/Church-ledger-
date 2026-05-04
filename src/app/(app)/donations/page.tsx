import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import { getDonationsDashboard, listDonations, listRecurringDonations } from '@/lib/donations/actions';
import { CHANNEL_LABELS } from '@/lib/donations/types';
import type { DonationChannel } from '@/lib/donations/types';
import { getGivingRegisterData } from '@/lib/donations/giving-register';
import { GivingRegisterClient } from './giving-register-client';
import { StatCard } from '@/components/stat-card';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { SoftAlert } from '@/components/soft-alert';
import { WorkspaceEmptyState } from '@/components/workspace-empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Heart,
  TrendingUp,
  Globe,
  Coins,
  Repeat,
  Gift,
  Plus,
} from 'lucide-react';

function formatPounds(p: number) { return '£' + (p / 100).toFixed(2); }
function formatDate(d: string) { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }

const DONATION_TABS = [
  { id: 'overview', label: 'Overview', href: '/donations?tab=overview' },
  { id: 'donors', label: 'Donors', href: '/donations?tab=donors' },
  { id: 'giving-register', label: 'Giving Register', href: '/donations?tab=giving-register' },
  { id: 'unmatched', label: 'Unmatched Donations', href: '/donations?tab=unmatched' },
  { id: 'gift-aid-status', label: 'Gift Aid Status', href: '/donations?tab=gift-aid-status' },
  { id: 'statements', label: 'Statements', href: '/donations?tab=statements' },
] as const;

type DonationTab = (typeof DONATION_TABS)[number]['id'];

function isDonationTab(value: string | undefined): value is DonationTab {
  return DONATION_TABS.some((tab) => tab.id === value);
}

function TabLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-2 text-sm font-medium transition ${
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {label}
    </Link>
  );
}

function ComingSoonCard({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <Card className="rounded-3xl border-border/70 shadow-card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline" size="sm">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default async function DonationsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    tab?: string;
    year?: string;
    fundId?: string;
    giftAidStatus?: string;
    paymentMethod?: string;
    search?: string;
    showAnonymous?: string;
    includeCorrected?: string;
  }>;
}) {
  const { orgId, role } = await getActiveOrg();
  const params = await searchParams;
  const canEdit = role === 'admin' || role === 'treasurer';
  const activeTab = isDonationTab(params?.tab) ? params.tab : 'overview';
  const registerYear = Number(params?.year) || new Date().getFullYear();
  const showAnonymous = params?.showAnonymous !== 'no';
  const includeCorrectedVoided = params?.includeCorrected === 'true';

  const [{ data: dashboard }, { data: recentDonations }, { data: recurring }, registerResult] = await Promise.all([
    getDonationsDashboard(orgId),
    listDonations(orgId, { page: 1, pageSize: 10, includeCorrectedVoided }),
    listRecurringDonations(orgId),
    activeTab === 'giving-register'
      ? getGivingRegisterData(orgId, {
          year: registerYear,
          fundId: params?.fundId || undefined,
          giftAidStatus: params?.giftAidStatus || undefined,
          paymentMethod: params?.paymentMethod || undefined,
          search: params?.search || undefined,
          showAnonymous,
          includeCorrectedVoided,
        })
      : Promise.resolve({ data: null, error: null }),
  ]);

  const activeRecurring = recurring.filter((r) => r.status === 'active');

  return (
    <PageShell>
      {/* Header */}
      <PageHeader
        title="Donations"
        subtitle="Manage donations, recurring commitments, and giving analytics."
        actions={
          canEdit ? (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href="/donations/recurring"><Repeat size={14} className="mr-1" /> Recurring</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/donations/new"><Plus size={14} className="mr-1" /> New Donation</Link>
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="overflow-x-auto rounded-3xl border border-border/70 bg-card p-2 shadow-card">
        <nav className="flex min-w-max gap-1" aria-label="Donation sections">
          {DONATION_TABS.map((tab) => (
            <TabLink key={tab.id} href={tab.href} label={tab.label} active={activeTab === tab.id} />
          ))}
        </nav>
      </div>

      {activeTab === 'giving-register' ? (
        registerResult.data ? (
          <GivingRegisterClient
            data={registerResult.data}
            year={registerYear}
            showAnonymous={showAnonymous}
            includeCorrectedVoided={includeCorrectedVoided}
          />
        ) : (
          <SoftAlert variant="warning">
            {registerResult.error ?? 'Unable to load the Giving Register.'}
          </SoftAlert>
        )
      ) : activeTab === 'donors' ? (
        <ComingSoonCard
          title="Donors"
          description="The next stage will bring donor profiles into Donations with giving history, Gift Aid, bank references, statements, documents, and audit history."
          actionHref="/gift-aid/donors"
          actionLabel="Open current Gift Aid donors"
        />
      ) : activeTab === 'unmatched' ? (
        <ComingSoonCard
          title="Unmatched Donations"
          description="This stage will surface bank transactions and giving imports that still need donor matching, fund assignment, or Gift Aid assessment."
          actionHref="/reconciliation"
          actionLabel="Open reconciliation workspace"
        />
      ) : activeTab === 'gift-aid-status' ? (
        <ComingSoonCard
          title="Gift Aid Status"
          description="This stage will summarise donor-level declarations, unclaimed donations, missing details, and claim readiness from the existing Gift Aid workflow."
          actionHref="/gift-aid"
          actionLabel="Open Gift Aid control centre"
        />
      ) : activeTab === 'statements' ? (
        <ComingSoonCard
          title="Statements"
          description="This stage will expose annual donor statements from Donations while reusing the current Gift Aid statement generation engine."
          actionHref="/gift-aid/statements"
          actionLabel="Open current statements"
        />
      ) : (
        <>

      {/* Dashboard Stats */}
      {dashboard && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="This Month"
              value={formatPounds(dashboard.totalThisMonthPence)}
              subtitle={`${dashboard.donationCount} donations YTD`}
              href="/donations"
              tint="emerald"
              icon={<Heart size={20} />}
            />
            <StatCard
              title="Year to Date"
              value={formatPounds(dashboard.totalYtdPence)}
              subtitle={`${dashboard.donorCount} donors`}
              href="/donations"
              tint="blue"
              icon={<TrendingUp size={20} />}
            />
            <StatCard
              title="Online vs Cash"
              value={formatPounds(dashboard.onlinePence)}
              subtitle={`Cash: ${formatPounds(dashboard.cashPence)}`}
              href="/donations"
              tint="violet"
              icon={<Globe size={20} />}
            />
            <StatCard
              title="Gift Aid Estimate"
              value={formatPounds(dashboard.giftAidEstimatePence)}
              subtitle={`Fees: ${formatPounds(dashboard.platformFeesPence)}`}
              href="/gift-aid"
              tint="amber"
              icon={<Gift size={20} />}
            />
          </div>

          {/* Recurring summary */}
          {activeRecurring.length > 0 && (
            <SoftAlert variant="info" icon={<Repeat className="h-5 w-5" />}>
              <p className="font-medium">
                {activeRecurring.length} active recurring commitment{activeRecurring.length === 1 ? '' : 's'}
              </p>
              <p className="text-xs opacity-80 mt-0.5">
                Annual value: {formatPounds(dashboard.recurringTotalPence)}
              </p>
              <Button asChild variant="link" className="px-0 h-auto mt-1 text-blue-700">
                <Link href="/donations/recurring">View All</Link>
              </Button>
            </SoftAlert>
          )}
        </>
      )}

      {/* Recent Donations */}
      <Card className="gap-0 overflow-hidden rounded-3xl border-border/70 bg-card shadow-card">
        <CardHeader className="border-b border-border/60 px-5 pb-4 pt-5">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Recent Donations</CardTitle>
              <CardDescription>Latest 10 donations recorded for this workspace.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/donations?view=all">View All</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-5">
          {recentDonations.length > 0 ? (
            <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/35 hover:bg-muted/35">
                    <TableHead>Date</TableHead>
                    <TableHead>Donor</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Fund</TableHead>
                    <TableHead className="hidden md:table-cell">Stream</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Fees</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-center">Gift Aid</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentDonations.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(d.donation_date)}</TableCell>
                      <TableCell className="font-medium">{d.donor_name ?? 'Anonymous'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {CHANNEL_LABELS[d.channel as DonationChannel] ?? d.channel}
                        </Badge>
                      </TableCell>
                      <TableCell>{d.fund_name ?? '—'}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                        {d.income_stream_label ?? '—'}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{formatPounds(d.gross_amount_pence)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                        {d.fee_amount_pence > 0 ? formatPounds(d.fee_amount_pence) : '—'}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums">{formatPounds(d.net_amount_pence)}</TableCell>
                      <TableCell className="text-center">{d.gift_aid_eligible ? '✓' : '—'}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/donations/${d.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <WorkspaceEmptyState
              icon={<Coins className="h-10 w-10" />}
              title="No donations yet"
              description={
                canEdit
                  ? 'Record the first donation to start fund income tracking, Gift Aid eligibility, and donor history.'
                  : 'Donations will appear here once the finance team records giving.'
              }
              action={
                canEdit ? (
                  <Button asChild size="sm">
                    <Link href="/donations/new">New Donation</Link>
                  </Button>
                ) : undefined
              }
            />
          )}
        </CardContent>
      </Card>
        </>
      )}
    </PageShell>
  );
}
