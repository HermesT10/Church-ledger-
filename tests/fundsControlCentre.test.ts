import { describe, it, expect } from 'vitest';
import { buildDonationJournalLines } from '@/lib/donations/validation';
import { suggestIncomeStreamCodeFromBankText } from '@/lib/banking/income-stream-hints';

describe('buildDonationJournalLines — income stream', () => {
  it('tags donations income credit with income_stream_id even without fund_id', () => {
    const lines = buildDonationJournalLines({
      grossAmountPence: 100_00,
      feeAmountPence: 0,
      netAmountPence: 100_00,
      bankAccountId: 'bank-1',
      donationsIncomeAccountId: 'inc-1',
      feeAccountId: null,
      fundId: null,
      incomeStreamId: 'stream-aaa',
      description: 'test',
    });

    const creditIncome = lines.find((l) => l.account_id === 'inc-1');
    expect(creditIncome?.income_stream_id).toBe('stream-aaa');
    expect(creditIncome?.fund_id).toBeNull();
  });

  it('still applies fund_id and stream when fund is set', () => {
    const lines = buildDonationJournalLines({
      grossAmountPence: 50_00,
      feeAmountPence: 0,
      netAmountPence: 50_00,
      bankAccountId: 'bank-1',
      donationsIncomeAccountId: 'inc-1',
      feeAccountId: null,
      fundId: 'fund-x',
      incomeStreamId: 'stream-y',
      description: 'x',
    });

    const creditIncome = lines.find((l) => l.account_id === 'inc-1');
    expect(creditIncome?.fund_id).toBe('fund-x');
    expect(creditIncome?.income_stream_id).toBe('stream-y');
  });
});

describe('suggestIncomeStreamCodeFromBankText', () => {
  it('matches common keywords to stream codes', () => {
    expect(suggestIncomeStreamCodeFromBankText('Monthly tithe payment')).toBe('GIVING');
    expect(suggestIncomeStreamCodeFromBankText('Hall hire invoice')).toBe('LETTINGS');
    expect(suggestIncomeStreamCodeFromBankText('Local authority grant')).toBe('GRANTS');
    expect(suggestIncomeStreamCodeFromBankText('stripe payout ref 99')).toBe('ONLINE');
    expect(suggestIncomeStreamCodeFromBankText('zzz')).toBeNull();
  });
});
