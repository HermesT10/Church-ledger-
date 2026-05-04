import type {
  GiftAidClaimRow,
  GiftAidControlAlert,
  GiftAidControlCentreData,
  GiftAidControlDonorRow,
  GiftAidControlEligibleDonationRow,
  GiftAidControlExceptionRow,
  GiftAidControlGasdsBatchRow,
  GiftAidControlMetric,
  GiftAidControlScheduleBatchOption,
  GiftAidDeclarationRow,
  GiftAidDonorRow,
  GiftAidGasdsSummary,
  GiftAidReminderRow,
  GiftAidReminderSettings,
  GiftAidReviewQueueRow,
} from './types';
import type { GiftAidHealthScoreResult } from './health-score';

const DONOR_DETAIL_CODES = new Set([
  'missing_first_name_or_initial',
  'missing_last_name',
  'missing_house_name_or_number',
  'missing_postcode',
]);

export function plainGiftAidStatusLabel(status: string | null | undefined) {
  switch (status) {
    case 'eligible':
      return 'Can claim';
    case 'missing_declaration':
    case 'matched_no_declaration':
      return 'Missing declaration';
    case 'already_claimed':
    case 'included_in_claim':
    case 'exported':
    case 'submitted':
    case 'paid':
      return 'Already claimed';
    case 'included_in_draft_claim':
      return 'Needs review';
    case 'invalid_donor_details':
    case 'ineligible':
      return 'Needs review';
    case 'rejected':
      return 'Rejected';
    case 'review':
    case 'approved':
      return 'Ready for HMRC';
    case 'draft':
      return 'Needs review';
    default:
      return 'Needs review';
  }
}

function isEligibleUnclaimed(row: GiftAidReviewQueueRow) {
  return (
    row.workflow_stage === 'prepare_claim' ||
    (row.gift_aid_status === 'eligible' &&
      !row.gift_aid_claim_id &&
      !row.duplicate_blocking)
  );
}

function isInvalidDonorRecord(row: GiftAidReviewQueueRow) {
  return row.validation_issues.some((issue) => DONOR_DETAIL_CODES.has(issue.code));
}

function currentTaxYearStart(now = new Date()) {
  const year = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(Date.UTC(year, 3, 6));
}

export interface GiftAidRecurringControlInsights {
  activeRecurringDonorCount: number;
  missedExpectedCount: number;
  projectedMonthlyGiftAidPence: number;
  recurringMissingDeclarationDonorCount: number;
  recurringEligibleUnclaimedDonationCount: number;
}

