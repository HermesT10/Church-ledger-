import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  detectRecurringDonorPatterns,
  isMissedRecurringDonation,
  type DonationForRecurringDetection,
} from '@/lib/giftaid/recurring-donor-detection';
import { scoreDonorMatchesForBankTransaction } from '@/lib/giftaid/bank-donor-matching';

function row(
  id: string,
  donor: string,
  date: string,
  amount: number,
  ref: string
): DonationForRecurringDetection {
  return {
    id,
    donor_id: donor,
    donation_date: date,
    amount_pence: amount,
    provider_reference: ref,
    bank_reference: ref,
  };
}

describe('recurring donor detection', () => {
  it('detects stable monthly patterns with three similar gifts', () => {
    const donations: DonationForRecurringDetection[] = [
      row('1', 'd1', '2025-01-10', 5000, 'STANDING ORDER J SMITH'),
      row('2', 'd1', '2025-02-09', 5020, 'STANDING ORDER J SMITH'),
      row('3', 'd1', '2025-03-11', 4990, 'STANDING ORDER J SMITH'),
    ];
    const patterns = detectRecurringDonorPatterns(donations);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0]?.pattern_type).toBe('monthly');
    expect(patterns[0]?.expected_amount_pence).toBeGreaterThanOrEqual(4980);
    expect(patterns[0]?.occurrence_count ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('respects amount tolerance so small drifts still group', () => {
    const donations: DonationForRecurringDetection[] = [
      row('1', 'd1', '2025-01-10', 5000, 'REFX'),
      row('2', 'd1', '2025-02-10', 5200, 'REFX'),
      row('3', 'd1', '2025-03-11', 5100, 'REFX'),
    ];
    const patterns = detectRecurringDonorPatterns(donations);
    expect(patterns[0]?.pattern_type).toBe('monthly');
  });

  it('avoids declaring a monthly pattern from two random gifts', () => {
    const donations: DonationForRecurringDetection[] = [
      row('1', 'd1', '2025-01-10', 5000, 'REFX'),
      row('2', 'd1', '2025-07-20', 4900, 'REFX'),
    ];
    const patterns = detectRecurringDonorPatterns(donations);
    expect(patterns.length).toBe(0);
  });

  it('flags missed expectations after grace when no follow-up donation arrives', () => {
    const missed = isMissedRecurringDonation({
      pattern: {
        donor_id: 'd1',
        pattern_type: 'monthly',
        expected_amount_pence: 5000,
        amount_tolerance_pence: 200,
        normalized_bank_reference: 'refx',
        status: 'active',
        grace_days: 7,
        next_expected_date: '2025-04-10',
        last_occurrence_at: '2025-03-10T12:00:00.000Z',
      },
      postedDonations: [],
      todayIso: '2025-05-01',
    });
    expect(missed).toBe(true);
  });

  it('migration creates recurring donor pattern table', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase/migrations/00084_recurring_donor_patterns.sql'),
      'utf8'
    );
    expect(migration).toContain('recurring_donor_patterns');
    expect(migration).toContain('workspace_id uuid not null');
    expect(migration).toContain("pattern_type in ('monthly'");
  });
});

describe('bank donor matching with recurring hints', () => {
  it('surfaces recurring pattern alignment as a match reason', () => {
    const scored = scoreDonorMatchesForBankTransaction({
      bankTransaction: {
        id: 'b1',
        workspace_id: 'org',
        reference: 'STANDING ORDER J SMITH',
        description: null,
        amount_pence: 5000,
      },
      donors: [
        {
          id: 'd1',
          full_name: 'Jane Smith',
          first_name: 'Jane',
          last_name: 'Smith',
          display_name: 'Jane Smith',
          reference_code: null,
          donor_reference_code: null,
          is_active: true,
        },
      ],
      aliases: [],
      recurringPatterns: [
        {
          donor_id: 'd1',
          expected_amount_pence: 5000,
          amount_tolerance_pence: 200,
          normalized_bank_reference: 'standingorderjsmith',
        },
      ],
    });
    expect(scored.candidates[0]?.donor_id).toBe('d1');
    expect(
      scored.candidates[0]?.reasons.some((reason) => reason.includes('recurring'))
    ).toBe(true);
  });
});
