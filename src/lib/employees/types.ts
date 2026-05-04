/* Employee types (shared, not a server action file) */

export interface Employee {
  id: string;
  organisation_id: string;
  full_name: string;
  ni_number: string | null;
  tax_code: string | null;
  role: string | null;
  is_active: boolean;
  status?: 'active' | 'inactive' | 'archived';
  archived_at?: string | null;
  archived_by?: string | null;
  archive_reason?: string | null;
  department_ministry?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  payroll_status?: 'active' | 'on_leave' | 'ended' | 'excluded';
  default_fund_id?: string | null;
  default_account_id?: string | null;
  pension_scheme_participation?: 'none' | 'employee' | 'employer' | 'both';
  payroll_reference?: string | null;
  created_at: string;
}

export interface PayrollLineRow {
  id: string;
  payroll_run_id: string;
  employee_id: string;
  gross_pence: number;
  tax_pence: number;
  pension_pence: number;
  employer_ni_pence: number;
  employee_nic_pence?: number;
  employer_nic_pence?: number;
  employee_pension_pence?: number;
  employer_pension_pence?: number;
  other_deductions_pence?: number;
  fund_id?: string | null;
  account_id?: string | null;
  department_ministry?: string | null;
  notes?: string | null;
  net_pence: number;
  created_at: string;
}

export interface PayrollLineWithEmployee extends PayrollLineRow {
  employee_name: string;
}
