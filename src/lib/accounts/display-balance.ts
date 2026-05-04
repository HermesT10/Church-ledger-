import { formatMoney } from '@/lib/money/format-money';
import type { MoneyTone } from '@/lib/money/types';
import type { AccountType } from './types';

export type AccountBalanceDisplay = {
  rawAmountPence: number;
  displayAmountPence: number;
  tone: MoneyTone;
  label: string;
  accountingLabel: string;
  tooltip: string;
  isAbnormalBalance: boolean;
};

function accountingBalanceLabel(rawAmountPence: number): string {
  if (rawAmountPence === 0) return `${formatMoney(0)} zero balance`;
  return `${formatMoney(rawAmountPence)} ${rawAmountPence < 0 ? 'credit' : 'debit'} balance`;
}

function signedTone(amountPence: number): MoneyTone {
  if (amountPence > 0) return 'positive';
  if (amountPence < 0) return 'negative';
  return 'neutral';
}

export function accountBalanceColumnLabel(accountType: AccountType): string {
  if (accountType === 'income') return 'Income received';
  if (accountType === 'expense') return 'Spent';
  if (accountType === 'liability') return 'Amount owed';
  if (accountType === 'fund_balance' || accountType === 'equity') return 'Fund balance';
  return 'Balance';
}

export function getDisplayAccountBalance(
  rawAmountPence: number,
  accountType: AccountType,
): AccountBalanceDisplay {
  const accountingLabel = accountingBalanceLabel(rawAmountPence);

  if (accountType === 'income') {
    const isDebitBalance = rawAmountPence > 0;
    return {
      rawAmountPence,
      displayAmountPence: Math.abs(rawAmountPence),
      tone: isDebitBalance ? 'warning' : rawAmountPence === 0 ? 'neutral' : 'positive',
      label: 'Income received',
      accountingLabel,
      tooltip: isDebitBalance
        ? `Debit balance on income account. Accounting value: ${accountingLabel}. This may indicate corrections or reversals.`
        : `Credit balance shown as positive income received. Accounting value: ${accountingLabel}.`,
      isAbnormalBalance: isDebitBalance,
    };
  }

  if (accountType === 'expense') {
    const isCreditBalance = rawAmountPence < 0;
    return {
      rawAmountPence,
      displayAmountPence: Math.abs(rawAmountPence),
      tone: isCreditBalance ? 'warning' : rawAmountPence === 0 ? 'neutral' : 'negative',
      label: 'Spent',
      accountingLabel,
      tooltip: isCreditBalance
        ? `Credit balance on expense account. Accounting value: ${accountingLabel}. This may indicate a refund or reversal.`
        : `Debit balance shown as spending. Accounting value: ${accountingLabel}.`,
      isAbnormalBalance: isCreditBalance,
    };
  }

  if (accountType === 'liability') {
    const isDebitBalance = rawAmountPence > 0;
    return {
      rawAmountPence,
      displayAmountPence: Math.abs(rawAmountPence),
      tone: isDebitBalance ? 'warning' : rawAmountPence === 0 ? 'neutral' : 'negative',
      label: 'Amount owed',
      accountingLabel,
      tooltip: isDebitBalance
        ? `Debit balance on liability account. Accounting value: ${accountingLabel}. This may indicate an overpayment or correction.`
        : `Credit balance shown as amount owed. Accounting value: ${accountingLabel}.`,
      isAbnormalBalance: isDebitBalance,
    };
  }

  if (accountType === 'fund_balance' || accountType === 'equity') {
    return {
      rawAmountPence,
      displayAmountPence: rawAmountPence,
      tone: signedTone(rawAmountPence),
      label: 'Fund balance',
      accountingLabel,
      tooltip: `Fund balance shown using the current accounting convention. Accounting value: ${accountingLabel}.`,
      isAbnormalBalance: false,
    };
  }

  return {
    rawAmountPence,
    displayAmountPence: rawAmountPence,
    tone: signedTone(rawAmountPence),
    label: 'Balance',
    accountingLabel,
    tooltip: `Accounting value: ${accountingLabel}.`,
    isAbnormalBalance: false,
  };
}
