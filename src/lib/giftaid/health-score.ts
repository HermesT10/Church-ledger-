/**
 * Workspace Gift Aid health score — composite 0–100 with narrative + actions.
 * Periods are inclusive YYYY-MM-DD donation_date bounds against the review queue.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  GiftAidClaimRow,
  GiftAidGasdsSummary,
  GiftAidReviewQueueRow,
} from './types';
import { ukTaxYearStartDate } from './gasds';
import { GIFT_AID_STANDARD_CLAIM_RATE } from './helpers';
import type { GiftAidRecurringControlInsights } from './control-centre';

const DONOR_ADDRESS_CODES = new Set([
  'missing_first_name_or_initial',
  'missing_last_name',
  'missing_house_name_or_number',
  'missing_postcode',
]);

/** Inclusive donation_date range (YYYY-MM-DD). */
export type GiftAidHealthPeriod = { start: string; end: string };

export type GiftAidHealthGrade =
  | 'excellent'
  | 'good'
  | 'needs_attention'
  | 'poor';

export interface GiftAidHealthRecommendedAction {
  id: string;
  title: string;
  description: string;
  href: string;
  severity: 'info' | 'warning' | 'danger';
}

export interface GiftAidHealthScoreResult {
  score: number;
  grade: GiftAidHealthGrade;
  strengths: string[];
  risks: string[];
  recommended_actions: GiftAidHealthRecommendedAction[];
  /** Combined estimate of reclaim at risk or still queued (25% of tracked amounts). */
  financial_opportunity_pence: number;
  /** HMRC-style Gift Aid tax estimate blocked by missing declaration pathway. */
  blocked_gift_aid_estimate_pence: number;
  period_label: string;
  primary_period: GiftAidHealthPeriod;
  comparison_period: GiftAidHealthPeriod | null;
  previous_score: number | null;
  score_change: number | null;
}

