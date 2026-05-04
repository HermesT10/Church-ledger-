import type { BankRuleAction } from './bank-rules-engine';

export type BankRuleTestMatch = {
  bank_transaction_id: string;
  date: string;
  description: string | null;
  reference: string | null;
  amount_pence: number;
  reasons: string[];
};

export type AppliedBankRule = BankRuleAction & {
  description: string | null;
  rule_id: string;
  rule_name: string;
};
