import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import { getDonationsDashboard, listDonations, listRecurringDonations } from '@/lib/donations/actions';
import { CHANNEL_LABELS } from '@/lib/donations/types';
import type { DonationChannel } from '@/lib/donations/types';
import { StatCard } from '@/components/stat-card';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { SoftAlert } from '@/components/soft-alert';
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

export default async function DonationsPage() {
  const { orgId, role } = await getActiveOrg();
  const canEdit = role === 'admin' || role === 'treasurer';

  const [{ data: dashboard }, { data: recentDonations }, { data: recurring }] = await Promise.all([
    getDonationsDashboard(orgId),
    listDonations(orgId, { page: 1, pageSize: 10 }),
    listRecurringDonations(orgId),
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

      {/* Dashboard Stats */}
      {dashboard && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
      <Card className="border bg-card/92 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Recent Donations</CardTitle>
              <CardDescription>Latest 10 donations</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/donations?view=all">View All</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recentDonations.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Donor</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Fund</TableHead>
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
                      <TableCell>{formatDate(d.donation_date)}</TableCell>
                      <TableCell className="font-medium">{d.donor_name ?? 'Anonymous'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {CHANNEL_LABELS[d.channel as DonationChannel] ?? d.channel}
                        </Badge>
                      </TableCell>
                      <TableCell>{d.fund_name ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatPounds(d.gross_amount_pence)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {d.fee_amount_pence > 0 ? formatPounds(d.fee_amount_pence) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">{formatPounds(d.net_amount_pence)}</TableCell>
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
            <div className="py-8 text-center">
              <Coins className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">
                No donations yet.{' '}
                {canEdit && 'Record your first donation to get started.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
