export type MoneyTone = 'positive' | 'negative' | 'neutral' | 'transfer' | 'warning';

export type MoneyDirection = 'income' | 'expense' | 'money_in' | 'money_out' | 'neutral' | 'transfer';

export type MoneySemantic =
  | 'positive_good'
  | 'negative_bad'
  | 'debit'
  | 'credit'
  | 'asset'
  | 'liability'
  | 'income'
  | 'expense'
  | 'ledger_net';

export type MoneySize = 'xs' | 'sm' | 'md' | 'lg';
