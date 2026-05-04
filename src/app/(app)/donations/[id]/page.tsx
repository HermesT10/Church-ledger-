import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { getDonation } from '@/lib/donations/actions';
import { CHANNEL_LABELS } from '@/lib/donations/types';
import type { DonationChannel } from '@/lib/donations/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, FileText, Gift } from 'lucide-react';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { SummaryMetricCard } from '@/components/finance';
import { SectionCard } from '@/components/section-card';

function formatPounds(p: number) { return '£' + (p / 100).toFixed(2); }
function formatDate(d: string) { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }

export default async function DonationDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  await getActiveOrg();
  const { data: donation, error } = await getDonation(params.id);

  if (error || !donation) notFound();

  return (
    <PageShell className="max-w-5xl">
      <PageHeader
        title="Donation Details"
        subtitle={formatDate(donation.donation_date)}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={donation.status} />
            <Button asChild variant="outline" size="sm">
              <Link href="/donations">
                <ArrowLeft size={14} className="mr-1.5" />
                Back to Donations
              </Link>
            </Button>
          </div>
        }
      />

      {(donation.status === 'corrected' || donation.status === 'voided') && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-sm text-foreground">
          <p className="font-medium text-amber-950 dark:text-amber-100">
            {donation.status === 'corrected'
              ? 'This gift was marked corrected when its bank reconciliation was removed.'
              : 'This donation record is voided and is hidden from normal giving totals.'}
          </p>
          {donation.correction_reason ? (
            <p className="mt-1 text-muted-foreground">Reason: {donation.correction_reason}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {donation.reversal_journal_id ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/journals/${donation.reversal_journal_id}`}>View reversal journal</Link>
              </Button>
            ) : null}
            {donation.journal_id ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/journals/${donation.journal_id}`}>Original journal</Link>
              </Button>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <Link href="/reconciliation">Reconciliation workspace</Link>
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryMetricCard label="Gross" value={formatPounds(donation.gross_amount_pence)} />
        <SummaryMetricCard label="Fees" value={donation.fee_amount_pence > 0 ? formatPounds(donation.fee_amount_pence) : '—'} />
        <SummaryMetricCard label="Net" value={<span className="text-emerald-600">{formatPounds(donation.net_amount_pence)}</span>} />
      </div>

      <SectionCard title="Summary" description="Core donation, fund, and Gift Aid details for this receipt.">
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <p className="text-muted-foreground">Donor</p>
              <p className="font-medium">{donation.donor_name ?? 'Anonymous'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Channel</p>
              <p className="font-medium">
                {CHANNEL_LABELS[donation.channel as DonationChannel] ?? donation.channel}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Fund</p>
              <p className="font-medium">{donation.fund_name ?? 'General / Unrestricted'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Income stream</p>
              <p className="font-medium">{donation.income_stream_label ?? '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Status</p>
              <StatusBadge status={donation.status} />
            </div>
          </div>

          {/* Metadata */}
          <div className="border-t pt-3 grid grid-cols-2 gap-4">
            {donation.provider_reference && (
              <div>
                <p className="text-muted-foreground">Provider Reference</p>
                <p className="font-mono text-xs">{donation.provider_reference}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground">Gift Aid Eligible</p>
              <div className="flex items-center gap-1.5">
                {donation.gift_aid_eligible ? (
                  <>
                    <Gift size={14} className="text-emerald-600" />
                    <span className="text-emerald-600 font-medium">Yes</span>
                    {donation.gift_aid_claim_id && (
                      <Badge variant="outline" className="text-xs ml-2">Claimed</Badge>
                    )}
                  </>
                ) : (
                  <span>No</span>
                )}
              </div>
            </div>
            {donation.import_batch_id && (
              <div>
                <p className="text-muted-foreground">Import Batch</p>
                <Button asChild variant="link" className="px-0 h-auto text-xs">
                  <Link href={`/giving-imports/${donation.import_batch_id}`}>
                    View Import
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Actions */}
      <Card>
        <CardContent className="flex flex-wrap gap-3 p-5">
        {donation.journal_id && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/journals/${donation.journal_id}`}>
              <FileText size={14} className="mr-1.5" /> View Journal
            </Link>
          </Button>
        )}
        <Button asChild variant="outline" size="sm">
          <Link href="/donations">Back to Donations</Link>
        </Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}
