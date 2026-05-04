import type { SupabaseClient } from '@supabase/supabase-js';
import type { GiftAidDeclarationRow, GiftAidReviewQueueRow } from './types';
import type { GiftAidRecurringControlInsights } from './control-centre';
import {
  isMissedRecurringDonation,
  projectedGiftAidPenceNextMonth,
  type RecurringPatternForInsight,
} from './recurring-donor-detection';

function isEligibleUnclaimedFromReview(row: GiftAidReviewQueueRow) {
  return (
    row.workflow_stage === 'prepare_claim' ||
    (row.gift_aid_status === 'eligible' &&
      !row.gift_aid_claim_id &&
      !row.duplicate_blocking)
  );
}

export async function buildGiftAidRecurringControlInsights(
  organisationId: string,
  supabase: SupabaseClient,
  params: {
    declarations: GiftAidDeclarationRow[];
    reviewRows: GiftAidReviewQueueRow[];
  }
): Promise<GiftAidRecurringControlInsights> {
  const { data: patterns, error } = await supabase
    .from('recurring_donor_patterns')
    .select(
      'donor_id, pattern_type, expected_amount_pence, amount_tolerance_pence, normalized_bank_reference, status, grace_days, next_expected_date, last_occurrence_at'
    )
    .eq('workspace_id', organisationId)
    .eq('status', 'active');

  if (error || !patterns?.length) {
    return {
      activeRecurringDonorCount: 0,
      missedExpectedCount: 0,
      projectedMonthlyGiftAidPence: 0,
      recurringMissingDeclarationDonorCount: 0,
      recurringEligibleUnclaimedDonationCount: 0,
    };
  }

  const activeDonorsWithDeclaration = new Set(
    params.declarations.filter((d) => d.is_active && d.status === 'active').map((d) => d.donor_id)
  );

  const patternDonorIds = new Set(patterns.map((p) => p.donor_id as string));
  let recurringMissingDeclarationDonorCount = 0;
  for (const id of patternDonorIds) {
    if (!activeDonorsWithDeclaration.has(id)) recurringMissingDeclarationDonorCount += 1;
  }

  const recurringEligibleUnclaimedDonationCount = params.reviewRows.filter(
    (row) =>
      row.donor_id &&
      patternDonorIds.has(row.donor_id) &&
      isEligibleUnclaimedFromReview(row)
  ).length;

  const donorIds = [...patternDonorIds];
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 200);

  let donationsForMissed: Array<{
    donor_id: string;
    donation_date: string;
    amount_pence: number;
  }> = [];
  if (donorIds.length > 0) {
    const { data: recentDonations } = await supabase
      .from('donations')
      .select('donor_id, donation_date, amount_pence')
      .eq('organisation_id', organisationId)
      .eq('status', 'posted')
      .in('donor_id', donorIds)
      .gte('donation_date', since.toISOString().slice(0, 10));
    donationsForMissed = (recentDonations ?? []).map((d) => ({
      donor_id: d.donor_id as string,
      donation_date: String(d.donation_date).slice(0, 10),
      amount_pence: Number(d.amount_pence),
    }));
  }

  const asInsight = (p: (typeof patterns)[number]): RecurringPatternForInsight => ({
    donor_id: p.donor_id as string,
    pattern_type: p.pattern_type as RecurringPatternForInsight['pattern_type'],
    expected_amount_pence: Number(p.expected_amount_pence),
    amount_tolerance_pence: Number(p.amount_tolerance_pence),
    normalized_bank_reference: p.normalized_bank_reference as string | null,
    status: 'active',
    grace_days: Number(p.grace_days ?? 7),
    next_expected_date: (p.next_expected_date as string | null) ?? null,
    last_occurrence_at: (p.last_occurrence_at as string | null) ?? null,
  });

  let missedExpectedCount = 0;
  const todayIso = new Date().toISOString().slice(0, 10);
  for (const p of patterns) {
    const insight = asInsight(p);
    if (
      isMissedRecurringDonation({
        pattern: insight,
        postedDonations: donationsForMissed,
        todayIso,
      })
    ) {
      missedExpectedCount += 1;
    }
  }

  const projectedMonthlyGiftAidPence = projectedGiftAidPenceNextMonth(
    patterns.map((p) => asInsight(p))
  );

  return {
    activeRecurringDonorCount: patternDonorIds.size,
    missedExpectedCount,
    projectedMonthlyGiftAidPence,
    recurringMissingDeclarationDonorCount,
    recurringEligibleUnclaimedDonationCount,
  };
}
