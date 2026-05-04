import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getActiveOrg } from '@/lib/org';
import { canExportGiftAid } from '@/lib/permissions';
import {
  getGiftAidDonorDetail,
  listGiftAidDeclarationLinks,
} from '@/lib/giftaid/actions';
import { listDonorStatementsForDonor } from '@/lib/giftaid/donor-statements-actions';
import { DonorProfileStatements } from '@/components/gift-aid/donor-profile-statements';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { SectionCard } from '@/components/section-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DeclarationLinksClient } from '@/components/gift-aid/declaration-links-client';

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatPounds(value: number) {
  return `£${(value / 100).toFixed(2)}`;
}

export default async function GiftAidDonorDetailPage(props: {
  params: Promise<{ donorId: string }>;
}) {
  const { donorId } = await props.params;
  const { orgId, role } = await getActiveOrg();
  const [{ data, error }, { data: linkData }, { data: donorStatements }] =
    await Promise.all([
      getGiftAidDonorDetail(orgId, donorId),
      listGiftAidDeclarationLinks({ donorId }),
      listDonorStatementsForDonor(donorId),
    ]);
  const canEditStatements = canExportGiftAid(role).allowed;

  if (error || !data) {
    notFound();
  }

  const { donor, declarations, donations, recurring_patterns, gift_aid_reminders } = data;

  const hasActiveRecurring = recurring_patterns.some((p) => p.status === 'active');
  const nextExpectedDonation = recurring_patterns
    .filter((p) => p.status === 'active' && p.next_expected_date)
    .map((p) => p.next_expected_date as string)
    .sort()[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border/80 bg-card/95 p-6 shadow-card">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-foreground">
              {donor.display_name ?? donor.full_name}
            </h2>
            <StatusBadge status={donor.is_active ? 'active' : 'inactive'} />
            {hasActiveRecurring ? (
              <Badge variant="secondary" className="font-normal">
                Recurring donor
              </Badge>
            ) : null}
          </div>
          {nextExpectedDonation ? (
            <p className="text-sm text-muted-foreground">
              Next expected donation:{' '}
              <span className="font-medium text-foreground">{formatDate(nextExpectedDonation)}</span>
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {[donor.title, donor.first_name, donor.last_name].filter(Boolean).join(' ') || donor.full_name}
          </p>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>Email: {donor.email ?? '—'}</span>
            <span>Phone: {donor.phone ?? '—'}</span>
            <span>Reference: {donor.donor_reference_code ?? '—'}</span>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/gift-aid/donors">
            <ArrowLeft size={14} className="mr-1.5" />
            Back to donors
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Donations linked</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{donor.donation_count}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Validated</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{donor.validated_donation_count}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Declarations</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{donor.declaration_count}</CardContent>
        </Card>
      </div>

      {gift_aid_reminders.length > 0 ? (
        <SectionCard
          title="Gift Aid declaration reminders"
          description="Open hygiene items for this donor from the automated reminder engine."
        >
          <ul className="space-y-3">
            {gift_aid_reminders.map((reminder) => (
              <li
                key={reminder.id}
                className="rounded-xl border border-warning/20 bg-warning-soft p-4 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={reminder.severity === 'urgent' ? 'destructive' : 'secondary'}>
                    {reminder.severity}
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">{reminder.reminder_type}</span>
                </div>
                <p className="mt-2 text-foreground">{reminder.message}</p>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {recurring_patterns.length > 0 ? (
        <SectionCard
          title="Recurring giving patterns"
          description="Detected from posted donations with repeating amount and cadence. Dismissed patterns are hidden."
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Expected amount</TableHead>
                  <TableHead>Bank reference</TableHead>
                  <TableHead>Occurrences</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Last giving</TableHead>
                  <TableHead>Next expected</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recurring_patterns.map((pattern) => (
                  <TableRow key={pattern.id}>
                    <TableCell className="capitalize">{pattern.pattern_type}</TableCell>
                    <TableCell>{formatPounds(pattern.expected_amount_pence)}</TableCell>
                    <TableCell>{pattern.bank_reference_alias ?? '—'}</TableCell>
                    <TableCell>{pattern.occurrence_count}</TableCell>
                    <TableCell>{Math.round(pattern.confidence_score * 100)}%</TableCell>
                    <TableCell>
                      {pattern.last_occurrence_at
                        ? formatDate(pattern.last_occurrence_at.slice(0, 10))
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {pattern.next_expected_date ? formatDate(pattern.next_expected_date) : '—'}
                    </TableCell>
                    <TableCell>{pattern.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Giving statements"
        description="Annual PDF summaries for donor records — same data as Gift Aid → Statements."
      >
        <DonorProfileStatements
          donorId={donor.id}
          donorDisplayName={donor.display_name ?? donor.full_name}
          initialStatements={donorStatements ?? []}
          canEdit={canEditStatements}
        />
      </SectionCard>

      <SectionCard
        title="Donor profile"
        description="Gift Aid donor identity, contact details, and notes."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">House name or number</p>
            <p className="font-medium">{donor.house_name_or_number ?? '—'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Postcode</p>
            <p className="font-medium">{donor.postcode ?? '—'}</p>
          </div>
          <div className="md:col-span-2">
            <p className="text-sm text-muted-foreground">Notes</p>
            <p className="font-medium">{donor.notes ?? 'No internal notes recorded.'}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Declaration history"
        description="Gift Aid declarations linked to this donor."
      >
        <div className="mb-5">
          <DeclarationLinksClient
            donorId={donor.id}
            initialLinks={linkData?.links ?? []}
          />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Declared</TableHead>
                <TableHead>Valid from</TableHead>
                <TableHead>Valid to</TableHead>
                <TableHead>Evidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {declarations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No declarations recorded for this donor yet.
                  </TableCell>
                </TableRow>
              ) : (
                declarations.map((declaration) => (
                  <TableRow key={declaration.id}>
                    <TableCell className="font-medium">{declaration.declaration_type}</TableCell>
                    <TableCell>
                      <StatusBadge
                        status={declaration.status === 'active' ? 'active' : 'warning'}
                        label={declaration.status}
                      />
                    </TableCell>
                    <TableCell>{formatDate(declaration.declaration_date)}</TableCell>
                    <TableCell>{formatDate(declaration.start_date)}</TableCell>
                    <TableCell>{formatDate(declaration.end_date)}</TableCell>
                    <TableCell>
                      {declaration.attachment_download_url ? (
                        <Button asChild variant="link" className="h-auto px-0 text-xs">
                          <a href={declaration.attachment_download_url} target="_blank" rel="noreferrer">
                            <FileText size={14} className="mr-1" />
                            Signed copy
                          </a>
                        </Button>
                      ) : declaration.generated_pdf_download_url ? (
                        <Button asChild variant="link" className="h-auto px-0 text-xs">
                          <a href={declaration.generated_pdf_download_url} target="_blank" rel="noreferrer">
                            <FileText size={14} className="mr-1" />
                            Generated PDF
                          </a>
                        </Button>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      <SectionCard
        title="Linked donation history"
        description="Gift Aid candidate and validated donations currently linked to this donor."
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Fund</TableHead>
                <TableHead>Bank transaction</TableHead>
                <TableHead>Gift Aid status</TableHead>
                <TableHead>Claim batch</TableHead>
                <TableHead>Claimed?</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {donations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    No linked donations yet.
                  </TableCell>
                </TableRow>
              ) : (
                donations.map((donation) => (
                  <TableRow key={donation.id}>
                    <TableCell className="font-medium">{formatDate(donation.donation_date)}</TableCell>
                    <TableCell>{formatPounds(donation.amount_pence)}</TableCell>
                    <TableCell>{donation.source}</TableCell>
                    <TableCell>{donation.fund_name ?? 'Unassigned fund'}</TableCell>
                    <TableCell className="max-w-[180px] truncate">
                      {donation.bank_transaction_label ?? '—'}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={donation.gift_aid_eligible ? 'approved' : 'warning'}
                        label={donation.gift_aid_status}
                      />
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate">
                      {donation.gift_aid_claim_reference ?? '—'}
                    </TableCell>
                    <TableCell>{donation.gift_aid_claimed ? 'Yes' : 'No'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </div>
  );
}
