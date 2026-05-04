'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Download, ExternalLink, Gift, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type {
  GivingRegisterData,
  GivingRegisterDonation,
  GivingRegisterRow,
} from '@/lib/donations/giving-register-summary';
import { GIVING_REGISTER_MONTHS } from '@/lib/donations/giving-register-summary';

function formatPounds(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function giftAidBadgeVariant(label: string) {
  if (label === 'Needs attention') return 'destructive' as const;
  if (label === 'Fully claimed' || label === 'Eligible') return 'secondary' as const;
  return 'outline' as const;
}

function donationsForCell(row: GivingRegisterRow, monthIndex: number) {
  return row.donations.filter((donation) => donation.month === monthIndex);
}

function buildCsv(data: GivingRegisterData) {
  const headers = [
    'Donor Name',
    ...GIVING_REGISTER_MONTHS,
    'Total',
    'Gift Aid Status',
    'Last Donation',
  ];
  const rows = data.summary.rows.map((row) => [
    row.donor_name,
    ...row.monthly_totals_pence.map((value) => (value / 100).toFixed(2)),
    (row.total_pence / 100).toFixed(2),
    row.gift_aid_status_label,
    row.last_donation_date ?? '',
  ]);
  rows.push([
    'Total',
    ...data.summary.totals_by_month_pence.map((value) => (value / 100).toFixed(2)),
    (data.summary.total_pence / 100).toFixed(2),
    '',
    '',
  ]);

  return [headers, ...rows]
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell);
          return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
        })
        .join(',')
    )
    .join('\n');
}

