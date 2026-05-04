import { describe, expect, it } from 'vitest';
import {
  buildGivingRegisterSummary,
  type GivingRegisterDonationSourceRow,
  type GivingRegisterDonorSourceRow,
} from '@/lib/donations/giving-register-summary';

const donors: GivingRegisterDonorSourceRow[] = [
  {
    id: 'donor-smith',
    full_name: 'Jane Smith',
    first_name: 'Jane',
    last_name: 'Smith',
    display_name: 'Jane Smith',
    is_active: true,
  },
  {
    id: 'donor-adams',
    full_name: 'Beth Adams',
    first_name: 'Beth',
    last_name: 'Adams',
    display_name: 'Beth Adams',
    is_active: true,
  },
];

const donations: GivingRegisterDonationSourceRow[] = [
  {
    id: 'donation-jan',
    donor_id: 'donor-smith',
    donation_date: '2026-01-10',
    amount_pence: 1000,
    gross_amount_pence: 1000,
    net_amount_pence: 1000,
    fund_id: 'fund-general',
    channel: 'bank_transfer',
    provider_reference: 'JAN-GIVING',
    gift_aid_status: 'eligible',
    gift_aid_claim_batch_id: null,
    bank_transaction_id: 'bank-1',
    donors: { full_name: 'Jane Smith', display_name: 'Jane Smith' },
    funds: { name: 'General' },
  },
  {
    id: 'donation-feb',
    donor_id: 'donor-smith',
    donation_date: '2026-02-04',
    amount_pence: 2500,
    gross_amount_pence: 2500,
    net_amount_pence: 2500,
    fund_id: 'fund-general',
    channel: 'standing_order',
    provider_reference: 'FEB-GIVING',
    gift_aid_status: 'missing_declaration',
    gift_aid_claim_batch_id: null,
    bank_transaction_id: null,
    donors: { full_name: 'Jane Smith', display_name: 'Jane Smith' },
    funds: { name: 'General' },
  },
  {
    id: 'donation-anonymous',
    donor_id: null,
    donation_date: '2026-01-20',
    amount_pence: 500,
    gross_amount_pence: 500,
    net_amount_pence: 500,
    fund_id: 'fund-general',
    channel: 'cash',
    provider_reference: null,
    gift_aid_status: 'not_eligible',
    gift_aid_claim_batch_id: null,
    bank_transaction_id: null,
    donors: null,
    funds: { name: 'General' },
  },
];

describe('donor giving register summary', () => {
  it('sorts donors alphabetically by last name then first name', () => {
    const summary = buildGivingRegisterSummary({
      year: 2026,
      donors,
      donations,
      filters: { showAnonymous: true },
    });

    expect(summary.rows.map((row) => row.donor_name)).toEqual([
      'Beth Adams',
      'Jane Smith',
      'Anonymous giving',
    ]);
  });

  it('calculates monthly and yearly totals', () => {
    const summary = buildGivingRegisterSummary({
      year: 2026,
      donors,
      donations,
      filters: { showAnonymous: true },
    });

    const jane = summary.rows.find((row) => row.donor_id === 'donor-smith');

    expect(jane?.monthly_totals_pence[0]).toBe(1000);
    expect(jane?.monthly_totals_pence[1]).toBe(2500);
    expect(jane?.total_pence).toBe(3500);
    expect(summary.totals_by_month_pence[0]).toBe(1500);
    expect(summary.total_pence).toBe(4000);
  });

  it('includes anonymous giving when enabled', () => {
    const summary = buildGivingRegisterSummary({
      year: 2026,
      donors,
      donations,
      filters: { showAnonymous: true },
    });

    const anonymous = summary.rows.find((row) => row.is_anonymous);

    expect(anonymous?.monthly_totals_pence[0]).toBe(500);
    expect(anonymous?.donations[0].donor_name).toBe('Anonymous giving');
  });

  it('tracks Gift Aid issues on monthly cells', () => {
    const summary = buildGivingRegisterSummary({
      year: 2026,
      donors,
      donations,
      filters: { showAnonymous: true },
    });

    const jane = summary.rows.find((row) => row.donor_id === 'donor-smith');

    expect(jane?.monthly_gift_aid_issue_counts[1]).toBe(1);
    expect(jane?.gift_aid_status_label).toBe('Needs attention');
    expect(summary.gift_aid_issue_count).toBe(1);
  });

  it('hides anonymous giving when disabled', () => {
    const summary = buildGivingRegisterSummary({
      year: 2026,
      donors,
      donations,
      filters: { showAnonymous: false },
    });

    expect(summary.rows.some((row) => row.is_anonymous)).toBe(false);
    expect(summary.total_pence).toBe(3500);
  });
});
