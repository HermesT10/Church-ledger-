/* Cash Management types (shared, not a server action file) */

/* ------------------------------------------------------------------ */
/*  Cash Collections                                                   */
/* ------------------------------------------------------------------ */

export interface CashCollectionRow {
  id: string;
  collected_date: string;
  service_name: string;
  total_amount_pence: number;
  counted_by_name_1: string;
  counted_by_name_2: string;
  counter_1_confirmed: boolean;
  counter_2_confirmed: boolean;
  status: 'draft' | 'posted' | 'banked';
  posted_transaction_id: string | null;
  banked_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface CashCollectionLineRow {
  id: string;
  fund_id: string;
  fund_name: string;
  income_account_id: string;
  income_account_name: string;
  amount_pence: number;
  donor_id: string | null;
  donor_name: string | null;
  gift_aid_eligible: boolean;
}

export interface CashCollectionDetail extends CashCollectionRow {
  lines: CashCollectionLineRow[];
}

/* ------------------------------------------------------------------ */
/*  Cash Spends                                                        */
/* ------------------------------------------------------------------ */

export interface CashSpendRow {
  id: string;
  spend_date: string;
  paid_to: string;
  spent_by: string;
  description: string;
  receipt_url: string | null;
  fund_id: string;
  fund_name: string;
  expense_account_id: string;
  expense_account_name: string;
  amount_pence: number;
  status: 'draft' | 'posted';
  posted_transaction_id: string | null;
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Cash Deposits                                                      */
/* ------------------------------------------------------------------ */

export interface CashDepositRow {
  id: string;
  bank_account_id: string;
  bank_account_name: string;
  deposit_date: string;
  total_amount_pence: number;
  status: 'draft' | 'posted' | 'matched';
  posted_transaction_id: string | null;
  created_at: string;
  collection_count: number;
}

/* ------------------------------------------------------------------ */
/*  Dashboard                                                          */
/* ------------------------------------------------------------------ */

export interface CashDashboard {
  cashInHandPence: number;
  totalCollectedPence: number;
  totalSpentPence: number;
  unbankedPence: number;
  draftCollections: number;
  missingSignatures: number;
}

/* ------------------------------------------------------------------ */
/*  Movement Ledger                                                    */
/* ------------------------------------------------------------------ */

export interface CashMovementEntry {
  id: string;
  date: string;
  type: 'collection' | 'spend' | 'deposit';
  description: string;
  amountPence: number;    // positive for in, negative for out
  runningBalancePence: number;
  status: string;
  journalId: string | null;
}
