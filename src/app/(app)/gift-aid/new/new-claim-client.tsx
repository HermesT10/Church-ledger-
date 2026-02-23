'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getGiftAidClaimPreview,
  createGiftAidClaim,
  exportGiftAidClaimCsv,
} from '@/lib/giftaid/actions';
import type { ClaimPreviewResult } from '@/lib/giftaid/eligibility';
import { toast } from 'sonner';
import {
  Gift,
  Search,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function NewClaimClient({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Date range
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Preview state
  const [preview, setPreview] = useState<ClaimPreviewResult | null>(null);
  const [showIneligible, setShowIneligible] = useState(false);

  // Post-creation state
  const [createdClaimId, setCreatedClaimId] = useState<string | null>(null);

  /* ---- Preview ---- */
  const handlePreview = () => {
    if (!startDate || !endDate) {
      toast.error('Please select both start and end dates.');
      return;
    }

    startTransition(async () => {
      const { data, error } = await getGiftAidClaimPreview({
        organisationId: orgId,
        startDate,
        endDate,
      });
      if (error) {
        toast.error(error);
        return;
      }
      setPreview(data);
      setCreatedClaimId(null);
    });
  };

  /* ---- Create claim ---- */
  const handleCreateClaim = () => {
    if (!preview || preview.eligibleDonations.length === 0) return;

    const donationIds = preview.eligibleDonations.map((d) => d.donationId);

    startTransition(async () => {
      const { data, error } = await createGiftAidClaim({
        organisationId: orgId,
        startDate,
        endDate,
        donationIds,
      });
      if (error) {
        toast.error(error);
        return;
      }
      if (data) {
        setCreatedClaimId(data.claimId);
        toast.success('Gift Aid claim created successfully.');
      }
    });
  };

  /* ---- Export CSV ---- */
  const handleExportCsv = () => {
    if (!createdClaimId) return;

    startTransition(async () => {
      const { data, error } = await exportGiftAidClaimCsv({
        claimId: createdClaimId,
      });
      if (error || !data) {
        toast.error(error ?? 'Failed to export CSV.');
        return;
      }

      const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `gift-aid-claim-${createdClaimId.slice(0, 8)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('CSV downloaded.');
    });
  };

  /* ---- Success banner ---- */
  if (createdClaimId) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-4">
          <CheckCircle className="mx-auto h-12 w-12 text-green-600" />
          <h2 className="text-xl font-semibold">Claim Created</h2>
          <p className="text-sm text-muted-foreground">
            Your Gift Aid claim has been created with{' '}
            {preview?.totals.eligibleCount ?? 0} donation(s) totalling{' '}
            {formatPounds(preview?.totals.claimableTotalPence ?? 0)} claimable.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button onClick={handleExportCsv} disabled={isPending}>
              <Download size={14} className="mr-1" />
              {isPending ? 'Exporting…' : 'Export CSV'}
            </Button>
            <Button asChild variant="outline">
              <Link href={`/gift-aid/${createdClaimId}`}>
                View Claim <ExternalLink size={12} className="ml-1" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/gift-aid">Back to Gift Aid</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date range picker */}
      <Card>
        <CardHeader>
          <CardTitle>Claim Period</CardTitle>
          <CardDescription>
            Select the date range for donations to include in this claim.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-end gap-4">
            <div className="flex flex-col gap-2 flex-1">
              <Label htmlFor="start_date">Start Date</Label>
              <Input
                id="start_date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2 flex-1">
              <Label htmlFor="end_date">End Date</Label>
              <Input
                id="end_date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <Button
              onClick={handlePreview}
              disabled={isPending || !startDate || !endDate}
            >
              <Search size={14} className="mr-1" />
              {isPending ? 'Loading…' : 'Preview Eligibility'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview results */}
      {preview && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Eligible Donations</p>
                <p className="text-2xl font-bold">{preview.totals.eligibleCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Eligible Total</p>
                <p className="text-2xl font-bold">
                  {formatPounds(preview.totals.eligibleAmountPence)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Claimable (25%)</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatPounds(preview.totals.claimableTotalPence)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* No donations in range */}
          {preview.eligibleDonations.length === 0 &&
            preview.ineligibleDonations.length === 0 && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Gift className="mx-auto h-10 w-10 text-muted-foreground/50" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    No donations found in the selected date range.
                  </p>
                </CardContent>
              </Card>
            )}

          {/* All ineligible */}
          {preview.eligibleDonations.length === 0 &&
            preview.ineligibleDonations.length > 0 && (
              <Card>
                <CardContent className="py-8 text-center">
                  <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    All {preview.ineligibleDonations.length} donation(s) in this
                    range are ineligible for Gift Aid. See details below.
                  </p>
                </CardContent>
              </Card>
            )}

          {/* Eligible donations table */}
          {preview.eligibleDonations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Eligible Donations ({preview.eligibleDonations.length})
                </CardTitle>
                <CardDescription>
                  These donations qualify for Gift Aid.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Donor</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Claimable</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.eligibleDonations.map((d) => (
                        <TableRow key={d.donationId}>
                          <TableCell className="font-medium">
                            {d.donorName}
                          </TableCell>
                          <TableCell>{formatDate(d.donationDate)}</TableCell>
                          <TableCell className="text-right">
                            {formatPounds(d.amountPence)}
                          </TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            {formatPounds(d.claimablePence)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Create claim action */}
                <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 border-t pt-4">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {preview.totals.eligibleCount} donation(s) eligible
                    </p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatPounds(preview.totals.claimableTotalPence)}{' '}
                      <span className="text-sm font-normal text-muted-foreground">
                        claimable
                      </span>
                    </p>
                  </div>
                  <Button
                    onClick={handleCreateClaim}
                    disabled={isPending}
                  >
                    {isPending ? 'Creating…' : 'Create Claim'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Ineligible donations (collapsible) */}
          {preview.ineligibleDonations.length > 0 && (
            <Card>
              <CardHeader>
                <button
                  type="button"
                  onClick={() => setShowIneligible(!showIneligible)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <div>
                    <CardTitle className="text-base">
                      Ineligible Donations ({preview.ineligibleDonations.length})
                    </CardTitle>
                    <CardDescription className="mt-1">
                      These donations do not qualify for Gift Aid.
                    </CardDescription>
                  </div>
                  {showIneligible ? (
                    <ChevronUp size={18} className="text-muted-foreground" />
                  ) : (
                    <ChevronDown size={18} className="text-muted-foreground" />
                  )}
                </button>
              </CardHeader>
              {showIneligible && (
                <CardContent>
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Donation ID</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.ineligibleDonations.map((d) => (
                          <TableRow key={d.donationId}>
                            <TableCell className="font-mono text-xs">
                              {d.donationId.slice(0, 8)}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-normal">
                                {d.reason}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
