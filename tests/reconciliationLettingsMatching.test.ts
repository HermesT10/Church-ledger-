import { describe, expect, it } from 'vitest';
import {
  compareLettingsSuggestions,
  lettingsChargeToSuggestion,
  type BankTransactionForMatching,
  type LettingsChargeForRanking,
} from '../src/lib/banking/reconciliation-matching';

const bankLine: BankTransactionForMatching = {
  id: 'b1',
  organisation_id: 'o1',
  bank_account_id: 'ba1',
  txn_date: '2026-05-15',
  description: 'ACME hall hire',
  reference: 'REF1',
  amount_pence: 15000,
  balance_pence: null,
};

const chargeBase: LettingsChargeForRanking = {
  id: 'c1',
  period_year: 2026,
  period_month: 5,
  description: 'Monthly',
  expected_amount_pence: 15000,
  outstanding_amount_pence: 15000,
  due_date: '2026-05-01',
  status: 'expected',
  hirer: { name: 'ACME', default_room_name: 'Hall' },
};

describe('lettingsChargeToSuggestion', () => {
  it('produces a lettings_charge suggestion with reasonable confidence for matching bank line', () => {
    const s = lettingsChargeToSuggestion(bankLine, chargeBase, 5);
    expect(s.source_type).toBe('lettings_charge');
    expect(s.source_id).toBe('c1');
    expect(s.confidence_score).toBeGreaterThanOrEqual(0.35);
    expect(s.match_reason.join(' ')).toMatch(/outstanding/i);
  });

  it('orders better matches first via compareLettingsSuggestions', () => {
    const good = lettingsChargeToSuggestion(bankLine, chargeBase, 5);
    const otherCharge: LettingsChargeForRanking = {
      ...chargeBase,
      id: 'c2',
      period_month: 2,
      hirer: { name: 'Unrelated Party Ltd', default_room_name: null },
      outstanding_amount_pence: 15000,
    };
    const weak = lettingsChargeToSuggestion(bankLine, otherCharge, 5);
    expect(compareLettingsSuggestions(good, weak, bankLine)).toBeLessThan(0);
  });
});
