import { describe, expect, it } from 'vitest';
import { formatMoney } from '@/lib/money/format-money';
import { getMoneyTone, moneyToneClass } from '@/lib/money/money-tone';
import type { AccountActivityRow } from '@/lib/accounts/balances';
import { buildAccountTransactionSummaryRows, journalKindLabel } from '@/lib/accounts/transaction-summary';

describe('formatMoney', () => {
  it('formats GBP with grouping and two decimals', () => {
    expect(formatMoney(1_234_56)).toBe('£1,234.56');
    expect(formatMoney(-99)).toBe('-£0.99');
  });

  it('returns em dash for nullish', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
  });

  it('supports optional plus for positive', () => {
    expect(formatMoney(100, { showPlusForPositive: true })).toBe('+£1.00');
  });
});

describe('getMoneyTone', () => {
  it('maps sign by default', () => {
    expect(getMoneyTone(50)).toBe('positive');
    expect(getMoneyTone(-50)).toBe('negative');
    expect(getMoneyTone(0)).toBe('neutral');
  });

  it('income semantic is always positive tone when non-zero', () => {
    expect(getMoneyTone(-500, { semantic: 'income' })).toBe('positive');
    expect(getMoneyTone(500, { semantic: 'income' })).toBe('positive');
  });

  it('expense semantic is always negative tone when non-zero', () => {
    expect(getMoneyTone(500, { semantic: 'expense' })).toBe('negative');
    expect(getMoneyTone(-500, { semantic: 'expense' })).toBe('negative');
  });

  it('transfer direction uses transfer tone', () => {
    expect(getMoneyTone(100, { direction: 'transfer' })).toBe('transfer');
  });

  it('moneyToneClass covers tones', () => {
    expect(moneyToneClass('positive')).toContain('success');
    expect(moneyToneClass('negative')).toContain('danger');
    expect(moneyToneClass('transfer')).toContain('info');
  });
});

function row(partial: Partial<AccountActivityRow> & Pick<AccountActivityRow, 'journal_line_id' | 'journal_id'>): AccountActivityRow {
  return {
    journal_date: '2026-01-15',
    reference: null,
    memo: null,
    status: 'posted',
    source_type: 'manual',
    source_id: null,
    reversal_of: null,
    reversal_of_journal_id: null,
    reversed_by: null,
    fund_id: 'f1',
    fund_name: 'General',
    description: null,
    debit_pence: 0,
    credit_pence: 0,
    net_pence: 0,
    ...partial,
  };
}

describe('journalKindLabel', () => {
  it('detects reversal', () => {
    expect(journalKindLabel({ source_type: 'donation', reversal_of: 'j-prev' })).toBe('Reversal');
  });

  it('maps common source types', () => {
    expect(journalKindLabel({ source_type: 'donation', reversal_of: null })).toBe('Donation');
    expect(journalKindLabel({ source_type: 'bank', reversal_of: null })).toBe('Bank reconciliation');
    expect(journalKindLabel({ source_type: 'lettings_payment', reversal_of: null })).toBe('Letting payment');
  });
});

describe('buildAccountTransactionSummaryRows', () => {
  it('groups multiple lines for the same journal', () => {
    const activity: AccountActivityRow[] = [
      row({
        journal_line_id: 'l1',
        journal_id: 'j1',
        debit_pence: 100,
        credit_pence: 0,
        net_pence: 100,
        fund_name: 'General',
      }),
      row({
        journal_line_id: 'l2',
        journal_id: 'j1',
        debit_pence: 50,
        credit_pence: 0,
        net_pence: 50,
        fund_name: 'Building',
      }),
    ];
    const out = buildAccountTransactionSummaryRows(activity, 'expense');
    expect(out).toHaveLength(1);
    expect(out[0].debit_pence).toBe(150);
    expect(out[0].line_count).toBe(2);
    expect(out[0].fund_labels).toEqual(['Building', 'General']);
  });

  it('flags missing fund on income accounts', () => {
    const activity: AccountActivityRow[] = [
      row({
        journal_line_id: 'l1',
        journal_id: 'j1',
        fund_id: null,
        fund_name: null,
        source_type: 'donation',
        credit_pence: 200,
        debit_pence: 0,
        net_pence: -200,
      }),
    ];
    const out = buildAccountTransactionSummaryRows(activity, 'income');
    expect(out[0].warnings.some((w) => w.includes('fund'))).toBe(true);
  });
});