export interface GiftAidHealthSnapshotMetrics {
  periodEligibleGivingPence: number;
  periodGivingWithEffectiveDeclarationCoveragePence: number;
  blockedMissingDeclarationGiftAidPence: number;
  donorAddressIssuesInPeriodDonationsCount: number;
  duplicateBlockingRowsInPeriod: number;
  rejectedOrExcludedRowsInPeriod: number;
  unclaimedEligibleRowsInPeriod: number;
  unclaimedEligibleGiftAidPence: number;
  stuckClaimBatchCount: number;
  gasdsRemainingRatio01: number;
  unreconciledHmrcPaymentsCount: number;
  recurringDonorsMissingDeclarationCount: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function roundScore(raw: number): number {
  return clamp(Math.round(raw), 0, 100);
}

export function donationDateWithinPeriod(
  donationDate: string | null | undefined,
  period: GiftAidHealthPeriod
): boolean {
  if (!donationDate) return false;
  const d = donationDate.includes('T') ? donationDate.slice(0, 10) : donationDate;
  return d >= period.start && d <= period.end;
}

function giftAidEstimatePence(amountPence: number): number {
  return Math.round(amountPence * GIFT_AID_STANDARD_CLAIM_RATE);
}

/** Primary = current UK tax year to date (6 Apr → today or TY end). Previous = same elapsed window in prior tax year. */
export function deriveTaxYearPrimaryAndComparisonPeriods(now = new Date()): {
  current: GiftAidHealthPeriod;
  previous: GiftAidHealthPeriod | null;
} {
  const tyStart = ukTaxYearStartDate(now);
  const tyStartUtc = tyStart.toISOString().slice(0, 10);
  const tyEndInclusive = new Date(tyStart);
  tyEndInclusive.setUTCFullYear(tyEndInclusive.getUTCFullYear() + 1);
  tyEndInclusive.setUTCDate(tyEndInclusive.getUTCDate() - 1);
  const tyEndInclusiveIso = tyEndInclusive.toISOString().slice(0, 10);

  const todayIso = now.toISOString().slice(0, 10);
  const currentEnd = todayIso <= tyEndInclusiveIso ? todayIso : tyEndInclusiveIso;

  const current: GiftAidHealthPeriod = { start: tyStartUtc, end: currentEnd };

  const prevTYStart = new Date(tyStart);
  prevTYStart.setUTCFullYear(prevTYStart.getUTCFullYear() - 1);
  const prevTYEndInclusive = new Date(tyStart);
  prevTYEndInclusive.setUTCDate(prevTYEndInclusive.getUTCDate() - 1);

  const lenDays =
    (Date.UTC(
      Number(currentEnd.slice(0, 4)),
      Number(currentEnd.slice(5, 7)) - 1,
      Number(currentEnd.slice(8, 10))
    ) -
      Date.UTC(
        Number(tyStartUtc.slice(0, 4)),
        Number(tyStartUtc.slice(5, 7)) - 1,
        Number(tyStartUtc.slice(8, 10))
      )) /
      86400000 +
    1;

  const prevStart = prevTYStart.toISOString().slice(0, 10);
  const pEnd = new Date(`${prevStart}T12:00:00.000Z`);
  pEnd.setUTCDate(pEnd.getUTCDate() + lenDays - 1);
  let pEndIso = pEnd.toISOString().slice(0, 10);
  const prevCeil = prevTYEndInclusive.toISOString().slice(0, 10);
  if (pEndIso > prevCeil) pEndIso = prevCeil;

  const previous: GiftAidHealthPeriod = { start: prevStart, end: pEndIso };

  return { current, previous };
}

function isMissingDeclPath(r: GiftAidReviewQueueRow): boolean {
  return (
    ['missing_declaration', 'matched_no_declaration'].includes(String(r.gift_aid_status)) ||
    r.declaration_status === 'missing'
  );
}

function hasValidActiveDeclaration(r: GiftAidReviewQueueRow): boolean {
  return Boolean(r.declaration_id) && r.declaration_status === 'active';
}

function hasInvalidDonorAddress(r: GiftAidReviewQueueRow): boolean {
  return r.validation_issues.some(
    (i) => DONOR_ADDRESS_CODES.has(i.code) && i.severity === 'error'
  );
}

/** Row-level metrics for one filtered review queue slice — pure, testable. */
export function computeGiftAidHealthMetricsFromReviewRows(
  reviewRowsFiltered: GiftAidReviewQueueRow[]
): Omit<GiftAidHealthSnapshotMetrics, 'stuckClaimBatchCount' | 'gasdsRemainingRatio01' | 'unreconciledHmrcPaymentsCount' | 'recurringDonorsMissingDeclarationCount'> & {
  period_review_row_count: number;
} {
  let periodEligibleGivingPence = 0;
  let coveragePence = 0;
  let blockedGaPence = 0;
  let donorAddr = 0;
  let dupBlock = 0;
  let rejected = 0;
  let unclaimedCount = 0;
  let unclaimedGa = 0;

  for (const r of reviewRowsFiltered) {
    const ap = Math.max(0, Number(r.amount_pence ?? 0));
    if (!r.gift_aid_eligible) continue;

    periodEligibleGivingPence += ap;

    if (hasValidActiveDeclaration(r)) {
      coveragePence += ap;
    }

    const missingDeclRow = isMissingDeclPath(r);

    if (missingDeclRow && !r.duplicate_blocking) {
      blockedGaPence += giftAidEstimatePence(ap);
    }

    if (hasInvalidDonorAddress(r)) donorAddr += 1;
    if (r.duplicate_blocking) dupBlock += 1;

    const status = String(r.gift_aid_status);
    const bad =
      status === 'rejected' ||
      r.duplicate_blocking ||
      r.eligibility_status === 'blocked' ||
      Array.from(DONOR_ADDRESS_CODES).some((code) =>
        r.validation_issues.some((i) => i.code === code && i.severity === 'error')
      );
    if (bad || r.validation_issues.some((v) => v.severity === 'error')) rejected += 1;

    const canClaimUnclaimed =
      (r.workflow_stage === 'prepare_claim' ||
        (r.gift_aid_status === 'eligible' &&
          !r.gift_aid_claim_id &&
          !r.duplicate_blocking)) &&
      !missingDeclRow;

    if (canClaimUnclaimed) {
      unclaimedCount += 1;
      unclaimedGa += giftAidEstimatePence(ap);
    }
  }

  return {
    periodEligibleGivingPence,
    periodGivingWithEffectiveDeclarationCoveragePence: coveragePence,
    blockedMissingDeclarationGiftAidPence: blockedGaPence,
    donorAddressIssuesInPeriodDonationsCount: donorAddr,
    duplicateBlockingRowsInPeriod: dupBlock,
    rejectedOrExcludedRowsInPeriod: rejected,
    unclaimedEligibleRowsInPeriod: unclaimedCount,
    unclaimedEligibleGiftAidPence: unclaimedGa,
    period_review_row_count: reviewRowsFiltered.length,
  };
}

function gradeFromScore(s: number): GiftAidHealthGrade {
  if (s >= 90) return 'excellent';
  if (s >= 75) return 'good';
  if (s >= 60) return 'needs_attention';
  return 'poor';
}

/** Pure scoring pipeline — unit-test this. */
export function scoreGiftAidHealthFromAggregates(params: {
  metrics: GiftAidHealthSnapshotMetrics;
}): Pick<
  GiftAidHealthScoreResult,
  'score' | 'grade' | 'financial_opportunity_pence' | 'blocked_gift_aid_estimate_pence'
> {
  let score = 100;

  const m = params.metrics;
  const elig = Math.max(1, m.periodEligibleGivingPence);
  const coverageRatio = clamp(m.periodGivingWithEffectiveDeclarationCoveragePence / elig, 0, 1);
  score -= 25 * (1 - coverageRatio);

  const maxGaOnTrackedGiving = elig * GIFT_AID_STANDARD_CLAIM_RATE;
  const blockedRatio = clamp(
    m.blockedMissingDeclarationGiftAidPence / Math.max(1, blockedRatioDenominator(m.blockedMissingDeclarationGiftAidPence, maxGaOnTrackedGiving)),
    0,
    1
  );
  score -= 15 * blockedRatio;

  score -= clamp(m.donorAddressIssuesInPeriodDonationsCount * 1.8, 0, 12);
  score -= clamp(m.duplicateBlockingRowsInPeriod * 2.2, 0, 10);
  score -= clamp(m.unclaimedEligibleRowsInPeriod * 0.85, 0, 12);
  score -= clamp(m.stuckClaimBatchCount * 2.2, 0, 10);
  score -= clamp(m.rejectedOrExcludedRowsInPeriod * 0.5, 0, 12);

  score -= clamp(
    m.gasdsRemainingRatio01 < 0.2 ? (0.2 - m.gasdsRemainingRatio01) * 30 : 0,
    0,
    6
  );

  score -= clamp(m.unreconciledHmrcPaymentsCount * 4, 0, 14);
  score -= clamp(m.recurringDonorsMissingDeclarationCount * 2.2, 0, 10);

  score = clamp(score, 0, 100);
  const rounded = roundScore(score);
  const fin = Math.max(
    0,
    Math.round(m.blockedMissingDeclarationGiftAidPence + m.unclaimedEligibleGiftAidPence)
  );

  return {
    score: rounded,
    grade: gradeFromScore(rounded),
    financial_opportunity_pence: fin,
    blocked_gift_aid_estimate_pence: Math.round(m.blockedMissingDeclarationGiftAidPence),
  };
}

function blockedRatioDenominator(blockedPence: number, givingBasedMaxGa: number): number {
  return blockedPence + Math.max(1, givingBasedMaxGa * 0.5);
}

function buildRecommendedActions(seed: GiftAidHealthSnapshotMetrics): GiftAidHealthRecommendedAction[] {
  const actions: GiftAidHealthRecommendedAction[] = [];
  const push = (a: GiftAidHealthRecommendedAction) => actions.push(a);

  if (
    seed.blockedMissingDeclarationGiftAidPence > 2500 ||
    seed.periodGivingWithEffectiveDeclarationCoveragePence <
      seed.periodEligibleGivingPence * 0.92
  ) {
    push({
      id: 'declarations-queue',
      title: 'Declarations & donors',
      description:
        'Add or reinstate declarations for donors whose giving is awaiting declaration cover.',
      href: '/gift-aid?tab=declarations',
      severity: seed.blockedMissingDeclarationGiftAidPence > 25000 ? 'danger' : 'warning',
    });
  }

  if (seed.donorAddressIssuesInPeriodDonationsCount > 0) {
    push({
      id: 'exceptions-donors',
      title: 'Donor HMRC details',
      description: `${seed.donorAddressIssuesInPeriodDonationsCount} donation row(s) in this period hint at postcode or address gaps.`,
      href: '/gift-aid?tab=exceptions',
      severity: 'warning',
    });
  }

  if (seed.unclaimedEligibleGiftAidPence > 2500 || seed.unclaimedEligibleRowsInPeriod >= 5) {
    push({
      id: 'eligible-claim',
      title: 'Eligible — not claimed',
      description: 'Move queued eligible donations into a claim batch.',
      href: '/gift-aid?tab=eligible-donations',
      severity: 'info',
    });
  }

  if (seed.stuckClaimBatchCount > 0) {
    push({
      id: 'claims-review',
      title: 'Claim batches need review/export',
      description: `${seed.stuckClaimBatchCount} batch(es) Draft / Review / Approved — progress toward HMRC.`,
      href: '/gift-aid?tab=claim-batches',
      severity: 'warning',
    });
  }

  if (seed.duplicateBlockingRowsInPeriod > 0) {
    push({
      id: 'exceptions-dup',
      title: 'Resolve duplicate fingerprints',
      description: `${seed.duplicateBlockingRowsInPeriod} donor/donation duplication blockers.`,
      href: '/gift-aid?tab=exceptions',
      severity: 'warning',
    });
  }

  if (seed.unreconciledHmrcPaymentsCount > 0) {
    push({
      id: 'payments-reconcile',
      title: 'Reconcile HMRC payments',
      description: `${seed.unreconciledHmrcPaymentsCount} submission(s) awaiting bank reconciliation.`,
      href: '/gift-aid/reconciliation',
      severity: 'warning',
    });
  }

  if (seed.recurringDonorsMissingDeclarationCount > 0) {
    push({
      id: 'recurring-decls',
      title: 'Recurring donors missing declarations',
      description: `${seed.recurringDonorsMissingDeclarationCount} active recurring donor pattern(s) without declaration cover.`,
      href: '/gift-aid?tab=donors',
      severity: 'warning',
    });
  }

  if (seed.gasdsRemainingRatio01 < 0.2) {
    push({
      id: 'gasds-cap',
      title: 'GASDS allowance headroom',
      description:
        'Small donation scheme allowance is tightening — rebalance before year-end spikes.',
      href: '/gift-aid?tab=small-donations',
      severity: 'warning',
    });
  }

  return actions
    .slice(0, 8)
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function severityRank(s: GiftAidHealthRecommendedAction['severity']): number {
  if (s === 'danger') return 3;
  if (s === 'warning') return 2;
  return 1;
}

function strengthsAndRisks(
  snapshot: GiftAidHealthSnapshotMetrics,
  score: number,
  periodReviewRowCount: number
): { strengths: string[]; risks: string[] } {
  const strengths: string[] = [];
  const risks: string[] = [];

  const elig = Math.max(1, snapshot.periodEligibleGivingPence);
  const cov = snapshot.periodGivingWithEffectiveDeclarationCoveragePence / elig;

  if (cov >= 0.95) {
    strengths.push(
      `Declaration coverage is strong (~${Math.round(cov * 100)}% of eligible giving in this window).`
    );
  } else {
    risks.push(
      `Gift Aid declaration pathway covers ~${Math.round(cov * 100)}% of eligible giving in this window.`
    );
  }

  if (snapshot.blockedMissingDeclarationGiftAidPence <= 2500 && snapshot.blockedMissingDeclarationGiftAidPence > 0) {
    risks.push(
      `~£${(snapshot.blockedMissingDeclarationGiftAidPence / 100).toFixed(0)} estimated Gift Aid blocked by missing declarations — small but worth clearing.`
    );
  } else if (snapshot.blockedMissingDeclarationGiftAidPence > 2500) {
    risks.push(
      `~£${(snapshot.blockedMissingDeclarationGiftAidPence / 100).toFixed(0)} estimated Gift Aid is blocked behind missing declarations.`
    );
  }

  if (snapshot.unclaimedEligibleRowsInPeriod > 10) {
    risks.push(
      `${snapshot.unclaimedEligibleRowsInPeriod} eligible donation rows waiting to reach an HMRC claim.`
    );
  }

  if (snapshot.duplicateBlockingRowsInPeriod === 0) {
    strengths.push('No duplicate fingerprints are blocking queues right now.');
  } else {
    risks.push(`${snapshot.duplicateBlockingRowsInPeriod} duplication review(s) blocking claims.`);
  }

  if (snapshot.unreconciledHmrcPaymentsCount === 0) {
    strengths.push('Submitted/paid claim payments look reconciled on file.');
  } else {
    risks.push(
      `${snapshot.unreconciledHmrcPaymentsCount} submitted/paid batch payment(s) awaiting reconciliation.`
    );
  }

  if (snapshot.recurringDonorsMissingDeclarationCount === 0 && periodReviewRowCount > 0) {
    strengths.push('Recurring patterns are not flagging missing declarations at the moment.');
  }

  if (score >= 85) strengths.push(`Overall readiness score (${score}) looks trustee-friendly.`);

  return {
    strengths: strengths.slice(0, 6),
    risks: risks.slice(0, 6),
  };
}

/** Claim batches submitted/paid but bank vs HMRC amounts not marked reconciled. */
export async function countUnreconciledHmrcPaymentBatches(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('gift_aid_claim_batches')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .in('status', ['submitted', 'paid', 'exported'])
    .neq('gift_aid_payment_status', 'reconciled');

  if (error) return 0;
  return count ?? 0;
}

export function countStuckClaimBatches(claims: GiftAidClaimRow[]): number {
  return claims.filter((c) => ['draft', 'review', 'approved'].includes(c.status)).length;
}

function mergeSnapshot(
  base: ReturnType<typeof computeGiftAidHealthMetricsFromReviewRows>,
  claims: GiftAidClaimRow[],
  gasds: GiftAidGasdsSummary,
  recurringInsights: GiftAidRecurringControlInsights | null,
  unreconciled: number
): GiftAidHealthSnapshotMetrics {
  const cap = Math.max(1, gasds.annual_cap_pence);
  return {
    periodEligibleGivingPence: base.periodEligibleGivingPence,
    periodGivingWithEffectiveDeclarationCoveragePence:
      base.periodGivingWithEffectiveDeclarationCoveragePence,
    blockedMissingDeclarationGiftAidPence: base.blockedMissingDeclarationGiftAidPence,
    donorAddressIssuesInPeriodDonationsCount: base.donorAddressIssuesInPeriodDonationsCount,
    duplicateBlockingRowsInPeriod: base.duplicateBlockingRowsInPeriod,
    rejectedOrExcludedRowsInPeriod: base.rejectedOrExcludedRowsInPeriod,
    unclaimedEligibleRowsInPeriod: base.unclaimedEligibleRowsInPeriod,
    unclaimedEligibleGiftAidPence: base.unclaimedEligibleGiftAidPence,
    stuckClaimBatchCount: countStuckClaimBatches(claims),
    gasdsRemainingRatio01: clamp(gasds.remaining_eligible_pence / cap, 0, 1),
    unreconciledHmrcPaymentsCount: unreconciled,
    recurringDonorsMissingDeclarationCount:
      recurringInsights?.recurringMissingDeclarationDonorCount ?? 0,
  };
}

function buildMetricsForPeriod(
  reviewRowsAll: GiftAidReviewQueueRow[],
  claims: GiftAidClaimRow[],
  gasds: GiftAidGasdsSummary,
  recurringInsights: GiftAidRecurringControlInsights | null,
  unreconciled: number,
  period: GiftAidHealthPeriod
): { metrics: GiftAidHealthSnapshotMetrics; period_review_row_count: number } {
  const filtered = reviewRowsAll.filter((r) => donationDateWithinPeriod(r.donation_date, period));
  const base = computeGiftAidHealthMetricsFromReviewRows(filtered);
  return {
    metrics: mergeSnapshot(base, claims, gasds, recurringInsights, unreconciled),
    period_review_row_count: base.period_review_row_count,
  };
}

export function computeGiftAidHealthScore(payload: {
  reviewRowsAll: GiftAidReviewQueueRow[];
  claims: GiftAidClaimRow[];
  gasds: GiftAidGasdsSummary;
  recurringInsights: GiftAidRecurringControlInsights | null;
  unreconciledHmrcPaymentsCount: number;
  primaryPeriod: GiftAidHealthPeriod;
  comparisonPeriod: GiftAidHealthPeriod | null;
}): GiftAidHealthScoreResult {
  const current = buildMetricsForPeriod(
    payload.reviewRowsAll,
    payload.claims,
    payload.gasds,
    payload.recurringInsights,
    payload.unreconciledHmrcPaymentsCount,
    payload.primaryPeriod
  );

  const scored = scoreGiftAidHealthFromAggregates({
    metrics: current.metrics,
  });

  const { strengths, risks } = strengthsAndRisks(
    current.metrics,
    scored.score,
    current.period_review_row_count
  );

  let previousScoreOut: number | null = null;
  let delta: number | null = null;

  if (payload.comparisonPeriod) {
    const prevSlice = buildMetricsForPeriod(
      payload.reviewRowsAll,
      payload.claims,
      payload.gasds,
      payload.recurringInsights,
      payload.unreconciledHmrcPaymentsCount,
      payload.comparisonPeriod
    );
    const prevScored = scoreGiftAidHealthFromAggregates({ metrics: prevSlice.metrics });
    previousScoreOut = prevScored.score;
    delta = scored.score - prevScored.score;
  }

  const actions = buildRecommendedActions(current.metrics).slice(0, 5);

  return {
    score: scored.score,
    grade: scored.grade,
    strengths,
    risks,
    recommended_actions: actions,
    financial_opportunity_pence: scored.financial_opportunity_pence,
    blocked_gift_aid_estimate_pence: scored.blocked_gift_aid_estimate_pence,
    period_label: `${payload.primaryPeriod.start} → ${payload.primaryPeriod.end}`,
    primary_period: payload.primaryPeriod,
    comparison_period: payload.comparisonPeriod,
    previous_score: previousScoreOut,
    score_change: delta,
  };
}
