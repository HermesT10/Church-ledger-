import { describe, expect, it } from 'vitest';
import {
  computeGiftAidHealthMetricsFromReviewRows,
  computeGiftAidHealthScore,
  donationDateWithinPeriod,
  scoreGiftAidHealthFromAggregates,
} from '@/lib/giftaid/health-score';
import type { GiftAidHealthSnapshotMetrics } from '@/lib/giftaid/health-score';
import type { GiftAidClaimRow, GiftAidReviewQueueRow } from '@/lib/giftaid/types';

function reviewRow(overrides: Partial<GiftAidReviewQueueRow>): GiftAidReviewQueueRow {
  return {
    donation_id: 'd1',
    donation_date: '2026-08-01',
    amount_pence: 400_00,
    source: 'bank',
    bank_reference: '',
    fund_name: 'General',
    donor_id: 'donor-1',
    donor_name: 'A',
    donor_email: null,
    donor_address: '',
    donor_postcode: 'AB1 2CD',
    suggested_match_id: null,
    suggested_donor_id: null,
    suggested_donor_name: null,
    suggested_donor_email: null,
    suggested_match_method: null,
    suggested_match_review_status: null,
    confidence_score: null,
    declaration_id: 'decl',
    declaration_date: '2026-01-01',
    declaration_active: true,
    declaration_status: 'active',
    declaration_type: 'enduring',
    declaration_start_date: '2026-01-01',
    declaration_end_date: null,
    declaration_covers_past_donations: false,
    declaration_attachment_url: null,
    declaration_notes: null,
    declaration_hmrc_version: null,
    declaration_template_version: null,
    gift_aid_eligible: true,
    gift_aid_claim_id: null,
    gift_aid_status: 'eligible',
    eligibility_status: 'eligible',
    validation_issues: [],
    duplicate_fingerprint: null,
    duplicate_warning: null,
    duplicate_blocking: false,
    duplicate_related_donation_ids: [],
    workflow_stage: 'prepare_claim',
    queue_reason: '',
    validation_reason: null,
    ...overrides,
  };
}

const claimIdle: GiftAidClaimRow = {
  id: 'claim-1',
  claim_start: '2026-04-06',
  claim_end: '2026-07-31',
  created_at: '2026-05-01T00:00:00Z',
  submitted_at: '2026-06-01T00:00:00Z',
  paid_at: null,
  reference: 'R1',
  status: 'exported',
  donation_count: 1,
  eligible_amount_pence: 400_00,
  claimable_total_pence: 100_00,
  journal_id: null,
  latest_export_id: null,
  latest_export_file_name: null,
  latest_exported_at: null,
};

describe('Gift Aid health score', () => {
  it('includes donation dates inclusively inside the period window', () => {
    const p = { start: '2026-06-01', end: '2026-06-30' };
    expect(donationDateWithinPeriod('2026-05-31', p)).toBe(false);
    expect(donationDateWithinPeriod('2026-06-01', p)).toBe(true);
    expect(donationDateWithinPeriod('2026-06-30', p)).toBe(true);
  });

  it('estimates blocked Gift Aid from eligible rows on the missing-declaration pathway', () => {
    const rows = [
      reviewRow({
        donation_id: 'a',
        amount_pence: 100_00,
        declaration_id: null,
        declaration_status: 'missing',
        gift_aid_status: 'missing_declaration',
        workflow_stage: 'validate',
      }),
    ];
    const m = computeGiftAidHealthMetricsFromReviewRows(rows);
    /** 100 GBP * 25% = 25 GBP */
    expect(m.blockedMissingDeclarationGiftAidPence).toBe(25_00);
    expect(m.periodEligibleGivingPence).toBe(100_00);
    expect(m.periodGivingWithEffectiveDeclarationCoveragePence).toBe(0);
  });

  it('scores duplicate-blocking rows without double-counting missing-declaration blocked £', () => {
    const rows = [
      reviewRow({
        donation_id: 'dup',
        amount_pence: 200_00,
        duplicate_blocking: true,
        gift_aid_status: 'missing_declaration',
        declaration_status: 'missing',
        declaration_id: null,
      }),
    ];
    const m = computeGiftAidHealthMetricsFromReviewRows(rows);
    expect(m.duplicateBlockingRowsInPeriod).toBe(1);
    expect(m.blockedMissingDeclarationGiftAidPence).toBe(0);
  });

  it('surfaced recurring-missing-declaration risk and emits an action with donor tab href', () => {
    const result = computeGiftAidHealthScore({
      reviewRowsAll: [],
      claims: [{ ...claimIdle, status: 'draft' }],
      gasds: {
        tax_year_label: '2026/27',
        claimed_eligible_pence: 0,
        annual_cap_pence: 800_000,
        remaining_eligible_pence: 400_000,
        ready_batch_count: 0,
      },
      recurringInsights: {
        activeRecurringDonorCount: 2,
        missedExpectedCount: 0,
        projectedMonthlyGiftAidPence: 0,
        recurringMissingDeclarationDonorCount: 3,
        recurringEligibleUnclaimedDonationCount: 0,
      },
      unreconciledHmrcPaymentsCount: 0,
      primaryPeriod: { start: '2026-06-01', end: '2026-06-30' },
      comparisonPeriod: { start: '2025-06-01', end: '2025-06-30' },
    });
    expect(result.recommended_actions.some((a) => a.id === 'recurring-decls')).toBe(true);
    const act = result.recommended_actions.find((a) => a.id === 'recurring-decls');
    expect(act?.href).toBe('/gift-aid?tab=donors');
  });

  it('links HMRC reconciliation action when unreconciled batches exist', () => {
    const result = computeGiftAidHealthScore({
      reviewRowsAll: [],
      claims: [],
      gasds: {
        tax_year_label: '2026/27',
        claimed_eligible_pence: 0,
        annual_cap_pence: 800_000,
        remaining_eligible_pence: 800_000,
        ready_batch_count: 0,
      },
      recurringInsights: null,
      unreconciledHmrcPaymentsCount: 2,
      primaryPeriod: { start: '2026-06-01', end: '2026-06-30' },
      comparisonPeriod: null,
    });
    const act = result.recommended_actions.find((a) => a.id === 'payments-reconcile');
    expect(act?.href).toBe('/gift-aid/reconciliation');
  });

  it('computes financial opportunity as blocked + unclaimed Gift Aid estimates', () => {
    const rows = [
      reviewRow({
        donation_id: 'block',
        amount_pence: 100_00,
        gift_aid_status: 'missing_declaration',
        declaration_id: null,
        declaration_status: 'missing',
        workflow_stage: 'validate',
      }),
      reviewRow({
        donation_id: 'unclaim',
        amount_pence: 200_00,
        declaration_id: 'decl',
        declaration_status: 'active',
        gift_aid_status: 'eligible',
        workflow_stage: 'prepare_claim',
      }),
    ];
    const computed = computeGiftAidHealthMetricsFromReviewRows(rows);
    const { period_review_row_count: _pr, ...rest } = computed;
    const metrics: GiftAidHealthSnapshotMetrics = {
      ...rest,
      stuckClaimBatchCount: 0,
      gasdsRemainingRatio01: 1,
      unreconciledHmrcPaymentsCount: 0,
      recurringDonorsMissingDeclarationCount: 0,
    };
    const scored = scoreGiftAidHealthFromAggregates({ metrics });
    expect(scored.financial_opportunity_pence).toBe(25_00 + 50_00);
    expect(scored.blocked_gift_aid_estimate_pence).toBe(25_00);
  });
});