export function buildGiftAidControlCentreData(params: {
  donors: GiftAidDonorRow[];
  declarations: GiftAidDeclarationRow[];
  reviewRows: GiftAidReviewQueueRow[];
  claims: GiftAidClaimRow[];
  donorTotals?: Map<
    string,
    {
      totalGivingPence: number;
      eligibleGivingPence: number;
      giftAidClaimedPence: number;
    }
  >;
  now?: Date;
  recurringInsights?: GiftAidRecurringControlInsights | null;
  gasds: GiftAidGasdsSummary;
  gasds_batches?: GiftAidControlGasdsBatchRow[];
  reminders?: GiftAidReminderRow[];
  reminder_settings?: GiftAidReminderSettings;
  health_score: GiftAidHealthScoreResult | null;
}): GiftAidControlCentreData {
  const donorTotals = params.donorTotals ?? new Map();
  const remindersOpen = params.reminders ?? [];
  const reminderDefaults: GiftAidReminderSettings = {
    stale_declaration_days: 365,
    no_donation_days: 540,
    require_signed_copy: false,
  };
  const reminderSettings = params.reminder_settings ?? reminderDefaults;
  const eligibleRows = params.reviewRows.filter(isEligibleUnclaimed);
  const missingDeclarationRows = params.reviewRows.filter(
    (row) =>
      row.declaration_status === 'missing' ||
      row.gift_aid_status === 'matched_no_declaration' ||
      row.gift_aid_status === 'missing_declaration'
  );
  const invalidDonorRows = params.reviewRows.filter(isInvalidDonorRecord);
  const missingDonorRows = params.reviewRows.filter((row) => !row.donor_id);
  const draftClaims = params.claims.filter((claim) =>
    ['draft', 'review', 'approved'].includes(claim.status)
  );
  const reviewClaims = params.claims.filter((claim) =>
    ['draft', 'review', 'approved'].includes(claim.status)
  );
  const scheduleReadyClaims = params.claims.filter((claim) =>
    Boolean(claim.latest_export_id || claim.latest_export_file_name)
  );
  const taxYearStart = currentTaxYearStart(params.now);
  const submittedThisTaxYear = params.claims.filter((claim) => {
    if (!claim.submitted_at) return false;
    return new Date(claim.submitted_at) >= taxYearStart;
  });
  const rejectedOrFailedRows = params.reviewRows.filter(
    (row) =>
      row.gift_aid_status === 'rejected' ||
      row.eligibility_status === 'blocked' ||
      row.duplicate_blocking
  );

  const estimatedGiftAidPence = eligibleRows.reduce(
    (sum, row) => sum + Math.round(Number(row.amount_pence) * 0.25),
    0
  );

  const urgentReminderCount = remindersOpen.filter((r) => r.severity === 'urgent').length;

  const metrics: GiftAidControlMetric[] = [
    ...(remindersOpen.length > 0
      ? [
          {
            id: 'declaration-reminders-open',
            label: 'Open declaration reminders',
            value: remindersOpen.length,
            helper:
              urgentReminderCount > 0
                ? `${urgentReminderCount} flagged urgent — review wording and HMRC evidence trails.`
                : 'Operational reminders for cancellations, stale declarations, and postcode gaps.',
            href: '?tab=settings',
          },
        ]
      : []),
    {
      id: 'eligible-unclaimed',
      label: 'Eligible unclaimed donations',
      value: eligibleRows.length,
      helper: 'Giving marked Can claim and not yet in a submitted claim.',
      href: '?tab=eligible-donations',
    },
    {
      id: 'estimated-reclaim',
      label: 'Estimated Gift Aid reclaim',
      value: estimatedGiftAidPence,
      value_pence: estimatedGiftAidPence,
      helper: 'Estimated at 25% of donations that can claim.',
      href: '?tab=eligible-donations',
    },
    {
      id: 'missing-declarations',
      label: 'Missing declarations',
      value: missingDeclarationRows.length,
      helper: 'Donations or donors needing a valid declaration.',
      href: '?tab=declarations',
    },
    {
      id: 'invalid-donor-records',
      label: 'Invalid donor records',
      value: invalidDonorRows.length,
      helper: 'Records missing HMRC-required donor details.',
      href: '?tab=exceptions',
    },
    {
      id: 'draft-claim-batches',
      label: 'Draft claim batches',
      value: draftClaims.length,
      helper: 'Batches needing review or approval before HMRC export.',
      href: '?tab=claim-batches',
    },
    {
      id: 'submitted-this-tax-year',
      label: 'Claims submitted this tax year',
      value: submittedThisTaxYear.length,
      helper: 'Claims submitted since 6 April.',
      href: '?tab=claim-batches',
    },
    {
      id: 'gasds-headroom',
      label: 'GASDS eligible headroom (this tax year)',
      value: Math.max(0, params.gasds.remaining_eligible_pence),
      value_pence: Math.max(0, params.gasds.remaining_eligible_pence),
      helper: `Small donations cap ${params.gasds.tax_year_label} — £${(params.gasds.annual_cap_pence / 100).toFixed(0)} eligible.`,
      href: '?tab=small-donations',
    },
  ];

  if (params.recurringInsights) {
    const recurring = params.recurringInsights;
    metrics.push(
      {
        id: 'recurring-donors',
        label: 'Recurring donors detected',
        value: recurring.activeRecurringDonorCount,
        helper: 'Donors with a repeating amount and cadence.',
        href: '?tab=donors',
      },
      {
        id: 'recurring-projected-gift-aid',
        label: 'Projected Gift Aid (recurring)',
        value: recurring.projectedMonthlyGiftAidPence,
        value_pence: recurring.projectedMonthlyGiftAidPence,
        helper:
          'Rough next-month Gift Aid from active recurring patterns (25% estimate).',
        href: '?tab=overview',
      },
      {
        id: 'recurring-missed-expected',
        label: 'Missed expected recurring gifts',
        value: recurring.missedExpectedCount,
        helper: 'Past grace period since next expected donation date.',
        href: '?tab=overview',
      }
    );
  }

  const declarationReminderAlertTone: GiftAidControlAlert['tone'] =
    urgentReminderCount > 0 ? 'danger' : 'warning';

  const declarationReminderAlerts: GiftAidControlAlert[] =
    remindersOpen.length > 0
      ? [
          {
            id: 'gift-aid-declaration-reminders-open',
            title: 'Gift Aid declaration reminders',
            description:
              'Outstanding declaration hygiene checks (documents, cancellations, postcode, renewal timing). Manage thresholds on the Settings tab.',
            count: remindersOpen.length,
            tone: declarationReminderAlertTone,
            href: '?tab=settings',
          },
        ]
      : [];

  let alertSeeds: GiftAidControlAlert[] = [
    ...declarationReminderAlerts,
    {
      id: 'donors-missing-declarations',
      title: 'Donors missing declarations',
      description: 'Add declarations before these donations can be claimed.',
      count: missingDeclarationRows.length,
      tone: 'warning',
      href: '?tab=declarations',
    },
    {
      id: 'donations-missing-donor-match',
      title: 'Donations missing donor match',
      description: 'Match donations to a donor so eligibility can be checked.',
      count: missingDonorRows.length,
      tone: 'warning',
      href: '?tab=exceptions',
    },
    {
      id: 'eligible-not-claimed',
      title: 'Eligible donations not yet claimed',
      description: 'These donations can be moved into a claim batch.',
      count: eligibleRows.length,
      tone: 'info',
      href: '?tab=eligible-donations',
    },
    {
      id: 'claim-batches-needing-review',
      title: 'Claim batches needing review',
      description: 'Review and approve these batches before export.',
      count: reviewClaims.length,
      tone: 'warning',
      href: '?tab=claim-batches',
    },
    {
      id: 'schedule-exports-ready',
      title: 'Schedule exports ready',
      description: 'HMRC schedule files are ready to download or re-export.',
      count: scheduleReadyClaims.length,
      tone: 'success',
      href: '?tab=schedule-builder',
    },
    {
      id: 'rejected-failed-items',
      title: 'Rejected or failed claim items',
      description: 'Resolve these before trustees rely on the claim total.',
      count: rejectedOrFailedRows.length,
      tone: 'danger',
      href: '?tab=exceptions',
    },
  ];

  if (params.recurringInsights) {
    const recurring = params.recurringInsights;
    alertSeeds = [
      ...alertSeeds,
      {
        id: 'recurring-missed-donation',
        title: 'Expected recurring donations overdue',
        description:
          'A donation was expected plus grace window; follow up privately with the donor if needed.',
        count: recurring.missedExpectedCount,
        tone: 'warning',
        href: '?tab=overview',
      },
      {
        id: 'recurring-missing-declaration',
        title: 'Recurring donors without a valid declaration',
        description:
          'Add or renew declarations so repeating gifts can stay claimable.',
        count: recurring.recurringMissingDeclarationDonorCount,
        tone: 'warning',
        href: '?tab=declarations',
      },
      {
        id: 'recurring-eligible-unclaimed',
        title: 'Recurring-eligible Gift Aid not yet claimed',
        description:
          'Marked eligible repeating gifts that are still outside a submitted claim.',
        count: recurring.recurringEligibleUnclaimedDonationCount,
        tone: 'info',
        href: '?tab=eligible-donations',
      },
    ];
  }

  let alertSeedsWithGasds = alertSeeds;
  if (params.gasds.remaining_eligible_pence < 500_00) {
    alertSeedsWithGasds = [
      ...alertSeeds,
      {
        id: 'gasds-cap-low',
        title: 'GASDS annual cap nearly reached',
        description:
          'Review small-donation totals before submitting further GASDS lines this tax year.',
        count: 1,
        tone: 'warning' as const,
        href: '?tab=small-donations',
      },
    ];
  }

  const alerts = alertSeedsWithGasds.filter((alert) => alert.count > 0);

  const donors: GiftAidControlDonorRow[] = params.donors.map((donor) => {
    const totals = donorTotals.get(donor.id) ?? {
      totalGivingPence: 0,
      eligibleGivingPence: 0,
      giftAidClaimedPence: 0,
    };
    return {
      ...donor,
      declaration_status_label:
        donor.active_declaration_count > 0
          ? 'Active'
          : donor.declaration_count > 0
            ? 'Needs review'
            : 'Missing declaration',
      total_giving_pence: totals.totalGivingPence,
      eligible_giving_pence: totals.eligibleGivingPence,
      gift_aid_claimed_pence: totals.giftAidClaimedPence,
    };
  });

  const eligible_donations: GiftAidControlEligibleDonationRow[] = eligibleRows.map(
    (row) => ({
      donation_id: row.donation_id,
      donation_date: row.donation_date,
      donor_id: row.donor_id,
      donor_name: row.donor_name,
      amount_pence: row.amount_pence,
      fund_name: row.fund_name,
      bank_transaction_label: row.bank_reference,
      declaration_label: row.declaration_id
        ? `${row.declaration_type ?? 'Declaration'} from ${row.declaration_start_date ?? row.declaration_date ?? 'record'}`
        : 'Missing declaration',
      gift_aid_status: row.gift_aid_status,
      plain_status: plainGiftAidStatusLabel(row.gift_aid_status),
      claim_batch_label: row.gift_aid_claim_id
        ? `Claim ${row.gift_aid_claim_id.slice(0, 8)}`
        : null,
      workflow_stage: row.workflow_stage,
    })
  );

  const claim_batches = params.claims.map((claim) => ({
    ...claim,
    plain_status: plainGiftAidStatusLabel(claim.status),
    needs_review: ['draft', 'review', 'approved'].includes(claim.status),
    ready_for_hmrc: Boolean(claim.latest_export_id || claim.latest_export_file_name),
  }));

  const exceptions: GiftAidControlExceptionRow[] = params.reviewRows
    .filter(
      (row) =>
        !isEligibleUnclaimed(row) ||
        row.validation_issues.length > 0 ||
        row.duplicate_blocking
    )
    .map((row) => ({
      id: row.donation_id,
      donation_id: row.donation_id,
      donor_id: row.donor_id,
      donor_name: row.donor_name,
      amount_pence: row.amount_pence,
      message:
        row.validation_reason ??
        row.duplicate_warning ??
        row.queue_reason ??
        plainGiftAidStatusLabel(row.gift_aid_status),
      plain_status: plainGiftAidStatusLabel(row.gift_aid_status),
      href: row.donor_id ? `/gift-aid/donors/${row.donor_id}` : '/gift-aid/review',
    }));

  const schedule_batches: GiftAidControlScheduleBatchOption[] = claim_batches.map(
    (claim) => ({
      id: claim.id,
      label: claim.reference?.trim() || `Claim batch ${claim.id.slice(0, 8)}`,
      status: claim.status,
      plain_status: claim.plain_status,
      row_count: claim.donation_count,
      total_donation_pence: claim.eligible_amount_pence,
      total_gift_aid_pence: claim.claimable_total_pence,
      latest_export_file_name: claim.latest_export_file_name,
    })
  );

  return {
    health_score: params.health_score,
    metrics,
    alerts,
    donors,
    declarations: params.declarations,
    eligible_donations,
    claim_batches,
    exceptions,
    schedule_batches,
    gasds: params.gasds,
    gasds_batches: params.gasds_batches ?? [],
    reminders: remindersOpen,
    reminder_settings: reminderSettings,
  };
}
