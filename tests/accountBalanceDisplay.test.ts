import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { accountBalanceColumnLabel, getDisplayAccountBalance } from '@/lib/accounts/display-balance';

const accountsPage = readFileSync(
  new URL('../src/app/(app)/accounts/page.tsx', import.meta.url),
  'utf8',
);

const accountActivityClient = readFileSync(
  new URL('../src/app/(app)/accounts/[id]/account-detail-activity-client.tsx', import.meta.url),
  'utf8',
);

const trialBalanceClient = readFileSync(
  new URL('../src/app/(app)/reports/trial-balance/trial-balance-client.tsx', import.meta.url),
  'utf8',
);

const accountBalances = readFileSync(
  new URL('../src/lib/accounts/balances.ts', import.meta.url),
  'utf8',
);

describe('account-aware display balances', () => {
  it('shows normal income credit balances as positive income received', () => {
    const display = getDisplayAccountBalance(-1_062_000, 'income');

    expect(display.displayAmountPence).toBe(1_062_000);
    expect(display.tone).toBe('positive');
    expect(display.label).toBe('Income received');
    expect(display.isAbnormalBalance).toBe(false);
    expect(display.tooltip).toContain('Credit balance shown as positive income received');
  });

  it('warns when an income account has a debit balance', () => {
    const display = getDisplayAccountBalance(15_000, 'income');

    expect(display.displayAmountPence).toBe(15_000);
    expect(display.tone).toBe('warning');
    expect(display.isAbnormalBalance).toBe(true);
    expect(display.tooltip).toContain('Debit balance on income account');
  });

  it('shows normal expense debit balances as red spending', () => {
    const display = getDisplayAccountBalance(740_000, 'expense');

    expect(display.displayAmountPence).toBe(740_000);
    expect(display.tone).toBe('negative');
    expect(display.label).toBe('Spent');
    expect(display.isAbnormalBalance).toBe(false);
  });

  it('warns when an expense account has a credit balance', () => {
    const display = getDisplayAccountBalance(-25_000, 'expense');

    expect(display.displayAmountPence).toBe(25_000);
    expect(display.tone).toBe('warning');
    expect(display.isAbnormalBalance).toBe(true);
    expect(display.tooltip).toContain('Credit balance on expense account');
  });

  it('keeps asset balances signed and marks negative assets red', () => {
    expect(getDisplayAccountBalance(125_000, 'asset')).toMatchObject({
      displayAmountPence: 125_000,
      tone: 'positive',
      label: 'Balance',
    });
    expect(getDisplayAccountBalance(-5_000, 'asset')).toMatchObject({
      displayAmountPence: -5_000,
      tone: 'negative',
      label: 'Balance',
    });
  });

  it('shows normal liability credit balances as amount owed', () => {
    const display = getDisplayAccountBalance(-88_000, 'liability');

    expect(display.displayAmountPence).toBe(88_000);
    expect(display.tone).toBe('negative');
    expect(display.label).toBe('Amount owed');
    expect(display.tooltip).toContain('Credit balance shown as amount owed');
  });

  it('uses section-aware account balance labels', () => {
    expect(accountBalanceColumnLabel('asset')).toBe('Balance');
    expect(accountBalanceColumnLabel('income')).toBe('Income received');
    expect(accountBalanceColumnLabel('expense')).toBe('Spent');
    expect(accountBalanceColumnLabel('liability')).toBe('Amount owed');
    expect(accountBalanceColumnLabel('fund_balance')).toBe('Fund balance');
  });
});

describe('account balance display integration points', () => {
  it('keeps raw ledger aggregation as debit minus credit', () => {
    expect(accountBalances).toContain('debit_pence ?? 0) - Number(line.credit_pence ?? 0)');
  });

  it('updates the Accounts page to use account-aware labels and helper text', () => {
    expect(accountsPage).toContain('accountBalanceColumnLabel(type)');
    expect(accountsPage).toContain('getDisplayAccountBalance(account.balance_pence, account.type)');
    expect(accountsPage).toContain('Income accounts are shown as positive income received');
    expect(accountsPage).toContain('Amount owed');
    expect(accountsPage).toContain('Spent this year');
  });

  it('keeps technical account activity debit, credit, and net columns', () => {
    expect(accountActivityClient).toContain('<TableHead className="text-right">Debit</TableHead>');
    expect(accountActivityClient).toContain('<TableHead className="text-right">Credit</TableHead>');
    expect(accountActivityClient).toContain('<TableHead className="text-right">Net</TableHead>');
    expect(accountActivityClient).toContain('semantic="ledger_net"');
  });

  it('keeps Trial Balance technical debit and credit presentation', () => {
    expect(trialBalanceClient).toContain('All accounts with debit and credit totals.');
    expect(trialBalanceClient).toContain('<th className="py-2 pr-4 text-right">Debit</th>');
    expect(trialBalanceClient).toContain('<th className="py-2 text-right">Credit</th>');
    expect(trialBalanceClient).toContain('row.netBalancePence > 0');
    expect(trialBalanceClient).toContain('row.netBalancePence < 0');
  });
});
