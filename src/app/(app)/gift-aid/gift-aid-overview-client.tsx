'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileCheck2,
  FileStack,
  Settings,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import type {
  GiftAidControlCentreData,
  GiftAidControlCentreTab,
  GiftAidReminderRow,
} from '@/lib/giftaid/types';
import { SectionCard } from '@/components/section-card';
import { SoftAlert } from '@/components/soft-alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  dismissGiftAidReminder,
  refreshGiftAidDeclarationReminders,
  syncGiftAidRecurringDonorPatterns,
  updateGiftAidReminderSettings,
} from '@/lib/giftaid/actions';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function formatPounds(value: number) {
  return `£${(value / 100).toFixed(2)}`;
}

function formatDate(value: string | null) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatMetric(metric: GiftAidControlCentreData['metrics'][number]) {
  if (metric.value_pence != null) return formatPounds(metric.value_pence);
  return metric.value.toLocaleString('en-GB');
}

function giftAidGradeLabel(grade: NonNullable<GiftAidControlCentreData['health_score']>['grade']) {
  switch (grade) {
    case 'excellent':
      return 'Excellent';
    case 'good':
      return 'Good';
    case 'needs_attention':
      return 'Needs attention';
    case 'poor':
      return 'Poor';
    default:
      return grade;
  }
}

function giftAidGradeBadgeClass(
  grade: NonNullable<GiftAidControlCentreData['health_score']>['grade']
) {
  switch (grade) {
    case 'excellent':
      return 'border-success/20 bg-success-soft text-success';
    case 'good':
      return 'border-info/20 bg-info-soft text-info';
    case 'needs_attention':
      return 'border-warning/20 bg-warning-soft text-warning';
    case 'poor':
      return 'border-danger/20 bg-danger-soft text-danger';
    default:
      return 'border-border bg-muted text-foreground';
  }
}

function plainStatusClass(status: string) {
  if (status === 'Can claim' || status === 'Ready for HMRC') {
    return 'border-success/20 bg-success-soft text-success';
  }
  if (status === 'Missing declaration' || status === 'Needs review') {
    return 'border-warning/20 bg-warning-soft text-warning';
  }
  if (status === 'Already claimed') {
    return 'border-info/20 bg-info-soft text-info';
  }
  if (status === 'Rejected') {
    return 'border-danger/20 bg-danger-soft text-danger';
  }
  return 'border-border bg-muted text-muted-foreground';
}

function PlainStatus({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${plainStatusClass(status)}`}>
      {status}
    </span>
  );
}

function EmptyTable({ message }: { message: string }) {
  return (
    <TableRow>
      <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
        {message}
      </TableCell>
    </TableRow>
  );
}

function ReminderRow(props: {
  reminder: GiftAidReminderRow;
  canDismiss: boolean;
  openTab: (tab: GiftAidControlCentreTab) => void;
  onDismissed: () => void;
}) {
  const { reminder, canDismiss, openTab, onDismissed } = props;
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border/70 bg-card p-4">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={reminder.severity === 'urgent' ? 'destructive' : 'secondary'}
            className="font-normal"
          >
            {reminder.severity === 'urgent'
              ? 'Urgent'
              : reminder.severity === 'warning'
                ? 'Warning'
                : 'Info'}
          </Badge>
          <span className="font-mono text-xs text-muted-foreground">{reminder.reminder_type}</span>
        </div>
        <p className="text-sm">{reminder.message}</p>
      </div>
      <div className="flex flex-shrink-0 flex-wrap gap-2">
        {reminder.donor_id ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/gift-aid/donors/${reminder.donor_id}`}>Donor</Link>
          </Button>
        ) : (
          <Button size="sm" variant="outline" type="button" onClick={() => openTab('declarations')}>
            Declarations
          </Button>
        )}
        {canDismiss ? (
          <Button
            size="sm"
            variant="ghost"
            type="button"
            disabled={pending}
            className="text-muted-foreground"
            onClick={() => {
              startTransition(async () => {
                const { success, error } = await dismissGiftAidReminder(reminder.id);
                if (!success || error) {
                  toast.error(error ?? 'Could not dismiss reminder.');
                  return;
                }
                toast.success('Reminder dismissed.');
                onDismissed();
              });
            }}
          >
            <XCircle size={14} className="mr-1" aria-hidden="true" />
            Dismiss
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function declarationTableStatusLabel(status: GiftAidControlCentreData['declarations'][number]['status']) {
  switch (status) {
    case 'active':
      return 'Can claim';
    case 'cancelled':
      return 'Cancelled';
    case 'expired':
      return 'Expired';
    case 'draft':
      return 'Draft';
    case 'invalid':
      return 'Needs review';
    default:
      return 'Needs review';
  }
}

function BackToGiftAidOverviewButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowRight size={14} className="rotate-180" aria-hidden="true" />
      Back to overview
    </button>
  );
}

