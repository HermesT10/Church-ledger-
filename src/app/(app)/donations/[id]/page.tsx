import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { getDonation } from '@/lib/donations/actions';
import { CHANNEL_LABELS } from '@/lib/donations/types';
import type { DonationChannel } from '@/lib/donations/types';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, FileText, Gift } from 'lucide-react';

function formatPounds(p: number) { return '£' + (p / 100).toFixed(2); }
function formatDate(d: string) { return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }

export default async function DonationDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  await getActiveOrg();
  const { data: donation, error } = await getDonation(params.id);

  if (error || !donation) notFound();

  return (
    <PageShell className="max-w-4xl">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/donations">
            <ArrowLeft size={16} className="mr-1" />
            Back to Donations
          </Link>
        </Button>
      </div>
      <PageHeader
        title="Donation Details"
        subtitle={`Recorded ${formatDate(donation.donation_date)}`}
      />

      {/* Summary */}
      <Card className="app-surface">
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
              <p className="text-muted-foreground">Status</p>
              <Badge variant={donation.status === 'posted' ? 'default' : 'secondary'}>
                {donation.status}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-border/70 pt-4 md:grid-cols-3">
            <div>
              <p className="text-muted-foreground">Gross</p>
              <p className="text-lg font-bold">{formatPounds(donation.gross_amount_pence)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Fees</p>
              <p className="text-lg font-bold text-muted-foreground">
                {donation.fee_amount_pence > 0 ? formatPounds(donation.fee_amount_pence) : '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Net</p>
              <p className="text-lg font-bold text-emerald-600">{formatPounds(donation.net_amount_pence)}</p>
            </div>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-1 gap-4 border-t border-border/70 pt-4 md:grid-cols-2">
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
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="app-toolbar">
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
      </div>
    </PageShell>
  );
}
