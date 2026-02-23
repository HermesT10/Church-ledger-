/* ------------------------------------------------------------------ */
/*  Suppliers — shared types                                           */
/* ------------------------------------------------------------------ */

export interface SupplierRow {
  id: string;
  organisation_id: string;
  name: string;
  email: string | null;
  contact_name: string | null;
  phone: string | null;
  address: string | null;
  bank_details: string | null;
  default_account_id: string | null;
  default_fund_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface SupplierWithStats extends SupplierRow {
  outstanding_pence: number;
  paid_this_year_pence: number;
  invoice_count: number;
}

export interface SupplierInvoice {
  id: string;
  bill_number: string | null;
  bill_date: string;
  due_date: string | null;
  total_pence: number;
  status: string;
  journal_id: string | null;
}

export const BILL_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  approved: 'Approved',
  posted: 'Posted',
  paid: 'Paid',
};

/* ---- Supplier match rules (auto-suggest) ---- */

export interface SupplierMatchRule {
  id: string;
  organisation_id: string;
  supplier_id: string;
  match_type: 'contains';
  pattern: string;
  created_at: string;
}

export interface SupplierMatchRuleWithName extends SupplierMatchRule {
  supplier_name: string;
}

/* ---- Supplier option (for dropdowns) ---- */

export interface SupplierOption {
  id: string;
  name: string;
  is_active: boolean;
}
