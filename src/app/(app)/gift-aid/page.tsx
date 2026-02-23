import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import { listGiftAidClaims, getGiftAidDashboard } from '@/lib/giftaid/actions';
import {
  Gift,
  Clock,
  CheckCircle,
  FileStack,
  PoundSterling,
  AlertTriangle,
  TrendingUp,
  Banknote,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/stat-card';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { SoftAlert } from '@/components/soft-alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { GiftAidListActions } from './gift-aid-list-client';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatPounds(pence: number): string {
  return '£' + (pence / 100).toFixed(2);
}

function statusBadge(status: string) {
  switch (status) {
    case 'paid':
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-200">Paid</Badge>;
    case 'submitted':
      return <Badge>Submitted</Badge>;
    default:
      return <Badge variant="outline">Draft</Badge>;
  }
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default async function GiftAidPage() {
  const { orgId, role } = await getActiveOrg();
  const canEdit = role === 'admin' || role === 'treasurer';

  const [{ data: claims }, { data: dashboard }] = await Promise.all([
    listGiftAidClaims(orgId),
    getGiftAidDashboard(orgId),
  ]);

  const allClaims = claims ?? [];

  const draftCount = allClaims.filter((c) => c.status === 'draft').length;
  const submittedCount = allClaims.filter((c) => c.status === 'submitted').length;
  const paidCount = allClaims.filter((c) => c.status === 'paid').length;

  return (
    <PageShell>
      {/* Header */}
      <PageHeader
        title="Gift Aid"
        subtitle="Manage Gift Aid claims, declarations, and HMRC submissions."
        actions={
          canEdit ? (
            <>
              <Button asChild variant="outline">
                <Link href="/gift-aid/declarations">Declarations</Link>
              </Button>
              <Button asChild>
                <Link href="/gift-aid/new">New Claim</Link>
              </Button>
            </>
          ) : undefined
        }
      />

      {/* Dashboard Metrics */}
      {dashboard && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Estimated Reclaim"
            value={formatPounds(dashboard.estimatedReclaimThisYearPence)}
            subtitle="Unclaimed this year"
            href="/gift-aid"
            tint="blue"
            icon={<TrendingUp size={20} />}
          />
          <StatCard
            title="Claimed"
            value={formatPounds(dashboard.claimedAmountPence)}
            subtitle="Total claims this year"
            href="/gift-aid"
            tint="violet"
            icon={<PoundSterling size={20} />}
          />
          <StatCard
            title="Outstanding"
            value={formatPounds(dashboard.outstandingReclaimPence)}
            subtitle="Awaiting HMRC payment"
            href="/gift-aid"
            tint="amber"
            icon={<Banknote size={20} />}
          />
          <StatCard
            title="HMRC Paid"
            value={formatPounds(dashboard.paidAmountPence)}
            subtitle="Received this year"
            href="/gift-aid"
            tint="emerald"
            icon={<CheckCircle size={20} />}
          />
        </div>
      )}

      {/* Alert cards */}
      {dashboard && (dashboard.donorsMissingDeclarations > 0 || dashboard.donationsExcluded > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dashboard.donorsMissingDeclarations > 0 && (
            <SoftAlert variant="warning" icon={<AlertTriangle className="h-5 w-5" />}>
              <p className="font-medium">
                {dashboard.donorsMissingDeclarations} donor(s) missing declarations
              </p>
              <p className="text-xs opacity-80 mt-0.5">
                These donors have no active Gift Aid declaration on file.
              </p>
              <Button asChild variant="link" className="px-0 h-auto mt-1 text-amber-700">
                <Link href="/gift-aid/declarations">Manage Declarations</Link>
              </Button>
            </SoftAlert>
          )}
          {dashboard.donationsExcluded > 0 && (
            <SoftAlert variant="info" icon={<Gift className="h-5 w-5" />}>
              <p className="font-medium">
                {dashboard.donationsExcluded} unclaimed donation(s)
              </p>
              <p className="text-xs opacity-80 mt-0.5">
                Posted donations not yet included in a claim.
              </p>
            </SoftAlert>
          )}
        </div>
      )}

      {/* Claim Status Summary */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          title="Draft"
          value={draftCount}
          subtitle="Not yet submitted"
          href="/gift-aid"
          tint="slate"
          icon={<FileStack size={20} />}
        />
        <StatCard
          title="Submitted"
          value={submittedCount}
          subtitle="Sent to HMRC"
          href="/gift-aid"
          tint="blue"
          icon={<Clock size={20} />}
        />
        <StatCard
          title="Paid"
          value={paidCount}
          subtitle="HMRC payment received"
          href="/gift-aid"
          tint="green"
          icon={<CheckCircle size={20} />}
        />
      </div>

      {/* Claims Table */}
      {allClaims.length > 0 ? (
        <Card className="border rounded-2xl shadow-sm bg-pink-100/45 border-pink-200/50">
          <CardHeader>
            <CardTitle>Claims</CardTitle>
            <CardDescription>
              All Gift Aid claims for your organisation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date Range</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-center">Donations</TableHead>
                    <TableHead className="text-right">Claimable</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allClaims.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {formatDate(c.claim_start)} – {formatDate(c.claim_end)}
                      </TableCell>
                      <TableCell>{formatDate(c.created_at)}</TableCell>
                      <TableCell className="text-center">{c.donation_count}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatPounds(c.claimable_total_pence)}
                      </TableCell>
                      <TableCell>{statusBadge(c.status)}</TableCell>
                      <TableCell className="text-right">
                        <GiftAidListActions claimId={c.id} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-2xl border border-slate-200/40 bg-slate-100/55 p-8 text-center shadow-sm">
          <Gift className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            No Gift Aid claims yet.{' '}
            {canEdit && 'Create one to start reclaiming tax on eligible donations.'}
          </p>
        </div>
      )}
    </PageShell>
  );
}