export function GiftAidOverviewClient({
  data,
  canReview,
  canExport,
  initialTab,
}: {
  data: GiftAidControlCentreData;
  canReview: boolean;
  canExport: boolean;
  initialTab: GiftAidControlCentreTab;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<GiftAidControlCentreTab>(initialTab);
  const selectedScheduleBatch = useMemo(
    () =>
      data.schedule_batches.find((batch) =>
        ['Ready for HMRC', 'Needs review'].includes(batch.plain_status)
      ) ?? data.schedule_batches[0] ?? null,
    [data.schedule_batches]
  );

  const openTab = (tab: GiftAidControlCentreTab) => {
    setActiveTab(tab);
    router.replace(`/gift-aid?tab=${tab}`, { scroll: false });
  };

  const metricById = (id: string) => data.metrics.find((m) => m.id === id);
  const eligibleMetric = metricById('eligible-unclaimed');
  const reclaimMetric = metricById('estimated-reclaim');
  const missingDeclarationMetric = metricById('missing-declarations');
  const draftClaimMetric = metricById('draft-claim-batches');
  const submittedClaimMetric = metricById('submitted-this-tax-year');
  const invalidDonorMetric = metricById('invalid-donor-records');
  const topActions = data.health_score?.recommended_actions.slice(0, 3) ?? [];

  const backToOverview = () => openTab('overview');

  if (activeTab === 'donors') {
    return <div className="space-y-4"><BackToGiftAidOverviewButton onBack={backToOverview} /><DonorsTab data={data} /></div>;
  }
  if (activeTab === 'declarations') {
    return <div className="space-y-4"><BackToGiftAidOverviewButton onBack={backToOverview} /><DeclarationsTab data={data} /></div>;
  }
  if (activeTab === 'eligible-donations') {
    return <div className="space-y-4"><BackToGiftAidOverviewButton onBack={backToOverview} /><EligibleDonationsTab data={data} /></div>;
  }
  if (activeTab === 'claim-batches') {
    return <div className="space-y-4"><BackToGiftAidOverviewButton onBack={backToOverview} /><ClaimBatchesTab data={data} /></div>;
  }
  if (activeTab === 'schedule-builder') {
    return (
      <div className="space-y-4">
        <BackToGiftAidOverviewButton onBack={backToOverview} />
        <ScheduleBuilderTab data={data} selectedScheduleBatch={selectedScheduleBatch} canExport={canExport} />
      </div>
    );
  }
  if (activeTab === 'small-donations') {
    return <div className="space-y-4"><BackToGiftAidOverviewButton onBack={backToOverview} /><SmallDonationsTab data={data} canExport={canExport} /></div>;
  }
  if (activeTab === 'exceptions') {
    return <div className="space-y-4"><BackToGiftAidOverviewButton onBack={backToOverview} /><ExceptionsTab data={data} /></div>;
  }
  if (activeTab === 'settings') {
    return <div className="space-y-4"><BackToGiftAidOverviewButton onBack={backToOverview} /><SettingsTab canReview={canReview} reminderSettings={data.reminder_settings} /></div>;
  }

  /* ── Default: overview ─────────────────────────────────────── */
  return (
    <div className="space-y-5">

      {/* Position summary */}
      <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Today&apos;s position
            </p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1.5">
              <span className="text-sm text-muted-foreground">
                Health score{' '}
                <span className="font-semibold text-foreground">
                  {data.health_score?.score ?? '—'}
                </span>
              </span>
              <span className="text-sm text-muted-foreground">
                Ready to claim{' '}
                <span className="font-semibold text-foreground">
                  {reclaimMetric ? formatMetric(reclaimMetric) : '£0.00'}
                </span>
              </span>
              <span className="text-sm text-muted-foreground">
                Blocked{' '}
                <span className="font-semibold text-foreground">
                  {data.health_score
                    ? formatPounds(data.health_score.blocked_gift_aid_estimate_pence)
                    : '£0.00'}
                </span>
              </span>
              {data.health_score?.score_change != null &&
              data.health_score.previous_score != null ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  {data.health_score.score_change >= 0 ? (
                    <TrendingUp size={12} className="text-success" aria-hidden="true" />
                  ) : (
                    <TrendingDown size={12} className="text-warning" aria-hidden="true" />
                  )}
                  {data.health_score.score_change >= 0 ? '+' : ''}
                  {data.health_score.score_change} vs prior window
                </span>
              ) : null}
            </div>
          </div>
          {data.health_score ? (
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${giftAidGradeBadgeClass(data.health_score.grade)}`}
            >
              {giftAidGradeLabel(data.health_score.grade)}
            </span>
          ) : null}
        </div>

        {/* Claim readiness — plain list */}
        <div className="mt-5 border-t border-border/60 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Claim readiness
          </p>
          <dl className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                { label: 'Ready to claim', metric: eligibleMetric, tab: 'eligible-donations' },
                { label: 'Missing declarations', metric: missingDeclarationMetric, tab: 'declarations' },
                { label: 'Donor review needed', metric: invalidDonorMetric, tab: 'donors' },
                { label: 'Draft claim batches', metric: draftClaimMetric ?? submittedClaimMetric, tab: 'claim-batches' },
              ] as Array<{ label: string; metric: ReturnType<typeof metricById>; tab: GiftAidControlCentreTab }>
            ).map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => openTab(item.tab)}
                className="group flex items-center justify-between rounded-xl px-3 py-2 text-left transition hover:bg-accent-soft"
              >
                <dt className="text-sm text-muted-foreground group-hover:text-foreground">
                  {item.label}
                </dt>
                <dd className="ml-3 shrink-0 text-sm font-semibold text-foreground">
                  {item.metric ? formatMetric(item.metric) : '0'}
                </dd>
              </button>
            ))}
          </dl>
        </div>
      </div>

      {/* Recommended actions */}
      {topActions.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
          <div className="px-6 py-4 pb-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Recommended actions
            </p>
          </div>
          <ul className="divide-y divide-border/60">
            {topActions.map((action) => (
              <li key={action.id}>
                <Link
                  href={action.href}
                  onClick={(event) => {
                    const q = action.href.split('?')[1];
                    if (action.href.startsWith('/gift-aid?') && q?.startsWith('tab=')) {
                      event.preventDefault();
                      openTab(q.replace('tab=', '') as GiftAidControlCentreTab);
                    }
                  }}
                  className="flex items-center justify-between gap-4 px-6 py-4 transition hover:bg-accent-soft"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{action.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{action.description}</p>
                  </div>
                  <ArrowRight size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Attention / alerts */}
      {data.alerts.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
          <div className="px-6 py-4 pb-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Attention needed
            </p>
          </div>
          <ul className="divide-y divide-border/60">
            {data.alerts.map((alert) => (
              <li
                key={alert.id}
                className="flex items-center justify-between gap-4 px-6 py-4"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <ShieldAlert
                    size={15}
                    className={
                      alert.tone === 'danger'
                        ? 'mt-0.5 shrink-0 text-danger'
                        : alert.tone === 'warning'
                          ? 'mt-0.5 shrink-0 text-warning'
                          : 'mt-0.5 shrink-0 text-muted-foreground'
                    }
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {alert.count} {alert.title.toLowerCase()}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{alert.description}</p>
                  </div>
                </div>
                {alert.href ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() =>
                      openTab(alert.href!.replace('?tab=', '') as GiftAidControlCentreTab)
                    }
                  >
                    Review
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-6 py-4 shadow-card">
          <CheckCircle2 size={15} className="shrink-0 text-success" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Everything looks calm.</span>
            {' '}Eligible giving, declarations, and claim batches are in a healthy position.
          </p>
        </div>
      )}

      {/* Declaration reminders */}
      {data.reminders.length > 0 ? (
        <SectionCard
          title="Declaration reminders"
          description="Automated follow-ups for cancellations, stale declarations, and HMRC evidence gaps."
          contentClassName="space-y-3"
        >
          {data.reminders.map((reminder) => (
            <ReminderRow
              key={reminder.id}
              reminder={reminder}
              canDismiss={canReview}
              openTab={openTab}
              onDismissed={() => router.refresh()}
            />
          ))}
        </SectionCard>
      ) : null}

      {/* Explore sub-sections */}
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card">
        <div className="px-6 py-4 pb-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Explore
          </p>
        </div>
        <ul className="divide-y divide-border/60">
          {(
            [
              {
                label: 'Eligible donations',
                description: `${eligibleMetric?.value ?? 0} donations ready to include in a claim batch.`,
                tab: 'eligible-donations',
              },
              {
                label: 'Schedule builder',
                description: 'Preview, validate, and export HMRC claim schedules.',
                tab: 'schedule-builder',
              },
              {
                label: 'Small donations (GASDS)',
                description: 'Cash and contactless collections for the small donations scheme.',
                tab: 'small-donations',
              },
              {
                label: 'Exceptions',
                description: `${data.exceptions.length} item${data.exceptions.length === 1 ? '' : 's'} need resolution before a claim can be trusted.`,
                tab: 'exceptions',
              },
              ...(canReview
                ? [
                    {
                      label: 'Settings',
                      description: 'Reminder thresholds, audit controls, and recurring donor sync.',
                      tab: 'settings',
                    },
                  ]
                : []),
            ] as Array<{ label: string; description: string; tab: GiftAidControlCentreTab }>
          ).map((item) => (
            <li key={item.tab}>
              <button
                type="button"
                onClick={() => openTab(item.tab)}
                className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition hover:bg-accent-soft"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>
                </div>
                <ArrowRight size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}


function DonorsTab({ data }: { data: GiftAidControlCentreData }) {
  return (
    <SectionCard
      title="Donors"
      description="Donor readiness for Gift Aid claims, including declaration cover and giving totals."
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Donor name</TableHead>
              <TableHead>Postcode</TableHead>
              <TableHead>Declaration status</TableHead>
              <TableHead className="text-right">Total giving</TableHead>
              <TableHead className="text-right">Eligible giving</TableHead>
              <TableHead className="text-right">Gift Aid claimed</TableHead>
              <TableHead>Last donation</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.donors.length === 0 ? (
              <EmptyTable message="No Gift Aid donors yet." />
            ) : (
              data.donors.map((donor) => (
                <TableRow key={donor.id}>
                  <TableCell className="font-medium">{donor.full_name}</TableCell>
                  <TableCell>{donor.postcode ?? 'Not recorded'}</TableCell>
                  <TableCell>
                    <PlainStatus status={donor.declaration_status_label} />
                  </TableCell>
                  <TableCell className="text-right">{formatPounds(donor.total_giving_pence)}</TableCell>
                  <TableCell className="text-right">{formatPounds(donor.eligible_giving_pence)}</TableCell>
                  <TableCell className="text-right">{formatPounds(donor.gift_aid_claimed_pence)}</TableCell>
                  <TableCell>{formatDate(donor.latest_donation_date)}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/gift-aid/donors/${donor.id}`}>Open</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  );
}

function DeclarationsTab({ data }: { data: GiftAidControlCentreData }) {
  return (
    <SectionCard
      title="Declarations"
      description="Signed declaration cover and documents used to support HMRC claims."
      action={
        <Button asChild size="sm" variant="outline">
          <Link href="/gift-aid/declarations">Manage declarations</Link>
        </Button>
      }
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Donor</TableHead>
              <TableHead>Declaration type</TableHead>
              <TableHead>Signed date</TableHead>
              <TableHead>Coverage</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Document</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.declarations.length === 0 ? (
              <EmptyTable message="No declarations have been recorded yet." />
            ) : (
              data.declarations.map((declaration) => (
                <TableRow key={declaration.id}>
                  <TableCell className="font-medium">{declaration.donor_name}</TableCell>
                  <TableCell>{declaration.declaration_type}</TableCell>
                  <TableCell>{formatDate(declaration.signed_date ?? declaration.declaration_date)}</TableCell>
                  <TableCell>
                    {formatDate(declaration.start_date)} to{' '}
                    {declaration.end_date ? formatDate(declaration.end_date) : 'ongoing'}
                  </TableCell>
                  <TableCell>
                    <PlainStatus status={declarationTableStatusLabel(declaration.status)} />
                  </TableCell>
                  <TableCell>
                    {declaration.attachment_url || declaration.generated_pdf_storage_path ? (
                      <Badge variant="outline">Document stored</Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">Missing document</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link href="/gift-aid/declarations">Review</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  );
}

function EligibleDonationsTab({ data }: { data: GiftAidControlCentreData }) {
  return (
    <SectionCard
      title="Eligible donations"
      description="Donations currently marked Can claim and not yet included in an HMRC submission."
      action={
        <Button asChild size="sm">
          <Link href="/gift-aid/claim-builder">Build claim batch</Link>
        </Button>
      }
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Donor</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Fund</TableHead>
              <TableHead>Bank transaction</TableHead>
              <TableHead>Declaration</TableHead>
              <TableHead>Gift Aid status</TableHead>
              <TableHead>Claim batch</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.eligible_donations.length === 0 ? (
              <EmptyTable message="No eligible unclaimed donations right now." />
            ) : (
              data.eligible_donations.map((donation) => (
                <TableRow key={donation.donation_id}>
                  <TableCell>{formatDate(donation.donation_date)}</TableCell>
                  <TableCell>{donation.donor_name ?? 'Missing donor'}</TableCell>
                  <TableCell className="text-right">{formatPounds(donation.amount_pence)}</TableCell>
                  <TableCell>{donation.fund_name ?? 'No fund'}</TableCell>
                  <TableCell>{donation.bank_transaction_label ?? 'No bank link'}</TableCell>
                  <TableCell>{donation.declaration_label}</TableCell>
                  <TableCell>
                    <PlainStatus status={donation.plain_status} />
                  </TableCell>
                  <TableCell>{donation.claim_batch_label ?? 'Not batched'}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link href={donation.donor_id ? `/gift-aid/donors/${donation.donor_id}` : '/gift-aid/review'}>
                        Review
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  );
}

function ClaimBatchesTab({ data }: { data: GiftAidControlCentreData }) {
  return (
    <SectionCard
      title="Claim batches"
      description="Track batches from Needs review through Ready for HMRC, submitted, and paid."
      action={
        <Button asChild size="sm">
          <Link href="/gift-aid/claim-builder">Create batch</Link>
        </Button>
      }
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Donations count</TableHead>
              <TableHead className="text-right">Donation total</TableHead>
              <TableHead className="text-right">Gift Aid total</TableHead>
              <TableHead>Exported file</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.claim_batches.length === 0 ? (
              <EmptyTable message="No claim batches yet." />
            ) : (
              data.claim_batches.map((claim) => (
                <TableRow key={claim.id}>
                  <TableCell className="font-medium">
                    {claim.reference ?? `Claim ${claim.id.slice(0, 8)}`}
                  </TableCell>
                  <TableCell>
                    {formatDate(claim.claim_start)} to {formatDate(claim.claim_end)}
                  </TableCell>
                  <TableCell>
                    <PlainStatus status={claim.plain_status} />
                  </TableCell>
                  <TableCell>{claim.donation_count}</TableCell>
                  <TableCell className="text-right">{formatPounds(claim.eligible_amount_pence)}</TableCell>
                  <TableCell className="text-right">{formatPounds(claim.claimable_total_pence)}</TableCell>
                  <TableCell>
                    {claim.latest_export_file_name ? (
                      <span className="inline-flex items-center gap-2 text-sm text-success">
                        <Download size={14} aria-hidden="true" />
                        {claim.latest_export_file_name}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Not exported</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/gift-aid/${claim.id}`}>Open</Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/gift-aid/${claim.id}/schedule`}>Schedule</Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  );
}

function ScheduleBuilderTab({
  data,
  selectedScheduleBatch,
  canExport,
}: {
  data: GiftAidControlCentreData;
  selectedScheduleBatch: GiftAidControlCentreData['schedule_batches'][number] | null;
  canExport: boolean;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
      <SectionCard
        title="Schedule Builder"
        description="Select a claim batch, preview the HMRC schedule, edit safe fields with an audit reason, validate, then export Excel and a PDF review copy."
        contentClassName="space-y-4"
      >
        {selectedScheduleBatch ? (
          <div className="rounded-2xl border border-border/70 p-4">
            <p className="text-sm text-muted-foreground">Selected claim batch</p>
            <p className="mt-1 text-lg font-semibold">{selectedScheduleBatch.label}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Rows</p>
                <p className="font-semibold">{selectedScheduleBatch.row_count}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Donation total</p>
                <p className="font-semibold">{formatPounds(selectedScheduleBatch.total_donation_pence)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Gift Aid</p>
                <p className="font-semibold">{formatPounds(selectedScheduleBatch.total_gift_aid_pence)}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <PlainStatus status={selectedScheduleBatch.plain_status} />
              {selectedScheduleBatch.latest_export_file_name ? (
                <Badge variant="outline">Schedule export ready</Badge>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild disabled={!canExport}>
                <Link href={`/gift-aid/${selectedScheduleBatch.id}/schedule`}>
                  Preview schedule
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/gift-aid/claim-builder">Choose another batch</Link>
              </Button>
            </div>
          </div>
        ) : (
          <SoftAlert variant="info" icon={<FileStack size={16} />}>
            <p className="font-medium">No claim batches are available yet.</p>
            <p className="mt-1">Create a batch before building an HMRC schedule.</p>
          </SoftAlert>
        )}
      </SectionCard>

      <SectionCard
        title="Available batches"
        description="Use Ready for HMRC batches for export, and Needs review batches for corrections."
      >
        <div className="space-y-3">
          {data.schedule_batches.map((batch) => (
            <Link
              key={batch.id}
              href={`/gift-aid/${batch.id}/schedule`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 p-4 transition hover:border-primary/30"
            >
              <div>
                <p className="font-medium">{batch.label}</p>
                <p className="text-sm text-muted-foreground">
                  {batch.row_count} rows, {formatPounds(batch.total_gift_aid_pence)} Gift Aid
                </p>
              </div>
              <PlainStatus status={batch.plain_status} />
            </Link>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function SmallDonationsTab({
  data,
  canExport,
}: {
  data: GiftAidControlCentreData;
  canExport: boolean;
}) {
  const g = data.gasds;
  return (
    <div className="space-y-4">
      <SectionCard
        title="Gift Aid Small Donations Scheme (GASDS)"
        description={`Cash / contactless collections with no named donor declaration on the standard HMRC schedule — they appear on the GASDS worksheet in the workbook export. Tax year ${g.tax_year_label}.`}
        action={
          canExport ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/gift-aid/small-donations/new">Record batch</Link>
            </Button>
          ) : null
        }
        contentClassName="space-y-4"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/70 p-4">
            <p className="text-xs font-medium text-muted-foreground">Claimed eligible (TY)</p>
            <p className="mt-1 text-2xl font-semibold">{formatPounds(g.claimed_eligible_pence)}</p>
          </div>
          <div className="rounded-xl border border-border/70 p-4">
            <p className="text-xs font-medium text-muted-foreground">HMRC cap (eligible)</p>
            <p className="mt-1 text-2xl font-semibold">{formatPounds(g.annual_cap_pence)}</p>
          </div>
          <div className="rounded-xl border border-border/70 p-4">
            <p className="text-xs font-medium text-muted-foreground">Remaining headroom</p>
            <p className="mt-1 text-2xl font-semibold">{formatPounds(g.remaining_eligible_pence)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {g.ready_batch_count} batch{g.ready_batch_count === 1 ? '' : 'es'} ready to add to a claim.
            </p>
          </div>
        </div>
        {canExport ? (
          <p className="text-sm text-muted-foreground">
            Add ready batches in{' '}
            <Link className="underline underline-offset-4" href="/gift-aid/claim-builder">
              Claim builder
            </Link>
            .
          </p>
        ) : null}
      </SectionCard>

      <SectionCard title="Small donation batches" description="Recent batches recorded for this workspace.">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Collection</TableHead>
                <TableHead>Service / event</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Eligible</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.gasds_batches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    No GASDS batches recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                data.gasds_batches.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.batch_reference}</TableCell>
                    <TableCell>{formatDate(row.collection_date)}</TableCell>
                    <TableCell className="max-w-[240px]">{row.service_or_event_name}</TableCell>
                    <TableCell className="capitalize">{row.collection_method}</TableCell>
                    <TableCell className="text-right">{formatPounds(row.eligible_amount_pence)}</TableCell>
                    <TableCell>
                      <PlainStatus status={row.plain_status} />
                    </TableCell>
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

function ExceptionsTab({ data }: { data: GiftAidControlCentreData }) {
  return (
    <SectionCard
      title="Exceptions"
      description="Resolve blockers before a claim batch is trusted or sent to HMRC."
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Donor</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.exceptions.length === 0 ? (
              <EmptyTable message="No Gift Aid exceptions need attention." />
            ) : (
              data.exceptions.map((exception) => (
                <TableRow key={exception.id}>
                  <TableCell>{exception.donation_id?.slice(0, 8) ?? 'Batch item'}</TableCell>
                  <TableCell>{exception.donor_name ?? 'Missing donor'}</TableCell>
                  <TableCell className="text-right">
                    {exception.amount_pence == null ? 'Not recorded' : formatPounds(exception.amount_pence)}
                  </TableCell>
                  <TableCell>
                    <PlainStatus status={exception.plain_status} />
                  </TableCell>
                  <TableCell className="max-w-[420px]">{exception.message}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link href={exception.href}>Fix</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  );
}

function SettingsTab({
  canReview,
  reminderSettings,
}: {
  canReview: boolean;
  reminderSettings: GiftAidControlCentreData['reminder_settings'];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [refreshPending, startRefreshReminder] = useTransition();
  const [recurringPending, startRecurringTransition] = useTransition();
  const [staleDays, setStaleDays] = useState(String(reminderSettings.stale_declaration_days));
  const [noDonationDays, setNoDonationDays] = useState(String(reminderSettings.no_donation_days));
  const [requireSigned, setRequireSigned] = useState(reminderSettings.require_signed_copy);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SectionCard
        title="Gift Aid settings"
        description="Operational controls for trustee-safe Gift Aid processing."
        contentClassName="space-y-3"
      >
        {canReview ? (
          <>
            <div className="space-y-3 rounded-2xl border border-border/70 p-4">
              <div>
                <p className="font-medium">Declaration reminder thresholds</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Used when you refresh reminders (opening Gift Aid refreshes automatically). Unsigned copy rule applies only when enabled below.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="ga-stale-days">
                    Days before declaration feels stale (recent giving)
                  </label>
                  <Input
                    id="ga-stale-days"
                    inputMode="numeric"
                    value={staleDays}
                    onChange={(e) => setStaleDays(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Allowed 30–1825.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="ga-no-donation-days">
                    Days since last donation (inactivity ping)
                  </label>
                  <Input
                    id="ga-no-donation-days"
                    inputMode="numeric"
                    value={noDonationDays}
                    onChange={(e) => setNoDonationDays(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Allowed 30–2555.</p>
                </div>
              </div>
              <label className="flex cursor-pointer items-start gap-2 text-sm leading-snug">
                <Checkbox checked={requireSigned} onCheckedChange={(v) => setRequireSigned(v === true)} />
                <span>Require uploaded or generated declaration document before declaring reminders as complete.</span>
              </label>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const stale = Number.parseInt(staleDays, 10);
                    const none = Number.parseInt(noDonationDays, 10);
                    if (Number.isNaN(stale) || Number.isNaN(none)) {
                      toast.error('Enter valid day counts.');
                      return;
                    }
                    const { success, error } = await updateGiftAidReminderSettings({
                      staleDeclarationDays: stale,
                      noDonationDays: none,
                      requireSignedCopy: requireSigned,
                    });
                    if (!success || error) {
                      toast.error(error ?? 'Unable to save settings.');
                      return;
                    }
                    toast.success('Reminder settings saved.');
                    router.refresh();
                  });
                }}
              >
                {pending ? 'Saving…' : 'Save reminder settings'}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 p-4">
              <Button
                type="button"
                disabled={refreshPending}
                variant="outline"
                onClick={() => {
                  startRefreshReminder(async () => {
                    const res = await refreshGiftAidDeclarationReminders();
                    if (!res.success || res.error) {
                      toast.error(res.error ?? 'Refresh failed.');
                      return;
                    }
                    toast.success('Declaration reminders refreshed.');
                    router.refresh();
                  });
                }}
              >
                {refreshPending ? 'Refreshing…' : 'Refresh declaration reminders'}
              </Button>
              <p className="text-sm text-muted-foreground">
                Re-runs hygiene checks immediately after you change thresholds or uploads.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 p-4">
              <Button
                type="button"
                disabled={recurringPending}
                onClick={() => {
                  startRecurringTransition(async () => {
                    const res = await syncGiftAidRecurringDonorPatterns();
                    if (!res.success) {
                      toast.error(res.error ?? 'Unable to refresh recurring patterns.');
                      return;
                    }
                    toast.success(
                      `Recurring donor patterns refreshed${res.insertedCount != null ? ` (${res.insertedCount} active rows)` : ''}.`
                    );
                    router.refresh();
                  });
                }}
              >
                {recurringPending ? 'Refreshing…' : 'Refresh recurring donor insights'}
              </Button>
              <p className="text-sm text-muted-foreground">
                Scans posted donations to detect repeating amounts and timings. Runs automatically when you open Gift Aid too.
              </p>
            </div>
          </>
        ) : null}
        <SoftAlert variant="info" icon={<Settings size={16} />}>
          <p className="font-medium">Settings are intentionally conservative.</p>
          <p className="mt-1">
            Claims require valid declarations, donor details, duplicate checks, and schedule
            validation before HMRC export.
          </p>
        </SoftAlert>
        <div className="rounded-2xl border border-border/70 p-4">
          <p className="font-medium">Plain language used across the control centre</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {['Can claim', 'Missing declaration', 'Already claimed', 'Ready for HMRC', 'Needs review'].map((label) => (
              <PlainStatus key={label} status={label} />
            ))}
          </div>
        </div>
      </SectionCard>
      <SectionCard
        title="Audit and safety"
        description="Gift Aid edits and exports are recorded for review."
        contentClassName="space-y-3"
      >
        <div className="rounded-2xl border border-border/70 p-4">
          <div className="flex items-start gap-3">
            <FileCheck2 size={18} className="mt-0.5 text-success" aria-hidden="true" />
            <div>
              <p className="font-medium">Schedule edits require a reason</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Safe fields can be edited in the schedule preview, with the original value,
                edited value, user, and time retained.
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border/70 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 text-warning" aria-hidden="true" />
            <div>
              <p className="font-medium">Exports lock included rows</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Re-export creates a new version instead of overwriting the previous HMRC file.
              </p>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
