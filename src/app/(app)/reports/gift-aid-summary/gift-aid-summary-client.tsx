'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ReportEmptyState } from '@/components/reports/report-empty-state';
import { ReportShell } from '@/components/reports/report-shell';
import type { SGiftAidSummaryReport } from '@/lib/reports/types';
import { formatCurrencyFromPence, type ReportDefinition, type ReportInsight, type ReportKpi, type ReportMetadata } from '@/lib/reports/framework';

interface Props {
  initialData: SGiftAidSummaryReport | null;
  error?: string | null;
}

function buildCsv(data: SGiftAidSummaryReport): string {
  const lines = [
    'Metric,Value',
    `Eligible donations,${data.dashboard.eligibleDonationsCount}`,
    `Estimated reclaim this year,${formatCurrencyFromPence(data.dashboard.estimatedReclaimThisYearPence)}`,
    `Claimed amount,${formatCurrencyFromPence(data.dashboard.claimedAmountPence)}`,
    `Unclaimed amount,${formatCurrencyFromPence(data.dashboard.unclaimedAmountPence)}`,
    `Outstanding reclaim,${formatCurrencyFromPence(data.dashboard.outstandingReclaimPence)}`,
    `Paid amount,${formatCurrencyFromPence(data.dashboard.paidAmountPence)}`,
    `Missing declarations,${data.dashboard.missingDeclarationCount}`,
    `Recent batch count,${data.dashboard.recentBatchCount}`,
    `Recent batch donation total,${formatCurrencyFromPence(data.dashboard.recentBatchDonationPence)}`,
    `Recent batch Gift Aid total,${formatCurrencyFromPence(data.dashboard.recentBatchGiftAidPence)}`,
    `Donations excluded,${data.dashboard.donationsExcluded}`,
    '',
    'Claim ID,Status,Period,Gift Aid,Donations,Created',
    ...data.recentClaims.map((claim) =>
      [
        claim.claimId,
        claim.status,
        `${claim.claimStart} to ${claim.claimEnd}`,
        formatCurrencyFromPence(claim.totalGiftAidPence),
        formatCurrencyFromPence(claim.totalDonationsPence),
        claim.createdAt.slice(0, 10),
      ].join(','),
    ),
  ];

  return lines.join('\n');
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function statusTone(status: 'draft' | 'submitted' | 'paid') {
  switch (status) {
    case 'paid':
      return 'default';
    case 'submitted':
      return 'secondary';
    default:
      return 'outline';
  }
}

export function GiftAidSummaryClient({ initialData, error }: Props) {
  const metadata: ReportMetadata | undefined = initialData
    ? {
        scope: 'Current fiscal year Gift Aid opportunity and claim status.',
        source: 'Posted donations, Gift Aid declarations, and Gift Aid claim records.',
        filters: [
          { label: 'Period', value: 'Current fiscal year' },
          { label: 'Status scope', value: 'Posted donations only' },
        ],
        footnotes: [
          {
            text: 'Estimated reclaim is based on eligible posted donations that have not yet been attached to a claim.',
          },
          {
            text: 'This summary should be paired with donor declaration maintenance when declaration coverage is incomplete.',
          },
        ],
      }
    : undefined;

  const kpis: ReportKpi[] | undefined = initialData
    ? [
        {
          label: 'Eligible Donations',
          value: String(initialData.dashboard.eligibleDonationsCount),
          helper: 'Unclaimed donations already validated and ready for claim preparation.',
          tone: initialData.dashboard.eligibleDonationsCount > 0 ? 'positive' : 'neutral',
          href: '/gift-aid/claim-builder',
        },
        {
          label: 'Estimated Reclaim',
          value: formatCurrencyFromPence(initialData.dashboard.estimatedReclaimThisYearPence),
          helper: 'Potential Gift Aid still available to claim this year.',
          tone: 'positive',
          href: '/gift-aid/claim-builder',
        },
        {
          label: 'Claimed',
          value: formatCurrencyFromPence(initialData.dashboard.claimedAmountPence),
          helper: 'Gift Aid already gathered into claim batches.',
          tone: initialData.dashboard.claimedAmountPence > 0 ? 'positive' : 'neutral',
          href: '/gift-aid/claim-history',
        },
        {
          label: 'Unclaimed',
          value: formatCurrencyFromPence(initialData.dashboard.unclaimedAmountPence),
          helper: 'Eligible giving still waiting to move into a claim batch.',
          tone: initialData.dashboard.unclaimedAmountPence > 0 ? 'caution' : 'neutral',
          href: '/gift-aid/claim-builder',
        },
        {
          label: 'Missing Declarations',
          value: String(initialData.dashboard.missingDeclarationCount),
          helper: 'Donations blocked by missing declaration coverage.',
          tone: initialData.dashboard.missingDeclarationCount > 0 ? 'caution' : 'positive',
          href: '/gift-aid?stage=validate',
        },
        {
          label: 'Recent Batch Totals',
          value: formatCurrencyFromPence(initialData.dashboard.recentBatchGiftAidPence),
          helper: `${formatCurrencyFromPence(initialData.dashboard.recentBatchDonationPence)} across ${initialData.dashboard.recentBatchCount} recent batch${initialData.dashboard.recentBatchCount === 1 ? '' : 'es'}.`,
          tone: initialData.dashboard.recentBatchCount > 0 ? 'neutral' : 'positive',
          href: '/gift-aid/claim-history',
        },
      ]
    : undefined;

  const insights: ReportInsight[] | undefined = initialData
    ? [
        {
          title:
            initialData.dashboard.missingDeclarationCount > 0
              ? 'Declaration coverage needs attention'
              : 'Declaration coverage looks healthy',
          body:
            initialData.dashboard.missingDeclarationCount > 0
              ? `${initialData.dashboard.missingDeclarationCount} donation${initialData.dashboard.missingDeclarationCount === 1 ? '' : 's'} are still blocked by missing declaration coverage, which suppresses reclaimable income.`
              : 'No active declaration gap is currently flagged in this summary.',
          tone:
            initialData.dashboard.missingDeclarationCount > 0 ? 'caution' : 'positive',
        },
        {
          title: 'Claimed and unclaimed value are both visible',
          body: `${formatCurrencyFromPence(initialData.dashboard.claimedAmountPence)} has already been gathered into claim batches, while ${formatCurrencyFromPence(initialData.dashboard.unclaimedAmountPence)} remains available to prepare next.`,
          tone: 'neutral',
        },
      ]
    : undefined;

  const definitions: ReportDefinition[] = [
    {
      term: 'Estimated reclaim',
      meaning: 'The value that could still be claimed from eligible posted donations in the current fiscal year.',
    },
    {
      term: 'Unclaimed',
      meaning: 'Eligible giving that has not yet been attached to a Gift Aid claim batch.',
    },
    {
      term: 'Missing declaration',
      meaning: 'A donation that cannot be claimed yet because declaration coverage is missing for its date.',
    },
  ];

  return (
    <ReportShell
      title="Gift Aid Summary"
      description="Gift Aid reclaim opportunity, claim pipeline, and declaration coverage for finance users and trustees."
      activeReport="/reports/gift-aid-summary"
      error={error}
      metadata={metadata}
      kpis={kpis}
      insights={insights}
      definitions={definitions}
      action={
        initialData ? (
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadCsv(
                  buildCsv(initialData),
                  `gift-aid-summary-${initialData.generatedAt.slice(0, 10)}.csv`,
                )
              }
            >
              Export CSV
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/gift-aid">Open Gift Aid Workspace</Link>
            </Button>
          </div>
        ) : undefined
      }
    >
      {!initialData ? (
        <ReportEmptyState
          title="No Gift Aid reporting data yet"
          description="Post donations and create Gift Aid claims to populate this summary."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/gift-aid">Go to Gift Aid</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          <Card className="rounded-2xl border shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">Recent claims</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Latest draft, submitted, and paid batches with recent totals for traceability.
                  </p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/gift-aid/claim-history">Manage claims</Link>
                </Button>
              </div>

              {initialData.recentClaims.length === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  No claims have been created yet.
                </p>
              ) : (
                <div className="mt-4 overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Claim</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead className="text-right">Gift Aid</TableHead>
                        <TableHead className="text-right">Donations</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {initialData.recentClaims.map((claim) => (
                        <TableRow key={claim.claimId}>
                          <TableCell className="font-medium">
                            {claim.reference ?? claim.claimId.slice(0, 8)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusTone(claim.status)} className="capitalize">
                              {claim.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {claim.claimStart} to {claim.claimEnd}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatCurrencyFromPence(claim.totalGiftAidPence)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatCurrencyFromPence(claim.totalDonationsPence)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </ReportShell>
  );
}
