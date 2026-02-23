/* ------------------------------------------------------------------ */
/*  Banking types (shared, not a server action file)                    */
/* ------------------------------------------------------------------ */

/* ---- CSV Import ---- */

export interface ColumnMapping {
  date: string;
  description: string;
  amount: string;
  reference?: string;
  balance?: string;
}

export interface ImportResult {
  total_rows: number;
  inserted_count: number;
  skipped_duplicates: number;
  errors_count: number;
  sample_errors: string[];
}

/* ---- Bank Account ---- */

export interface BankAccountRow {
  id: string;
  organisation_id: string;
  name: string;
  account_number_last4: string | null;
  sort_code: string | null;
  currency: string;
  linked_account_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface BankAccountWithStats extends BankAccountRow {
  total_lines: number;
  unallocated_count: number;
  latest_balance_pence: number | null;
}

/* ---- Bank Line ---- */

export interface BankLineRow {
  id: string;
  organisation_id: string;
  bank_account_id: string;
  txn_date: string;
  description: string | null;
  reference: string | null;
  amount_pence: number;
  balance_pence: number | null;
  fingerprint: string;
  raw: Record<string, unknown> | null;
  allocated: boolean;
  reconciled: boolean;
  reconciled_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface BankLineWithAllocation extends BankLineRow {
  allocation: AllocationRow | null;
}

/* ---- Allocation ---- */

export interface AllocationRow {
  id: string;
  organisation_id: string;
  bank_line_id: string;
  account_id: string;
  fund_id: string;
  supplier_id: string | null;
  amount_pence: number;
  created_by: string | null;
  created_at: string;
}

export interface AllocationDisplay extends AllocationRow {
  account_name: string;
  fund_name: string;
  supplier_name: string | null;
}

/* ---- Paginated response ---- */

export interface PaginatedBankLines {
  lines: BankLineWithAllocation[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/* ---- Bank Account Stats ---- */

export interface BankAccountStats {
  currentBalancePence: number | null;
  totalLines: number;
  allocatedCount: number;
  unallocatedCount: number;
  unallocatedAmountPence: number;
}
