/* ------------------------------------------------------------------ */
/*  Journals — shared types                                            */
/* ------------------------------------------------------------------ */

export type JournalStatus = 'draft' | 'approved' | 'posted';

export type JournalSourceType = 'bank' | 'bill' | 'payment' | 'payroll' | 'donation' | 'giving' | 'manual' | 'bank_migration' | 'adjustment';

export interface JournalRow {
  id: string;
  organisation_id: string;
  journal_date: string;
  reference: string | null;
  memo: string | null;
  status: JournalStatus;
  source_type: JournalSourceType | null;
  source_id: string | null;
  posted_at: string | null;
  created_by: string | null;
  created_at: string;
  reversal_of: string | null;
  reversed_by: string | null;
}

export interface JournalLineRow {
  id: string;
  journal_id: string;
  organisation_id: string;
  account_id: string;
  fund_id: string | null;
  supplier_id: string | null;
  description: string | null;
  debit_pence: number;
  credit_pence: number;
  created_at: string;
}

export interface JournalWithTotals extends JournalRow {
  total_debit_pence: number;
  total_credit_pence: number;
  line_count: number;
  created_by_name: string | null;
}

export const JOURNAL_STATUS_LABELS: Record<JournalStatus, string> = {
  draft: 'Draft',
  approved: 'Approved',
  posted: 'Posted',
};

export const JOURNAL_STATUSES: JournalStatus[] = ['draft', 'approved', 'posted'];
