/* ------------------------------------------------------------------ */
/*  Journals — shared types                                            */
/* ------------------------------------------------------------------ */

export type JournalStatus = 'draft' | 'approved' | 'posted' | 'reversed' | 'correcting' | 'voided';

export type JournalSourceType = 'bank' | 'bill' | 'payment' | 'payroll' | 'donation' | 'giving' | 'manual' | 'bank_migration' | 'adjustment';

export interface JournalRow {
  id: string;
  organisation_id: string;
  journal_date: string;
  reference: string | null;
  memo: string | null;
  status: JournalStatus;
  attachment_url?: string | null;
  source_type: JournalSourceType | null;
  source_id: string | null;
  posted_at: string | null;
  posted_by?: string | null;
  created_by: string | null;
  created_at: string;
  reversal_of: string | null;
  reversed_by: string | null;
  reversal_of_journal_id?: string | null;
  corrected_by_journal_id?: string | null;
  original_journal_id?: string | null;
  reversal_journal_id?: string | null;
  replacement_journal_id?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  reversal_reason?: string | null;
  amendment_reason?: string | null;
  amended_by?: string | null;
  amended_at?: string | null;
  voided_at?: string | null;
  voided_by?: string | null;
  void_reason?: string | null;
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
  reversed: 'Reversed',
  correcting: 'Correcting',
  voided: 'Voided',
};

export const JOURNAL_STATUSES: JournalStatus[] = ['draft', 'approved', 'posted', 'reversed', 'correcting', 'voided'];
