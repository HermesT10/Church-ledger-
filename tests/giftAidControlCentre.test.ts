import { describe, expect, it } from 'vitest';
import {
  buildGiftAidControlCentreData,
  plainGiftAidStatusLabel,
} from '@/lib/giftaid/control-centre';
import { computeGiftAidHealthScore } from '@/lib/giftaid/health-score';
import type {
  GiftAidClaimRow,
  GiftAidDonorRow,
  GiftAidReviewQueueRow,
} from '@/lib/giftaid/types';

const donor: GiftAidDonorRow = {
  id: 'donor-1',
  full_name: 'Jane Smith',
  reference_code: null,
  donor_reference_code: null,
  title: 'Mrs',
  first_name: 'Jane',
  last_name: 'Smith',
  display_name: 'Jane Smith',
  house_name_or_number: '1',
  email: null,
  phone: null,
  address: '1 High Street',
  postcode: 'AB1 2CD',
  notes: null,
  is_active: true,
  declaration_count: 1,
  active_declaration_count: 1,
  donation_count: 1,
  validated_donation_count: 1,
  unlinked_donation_count: 0,
  latest_donation_date: '2026-04-10',
};

function reviewRow(overrides: Partial<GiftAidReviewQueueRow>): GiftAidReviewQueueRow {
  return {
    donation_id: 'donation-1',
    donation_date: '2026-04-10',
    amount_pence: 10000,
    source: 'bank',
    bank_reference: 'BANK-1',
    fund_name: 'General',
    donor_id: 'donor-1',
    donor_name: 'Jane Smith',
    donor_email: null,
    donor_address: '1 High Street',
    donor_postcode: 'AB1 2CD',
    suggested_match_id: null,
    suggested_donor_id: null,
    suggested_donor_name: null,
    suggested_donor_email: null,
    suggested_match_method: null,
    suggested_match_review_status: null,
    confidence_score: null,
    declaration_id: 'decl-1',
    declaration_date: '2026-04-01',
    declaration_active: true,
    declaration_status: 'active',
    declaration_type: 'enduring',
    declaration_start_date: '2026-04-01',
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
    queue_reason: 'Can claim',
    validation_reason: null,
    ...overrides,
  };
}

const claim: GiftAidClaimRow = {
  id: 'claim-1',
  claim_start: '2026-04-06',
  claim_end: '2026-04-30',
  created_at: '2026-04-20T00:00:00.000Z',
  submitted_at: '2026-04-21T00:00:00.000Z',
  paid_at: null,
  reference: 'GA-001',
  status: 'submitted',
  donation_count: 1,
  eligible_amount_pence: 10000,
  claimable_total_pence: 2500,
  journal_id: null,
  latest_export_id: 'export-1',
  latest_export_file_name: 'schedule.xlsx',
  latest_exported_at: '2026-04-20T00:00:00.000Z',
};

describe('Gift Aid control centre helpers', () => {
  it('maps Gift Aid statuses to plain language', () => {
    expect(plainGiftAidStatusLabel('eligible')).toBe('Can claim');
    expect(plainGiftAidStatusLabel('missing_declaration')).toBe('Missing declaration');
    expect(plainGiftAidStatusLabel('exported')).toBe('Already claimed');
    expect(plainGiftAidStatusLabel('approved')).toBe('Ready for HMRC');
    expect(plainGiftAidStatusLabel('invalid_donor_details')).toBe('Needs review');
  });

  it('builds overview metrics and alerts for the control centre', () => {
    const reviewRows = [
      reviewRow({ donation_id: 'can-claim' }),
      reviewRow({
        donation_id: 'missing-declaration',
        declaration_id: null,
        declaration_status: 'missing',
        gift_aid_status: 'missing_declaration',
        workflow_stage: 'validate',
      }),
      reviewRow({
        donation_id: 'invalid-donor',
        gift_aid_status: 'invalid_donor_details',
        workflow_stage: 'validate',
        validation_issues: [
          {
            code: 'missing_postcode',
            field: 'donor.postcode',
            message: 'Postcode is required.',
            severity: 'error',
          },
        ],
      }),
    ];

    const health_score = computeGiftAidHealthScore({
      reviewRowsAll: reviewRows,
      claims: [claim],
      gasds: {
        tax_year_label: '2026/27',
        claimed_eligible_pence: 0,
        annual_cap_pence: 800_000,
        remaining_eligible_pence: 800_000,
        ready_batch_count: 0,
      },
      recurringInsights: null,
      unreconciledHmrcPaymentsCount: 0,
      primaryPeriod: { start: '2026-04-06', end: '2026-04-28' },
      comparisonPeriod: null,
    });

    const data = buildGiftAidControlCentreData({
      health_score,
      gasds: {
        tax_year_label: '2026/27',
        claimed_eligible_pence: 0,
        annual_cap_pence: 800_000,
        remaining_eligible_pence: 800_000,
        ready_batch_count: 0,
      },
      gasds_batches: [],
      donors: [donor],
      declarations: [],
      reviewRows,
      claims: [claim],
      now: new Date('2026-04-28T00:00:00.000Z'),
    });

    expect(data.metrics.find((metric) => metric.id === 'eligible-unclaimed')?.value).toBe(1);
    expect(data.metrics.find((metric) => metric.id === 'estimated-reclaim')?.value_pence).toBe(2500);
    expect(data.metrics.find((metric) => metric.id === 'missing-declarations')?.value).toBe(1);
    expect(data.metrics.find((metric) => metric.id === 'invalid-donor-records')?.value).toBe(1);
    expect(data.metrics.find((metric) => metric.id === 'submitted-this-tax-year')?.value).toBe(1);
    expect(data.alerts.map((alert) => alert.id)).toEqual(
      expect.arrayContaining([
        'donors-missing-declarations',
        'eligible-not-claimed',
        'schedule-exports-ready',
      ])
    );
  });
});
