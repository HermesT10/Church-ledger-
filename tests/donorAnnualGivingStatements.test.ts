import { describe, expect, it } from 'vitest';
import { resolveDonorStatementPeriod, ukTaxYearBounds } from '@/lib/giftaid/donor-statement-periods';
import {
  buildDonorStatementRows,
  formatGiftAidStatusForStatement,
} from '@/lib/giftaid/donor-statement-rows';

describe('resolveDonorStatementPeriod', () => {
  it('resolves UK tax year 2024 start as 2024-04-06', () => {
    const r = resolveDonorStatementPeriod({
      period_type: 'uk_tax_year',
      anchor_year: 2024,
      fiscal_year_start_month: 4,
    });
    expect(r.period_start).toBe('2024-04-06');
    expect(r.period_end).toBe('2025-04-05');
  });

  it('resolves calendar year', () => {
    const r = resolveDonorStatementPeriod({
      period_type: 'calendar_year',
      anchor_year: 2024,
      fiscal_year_start_month: 4,
    });
    expect(r.period_start).toBe('2024-01-01');
    expect(r.period_end).toBe('2024-12-31');
  });
});

describe('ukTaxYearBounds', () => {
  it('matches HMRC 6 April convention', () => {
    expect(ukTaxYearBounds(2023)).toEqual({
      start: '2023-04-06',
      end: '2024-04-05',
    });
  });
});

describe('buildDonorStatementRows', () => {
  it('sums donations and Gift Aid reclaimable for eligible rows', () => {
    const { rows, total_donations_pence, total_gift_aid_reclaimable_pence } =
      buildDonorStatementRows([
        {
          id: 'a',
          donation_date: '2024-06-01',
          amount_pence: 10000,
          source: 'manual',
          gift_aid_status: 'eligible',
          gift_aid_eligible: true,
          fund_name: 'General',
        },
        {
          id: 'b',
          donation_date: '2024-07-01',
          amount_pence: 5000,
          source: 'gocardless',
          gift_aid_status: 'eligible',
          gift_aid_eligible: true,
          fund_name: 'Building',
        },
      ]);
    expect(total_donations_pence).toBe(15000);
    expect(total_gift_aid_reclaimable_pence).toBe(3750);
    expect(rows).toHaveLength(2);
  });

  it('excludes non-eligible from Gift Aid total', () => {
    const { total_gift_aid_reclaimable_pence } = buildDonorStatementRows([
      {
        id: 'a',
        donation_date: '2024-06-01',
        amount_pence: 10000,
        source: 'manual',
        gift_aid_status: 'ineligible',
        gift_aid_eligible: false,
        fund_name: null,
      },
    ]);
    expect(total_gift_aid_reclaimable_pence).toBe(0);
  });
});

describe('formatGiftAidStatusForStatement', () => {
  it('shows paid wording', () => {
    expect(formatGiftAidStatusForStatement('paid', true)).toContain('paid');
  });
});

describe('renderDonorStatementPdf', () => {
  it('produces a non-empty PDF buffer', async () => {
    const { renderDonorStatementPdf } = await import(
      '@/lib/giftaid/donor-statement-pdf'
    );
    const buf = await renderDonorStatementPdf({
      donorName: 'Test Donor',
      donorAddressLines: ['1 Test St', 'AB1 2CD'],
      periodLabel: 'Test period',
      periodStart: '2024-01-01',
      periodEnd: '2024-12-31',
      charity: {
        displayName: 'Test Charity',
        charityNumber: '123456',
        lines: ['Line 1'],
        contactEmail: 'office@example.org',
      },
      rows: [
        {
          donation_date: '2024-06-01',
          amount_pence: 5000,
          fund_name: 'General',
          source_label: 'Manual',
          gift_aid_label: 'Eligible (not yet claimed)',
          gift_aid_reclaimable_pence: 1250,
        },
      ],
      totalDonationsPence: 5000,
      totalGiftAidPence: 1250,
    });
    expect(buf.length).toBeGreaterThan(200);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