export function GivingRegisterClient({
  data,
  year,
  showAnonymous,
  includeCorrectedVoided,
}: {
  data: GivingRegisterData;
  year: number;
  showAnonymous: boolean;
  includeCorrectedVoided: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedCellParam = searchParams.get('cell');

  const selectedCell = selectedCellParam?.split(':');
  const selectedRow = selectedCell?.[0]
    ? data.summary.rows.find((row) => (row.donor_id ?? 'anonymous') === selectedCell[0])
    : null;
  const selectedMonth = selectedCell?.[1] ? Number(selectedCell[1]) : null;
  const selectedDonations =
    selectedRow && selectedMonth != null ? donationsForCell(selectedRow, selectedMonth) : [];

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'giving-register');
    params.delete('cell');
    if (value && value !== 'all') params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function openCell(row: GivingRegisterRow, monthIndex: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'giving-register');
    params.set('cell', `${row.donor_id ?? 'anonymous'}:${monthIndex}`);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function closeCell() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('cell');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function exportCsv() {
    const csv = buildCsv(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `donor-giving-register-${year}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Card className="rounded-3xl border-border/70 shadow-card">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Giving Register</CardTitle>
              <CardDescription>
                Monthly donor giving for {year}, grouped by donor and derived from donation records.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download size={14} className="mr-1.5" />
              Export CSV
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
            <div className="space-y-1.5">
              <Label>Year</Label>
              <Input
                type="number"
                value={year}
                onChange={(event) => updateParam('year', event.target.value)}
                min={2000}
                max={2100}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fund</Label>
              <Select value={searchParams.get('fundId') ?? 'all'} onValueChange={(value) => updateParam('fundId', value)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All funds" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All funds</SelectItem>
                  {data.funds.map((fund) => (
                    <SelectItem key={fund.id} value={fund.id}>
                      {fund.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Gift Aid</Label>
              <Select
                value={searchParams.get('giftAidStatus') ?? 'all'}
                onValueChange={(value) => updateParam('giftAidStatus', value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {data.giftAidStatuses.map((status) => (
                    <SelectItem key={status.id} value={status.id}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Payment method</Label>
              <Select
                value={searchParams.get('paymentMethod') ?? 'all'}
                onValueChange={(value) => updateParam('paymentMethod', value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="All methods" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All methods</SelectItem>
                  {data.paymentMethods.map((method) => (
                    <SelectItem key={method.id} value={method.id}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Search donor</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  defaultValue={searchParams.get('search') ?? ''}
                  placeholder="Name"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') updateParam('search', event.currentTarget.value);
                  }}
                  onBlur={(event) => updateParam('search', event.currentTarget.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Anonymous giving</Label>
              <Select
                value={showAnonymous ? 'yes' : 'no'}
                onValueChange={(value) => updateParam('showAnonymous', value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Show</SelectItem>
                  <SelectItem value="no">Hide</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Corrected donations</Label>
              <Select
                value={includeCorrectedVoided ? 'include' : 'exclude'}
                onValueChange={(value) => updateParam('includeCorrected', value === 'include' ? 'true' : 'false')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exclude">Hide (default)</SelectItem>
                  <SelectItem value="include">Show unreconciled-corrected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">Total giving</p>
              <p className="text-2xl font-semibold">{formatPounds(data.summary.total_pence)}</p>
            </div>
            <div className="rounded-2xl border bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">Donors this year</p>
              <p className="text-2xl font-semibold">{data.summary.donor_count}</p>
            </div>
            <div className="rounded-2xl border bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">Donations</p>
              <p className="text-2xl font-semibold">{data.summary.donation_count}</p>
            </div>
            <div className="rounded-2xl border bg-muted/20 p-4">
              <p className="text-xs text-muted-foreground">Gift Aid issues</p>
              <p className="text-2xl font-semibold">{data.summary.gift_aid_issue_count}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border/70">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="sticky left-0 z-10 min-w-56 bg-muted/95">Donor Name</TableHead>
                  {GIVING_REGISTER_MONTHS.map((month) => (
                    <TableHead key={month} className="min-w-28 text-right">
                      {month.slice(0, 3)}
                    </TableHead>
                  ))}
                  <TableHead className="sticky right-48 z-10 min-w-28 bg-muted/95 text-right">Total</TableHead>
                  <TableHead className="min-w-40">Gift Aid Status</TableHead>
                  <TableHead className="min-w-32">Last Donation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.summary.rows.map((row) => (
                  <TableRow key={row.donor_id ?? 'anonymous'}>
                    <TableCell className="sticky left-0 z-10 bg-card font-medium">
                      {row.donor_id ? (
                        <Link href={`/gift-aid/donors/${row.donor_id}`} className="hover:underline">
                          {row.donor_name}
                        </Link>
                      ) : (
                        row.donor_name
                      )}
                    </TableCell>
                    {row.monthly_totals_pence.map((value, monthIndex) => {
                      const cellDonations = donationsForCell(row, monthIndex);
                      const issueCount = row.monthly_gift_aid_issue_counts[monthIndex];
                      return (
                        <TableCell key={monthIndex} className="text-right">
                          {value > 0 ? (
                            <button
                              type="button"
                              onClick={() => openCell(row, monthIndex)}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium tabular-nums text-primary hover:bg-primary/10"
                            >
                              {formatPounds(value)}
                              {issueCount > 0 ? (
                                <span className="size-2 rounded-full bg-destructive" aria-label={`${issueCount} Gift Aid issues`} />
                              ) : null}
                              <span className="sr-only">{cellDonations.length} donations</span>
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell className="sticky right-48 z-10 bg-card text-right font-semibold tabular-nums">
                      {formatPounds(row.total_pence)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={giftAidBadgeVariant(row.gift_aid_status_label)}>
                        {row.gift_aid_status_label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(row.last_donation_date)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/30 font-semibold">
                  <TableCell className="sticky left-0 z-10 bg-muted/95">Total</TableCell>
                  {data.summary.totals_by_month_pence.map((value, index) => (
                    <TableCell key={index} className="text-right tabular-nums">
                      {value > 0 ? formatPounds(value) : '—'}
                    </TableCell>
                  ))}
                  <TableCell className="sticky right-48 z-10 bg-muted/95 text-right tabular-nums">
                    {formatPounds(data.summary.total_pence)}
                  </TableCell>
                  <TableCell />
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Sheet open={Boolean(selectedRow && selectedMonth != null)} onOpenChange={(open) => { if (!open) closeCell(); }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>
              {selectedRow?.donor_name} · {selectedMonth != null ? GIVING_REGISTER_MONTHS[selectedMonth] : ''}
            </SheetTitle>
            <SheetDescription>
              {selectedDonations.length} donation{selectedDonations.length === 1 ? '' : 's'} included in this cell.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-6">
            {selectedDonations.map((donation: GivingRegisterDonation) => (
              <div key={donation.id} className="rounded-2xl border border-border/70 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{formatPounds(donation.amount_pence)}</p>
                    <p className="text-sm text-muted-foreground">{formatDate(donation.donation_date)}</p>
                  </div>
                  <Badge variant="outline">{donation.payment_method_label}</Badge>
                </div>
                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground">Fund</p>
                    <p className="font-medium">{donation.fund_name ?? 'General / Unrestricted'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Reference</p>
                    <p className="font-medium">{donation.reference ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Gift Aid status</p>
                    <p className="font-medium">{donation.gift_aid_status?.replaceAll('_', ' ') ?? 'Not assessed'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Reconciliation</p>
                    <p className="font-medium">{donation.reconciliation_status}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Claim batch</p>
                    <p className="font-medium">{donation.gift_aid_claim_batch_id ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Bank transaction</p>
                    <p className="font-medium">{donation.bank_transaction_id ? 'Linked' : '—'}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/donations/${donation.id}`}>
                      Open donation
                      <ExternalLink size={13} className="ml-1.5" />
                    </Link>
                  </Button>
                  {donation.donor_id ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/gift-aid/donors/${donation.donor_id}`}>Open donor profile</Link>
                    </Button>
                  ) : null}
                  <Button asChild size="sm" variant="outline">
                    <Link href="/gift-aid">
                      <Gift size={13} className="mr-1.5" />
                      Fix Gift Aid issue
                    </Link>
                  </Button>
                  {donation.bank_transaction_id ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href="/reconciliation">Open bank transaction</Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
