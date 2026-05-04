export type BankLedgerLinkCode =
  | 'BANK_ACCOUNT_LEDGER_LINKED'
  | 'BANK_ACCOUNT_LEDGER_LINK_MISSING'
  | 'BANK_ACCOUNT_LEDGER_LINK_INVALID';

export type BankLedgerLinkStatus = 'linked' | 'missing' | 'invalid';

export interface BankLedgerAccountSummary {
  id: string;
  code: string | null;
  name: string;
  type: string;
  subtype: string | null;
}

export interface BankLedgerLinkValidation {
  status: BankLedgerLinkStatus;
  code: BankLedgerLinkCode;
  message: string;
  bankAccountId: string;
  linkedAccountId: string | null;
  account: BankLedgerAccountSummary | null;
}
