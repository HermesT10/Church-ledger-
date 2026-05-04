'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createGiftAidClaimBatchFromBuilder } from '@/lib/giftaid/actions';
import {
  GIFT_AID_CLAIM_DATE_PRESET_LABELS,
  resolveGiftAidClaimDateRange,
  isGiftAidClaimDateRangeInvalid,
  type GiftAidClaimDatePreset,
} from '@/lib/giftaid/claim-range';
import type {
  GiftAidClaimBuilderData,
  GiftAidClaimBuilderGasdsOption,
} from '@/lib/giftaid/types';
import { Button } from '@/components/ui/button';
import { FilterBar } from '@/components/ui/filter-bar';
import { ReportTableCard } from '@/components/reports/report-table-card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatPounds(value: number) {
  return `£${(value / 100).toFixed(2)}`;
}

export function ClaimBuilderClient({
  orgId,
  canEdit,
  data,
  donorOptions,
  fundOptions,
  incomeStreamOptions,
  sourceOptions,
  preset,
  fiscalYearStartMonth,
  startDate,
  endDate,
  donorId,
  fundId,
  incomeStreamId,
  source,
  onlyEligibleUnclaimed,
  excludeAlreadyClaimed,
  includeExceptions,
  gasdsOptions,
}: {
  orgId: string;
  canEdit: boolean;
  data: GiftAidClaimBuilderData | null;
  donorOptions: Array<{ id: string; label: string }>;
  fundOptions: Array<{ id: string; label: string }>;
  incomeStreamOptions: Array<{ id: string; label: string }>;
  sourceOptions: string[];
  preset: GiftAidClaimDatePreset;
  fiscalYearStartMonth: number;
  startDate: string;
  endDate: string;
  donorId: string;
  fundId: string;
  incomeStreamId: string;
  source: string;
  onlyEligibleUnclaimed: boolean;
  excludeAlreadyClaimed: boolean;
  includeExceptions: boolean;
  gasdsOptions: GiftAidClaimBuilderGasdsOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
  const exceptions = useMemo(() => data?.exceptions ?? [], [data?.exceptions]);
  const summary = data?.summary ?? {
    donation_count: 0,
    total_donation_amount_pence: 0,
    estimated_gift_aid_pence: 0,
    excluded_rows_count: 0,
    validation_warning_count: 0,
    warning_messages: [],
  };
  const [filters, setFilters] = useState({
    preset,
    startDate,
    endDate,
    donorId,
    fundId,
    incomeStreamId,
    source,
    onlyEligibleUnclaimed,
    excludeAlreadyClaimed,
    includeExceptions,
  });
  const [activeTab, setActiveTab] = useState<'eligible' | 'exceptions'>('eligible');
  const [selectedGasdsIds, setSelectedGasdsIds] = useState<Set<string>>(new Set());

  const gasdsSelectedTotals = useMemo(() => {
    const selected = gasdsOptions.filter((o) => selectedGasdsIds.has(o.id));
    return {
      eligible: selected.reduce((s, o) => s + o.eligible_amount_pence, 0),
      claimable: selected.reduce((s, o) => s + o.claimable_pence, 0),
    };
  }, [gasdsOptions, selectedGasdsIds]);

  const toggleGasds = (id: string) => {
    setSelectedGasdsIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const duplicateWarnings = useMemo(
    () => rows.filter((row) => row.duplicate_warning),
    [rows]
  );
  const blockingDuplicates = useMemo(
    () => duplicateWarnings.filter((row) => row.duplicate_blocking),
    [duplicateWarnings]
  );
  const invalidRange = useMemo(
    () =>
      isGiftAidClaimDateRangeInvalid({
        startDate: filters.startDate,
        endDate: filters.endDate,
      }),
    [filters.endDate, filters.startDate]
  );

  const handleBuildClaim = () => {
    if (!canEdit) return;
    if (rows.length === 0 && selectedGasdsIds.size === 0) {
      toast.error('Select donations and/or ready GASDS batches before creating a claim.');
      return;
    }
    if (rows.length > 0 && blockingDuplicates.length > 0) {
      toast.error(
        'Resolve duplicate or already-claimed donation blockers before creating a claim.'
      );
      return;
    }

    startTransition(async () => {
      const { data, error } = await createGiftAidClaimBatchFromBuilder({
        startDate: filters.startDate,
        endDate: filters.endDate,
        donorId: filters.donorId || null,
        fundId: filters.fundId || null,
        incomeStreamId: filters.incomeStreamId || null,
        source: filters.source || null,
        includeExceptions: filters.includeExceptions,
        gasdsBatchIds:
          selectedGasdsIds.size > 0 ? Array.from(selectedGasdsIds) : undefined,
      });
      if (error || !data) {
        toast.error(error ?? 'Unable to create claim.');
        return;
      }
      toast.success('Gift Aid claim batch created for review.');
      router.push('/gift-aid/claim-history');
      router.refresh();
    });
  };

  const handlePresetChange = (value: GiftAidClaimDatePreset) => {
    const range = resolveGiftAidClaimDateRange({
      preset: value,
      fiscalYearStartMonth,
      customStartDate: filters.startDate,
      customEndDate: filters.endDate,
    });

    setFilters((current) => ({
      ...current,
      preset: value,
      startDate: range.startDate,
      endDate: range.endDate,
    }));
  };

  const handleRefresh = () => {
    if (invalidRange) {
      toast.error('Enter a valid claim date range before applying filters.');
      return;
    }

    const params = new URLSearchParams({
      preset: filters.preset,
      startDate: filters.startDate,
      endDate: filters.endDate,
    });
    if (filters.donorId) params.set('donorId', filters.donorId);
    if (filters.fundId) params.set('fundId', filters.fundId);
    if (filters.incomeStreamId) params.set('incomeStreamId', filters.incomeStreamId);
    if (filters.source) params.set('source', filters.source);
    params.set('eligibleOnly', String(filters.onlyEligibleUnclaimed));
    params.set('excludeClaimed', String(filters.excludeAlreadyClaimed));
    params.set('includeExceptions', String(filters.includeExceptions));
    router.push(`/gift-aid/claim-builder?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <FilterBar className="justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            Claim period: {formatDate(startDate)} to {formatDate(endDate)}
          </p>
          <p className="text-sm text-muted-foreground">
            {summary.donation_count} ready donations worth{' '}
            {formatPounds(summary.total_donation_amount_pence)} with{' '}
            {formatPounds(summary.estimated_gift_aid_pence)} estimated Gift Aid.
          </p>
          {summary.excluded_rows_count > 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {summary.excluded_rows_count} filtered donation(s) were excluded because
              they still need validation, declaration coverage, or fall outside
              claim rules.
            </p>
          ) : null}
          {duplicateWarnings.length > 0 ? (
            <p className="mt-1 text-sm text-warning">
              {blockingDuplicates.length > 0
                ? `${blockingDuplicates.length} donation(s) have blocking duplicate or already-claimed conflicts.`
                : `${duplicateWarnings.length} donation(s) have duplicate warnings to review before export.`}
            </p>
          ) : null}
          {summary.validation_warning_count > 0 ? (
            <p className="mt-1 text-sm text-warning">
              {summary.validation_warning_count} validation warning summary item(s) need review.
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            Quick preset: {GIFT_AID_CLAIM_DATE_PRESET_LABELS[filters.preset]}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Quick range</Label>
              <Select
                value={filters.preset}
                onValueChange={(value) =>
                  handlePresetChange(value as GiftAidClaimDatePreset)
                }
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Select range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this_month">This month</SelectItem>
                  <SelectItem value="last_month">Last month</SelectItem>
                  <SelectItem value="this_quarter">This quarter</SelectItem>
                  <SelectItem value="last_quarter">Last quarter</SelectItem>
                  <SelectItem value="financial_year_to_date">
                    Financial year to date
                  </SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="claim-start" className="text-xs text-muted-foreground">
                Start date
              </Label>
              <Input
                id="claim-start"
                type="date"
                value={filters.startDate}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    preset: 'custom',
                    startDate: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="claim-end" className="text-xs text-muted-foreground">
                End date
              </Label>
              <Input
                id="claim-end"
                type="date"
                value={filters.endDate}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    preset: 'custom',
                    endDate: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Donor</Label>
              <Select
                value={filters.donorId || 'all'}
                onValueChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    donorId: value === 'all' ? '' : value,
                  }))
                }
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All donors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All donors</SelectItem>
                  {donorOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Fund</Label>
              <Select
                value={filters.fundId || 'all'}
                onValueChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    fundId: value === 'all' ? '' : value,
                  }))
                }
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All funds" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All funds</SelectItem>
                  {fundOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Income stream</Label>
              <Select
                value={filters.incomeStreamId || 'all'}
                onValueChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    incomeStreamId: value === 'all' ? '' : value,
                  }))
                }
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="All income streams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All income streams</SelectItem>
                  {incomeStreamOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Source</Label>
              <Select
                value={filters.source || 'all'}
                onValueChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    source: value === 'all' ? '' : value,
                  }))
                }
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="All sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sources</SelectItem>
                  {sourceOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={filters.onlyEligibleUnclaimed}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    onlyEligibleUnclaimed: event.target.checked,
                  }))
                }
              />
              Only eligible unclaimed
            </label>
            <label className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={filters.excludeAlreadyClaimed}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    excludeAlreadyClaimed: event.target.checked,
                  }))
                }
              />
              Exclude already claimed
            </label>
            <label className="flex items-center gap-2 pb-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={filters.includeExceptions}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    includeExceptions: event.target.checked,
                  }))
                }
              />
              Include exceptions
            </label>
            <Button variant="outline" onClick={handleRefresh} disabled={invalidRange}>
              Apply filters
            </Button>
          </div>
          {canEdit ? (
            <Button
              onClick={handleBuildClaim}
              disabled={
                isPending ||
                invalidRange ||
                (rows.length === 0 && selectedGasdsIds.size === 0) ||
                (rows.length > 0 && blockingDuplicates.length > 0)
              }
            >
              {isPending ? 'Building...' : 'Create review batch'}
            </Button>
          ) : null}
        </div>
      </FilterBar>

      {gasdsOptions.length > 0 ? (
        <div className="rounded-2xl border border-border/80 bg-card/95 p-4 shadow-card">
          <p className="text-sm font-medium">GASDS — Small donation batches</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Optional: add cash or contactless small-donation batches (no donor declaration on the HMRC
            donor worksheet). Exported on a separate GASDS worksheet.
            {selectedGasdsIds.size > 0 ? (
              <span className="ml-1 font-medium text-foreground">
                Selected: {formatPounds(gasdsSelectedTotals.eligible)} eligible,{' '}
                {formatPounds(gasdsSelectedTotals.claimable)} Gift Aid.
              </span>
            ) : null}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {gasdsOptions.map((b) => (
              <label
                key={b.id}
                className="flex cursor-pointer items-start gap-2 rounded-xl border border-border/70 px-3 py-2 text-sm hover:bg-muted/40"
              >
                <input
                  type="checkbox"
                  checked={selectedGasdsIds.has(b.id)}
                  onChange={() => toggleGasds(b.id)}
                  className="mt-1"
                  disabled={!canEdit}
                />
                <span>
                  <span className="font-medium">{b.batch_reference}</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatDate(b.collection_date)} · {b.service_or_event_name} ({b.collection_method})
                  </span>
                  <span className="text-xs">{formatPounds(b.eligible_amount_pence)} eligible</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {invalidRange ? (
        <div className="rounded-2xl border border-warning/20 bg-warning-soft p-4 text-sm text-warning">
          Enter a valid claim date range with the start date on or before the end date.
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border/80 bg-card/95 p-5 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Validated donations</p>
          <p className="mt-2 text-3xl font-bold tracking-tight">{summary.donation_count}</p>
        </div>
        <div className="rounded-2xl border border-border/80 bg-card/95 p-5 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Donation total</p>
          <p className="mt-2 text-3xl font-bold tracking-tight">
            {formatPounds(summary.total_donation_amount_pence)}
          </p>
        </div>
        <div className="rounded-2xl border border-border/80 bg-card/95 p-5 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Claimable from HMRC</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-success">
            {formatPounds(summary.estimated_gift_aid_pence)}
          </p>
        </div>
        <div className="rounded-2xl border border-border/80 bg-card/95 p-5 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Excluded rows</p>
          <p className="mt-2 text-3xl font-bold tracking-tight">
            {summary.excluded_rows_count}
          </p>
        </div>
        <div className="rounded-2xl border border-border/80 bg-card/95 p-5 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Validation warnings</p>
          <p className="mt-2 text-3xl font-bold tracking-tight">
            {summary.validation_warning_count}
          </p>
        </div>
      </div>

      {summary.warning_messages.length > 0 ? (
        <div className="rounded-2xl border border-warning/20 bg-warning-soft p-4 text-sm text-warning">
          {summary.warning_messages.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          variant={activeTab === 'eligible' ? 'default' : 'outline'}
          onClick={() => setActiveTab('eligible')}
        >
          Eligible donations ({rows.length})
        </Button>
        <Button
          type="button"
          variant={activeTab === 'exceptions' ? 'default' : 'outline'}
          onClick={() => setActiveTab('exceptions')}
        >
          Exceptions ({exceptions.length})
        </Button>
      </div>

      {activeTab === 'eligible' ? (
      <ReportTableCard
        title="HMRC field preview"
        description="Only validated, declaration-covered donations appear here. The preview shows the exact donor and donation fields used for HMRC export."
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Donor</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Fund</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>First</TableHead>
                <TableHead>Last</TableHead>
                <TableHead>House / No.</TableHead>
                <TableHead>Postcode</TableHead>
                <TableHead>Donation date</TableHead>
                <TableHead>Warnings</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Claimable</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="py-12 text-center text-sm text-muted-foreground">
                    No validated donations are ready for the selected claim period yet.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.donation_id}>
                    <TableCell className="font-medium">{row.donor_name}</TableCell>
                    <TableCell className="capitalize">{row.source}</TableCell>
                    <TableCell>{row.fund_name ?? 'Unassigned fund'}</TableCell>
                    <TableCell>{row.hmrc_title || '-'}</TableCell>
                    <TableCell>{row.hmrc_first_name_or_initial}</TableCell>
                    <TableCell>{row.hmrc_last_name}</TableCell>
                    <TableCell>{row.hmrc_house_name_or_number}</TableCell>
                    <TableCell>{row.hmrc_postcode}</TableCell>
                    <TableCell>{formatDate(row.donation_date)}</TableCell>
                    <TableCell className="text-sm">
                      {row.duplicate_warning ? (
                        <span
                          className={
                            row.duplicate_blocking
                              ? 'font-medium text-destructive'
                              : 'text-warning'
                          }
                        >
                          {row.duplicate_warning}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{formatPounds(row.amount_pence)}</TableCell>
                    <TableCell className="text-right font-medium text-success">
                      {formatPounds(row.claimable_pence)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </ReportTableCard>
      ) : (
        <ReportTableCard
          title="Exceptions"
          description="Donations that cannot be claimed yet, grouped by the validation issues that need fixing."
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Donor</TableHead>
                  <TableHead>Donation date</TableHead>
                  <TableHead>Fund</TableHead>
                  <TableHead>Income stream</TableHead>
                  <TableHead>Bank transaction</TableHead>
                  <TableHead>Exceptions</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exceptions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                      No exceptions for the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  exceptions.map((row) => (
                    <TableRow key={row.donation_id}>
                      <TableCell className="font-medium">{row.donor_name ?? 'No donor'}</TableCell>
                      <TableCell>{formatDate(row.donation_date)}</TableCell>
                      <TableCell>{row.fund_name ?? 'Unassigned fund'}</TableCell>
                      <TableCell>{row.income_stream_label ?? '—'}</TableCell>
                      <TableCell className="max-w-[180px] truncate">
                        {row.bank_transaction_label ?? '—'}
                      </TableCell>
                      <TableCell className="max-w-[360px]">
                        <div className="space-y-1">
                          {row.exception_messages.map((message) => (
                            <p key={message} className="text-sm text-warning">
                              {message}
                            </p>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{formatPounds(row.amount_pence)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {row.donor_id ? (
                            <Button asChild size="sm" variant="outline">
                              <Link href={`/gift-aid/donors/${row.donor_id}`}>
                                Fix donor
                              </Link>
                            </Button>
                          ) : null}
                          <Button asChild size="sm" variant="outline">
                            <Link href="/gift-aid/declarations">Add declaration</Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </ReportTableCard>
      )}
    </div>
  );
}
