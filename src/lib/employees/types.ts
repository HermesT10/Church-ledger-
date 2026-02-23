/* Employee types (shared, not a server action file) */

export interface Employee {
  id: string;
  organisation_id: string;
  full_name: string;
  ni_number: string | null;
  tax_code: string | null;
  role: string | null;
  is_active: boolean;
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
  net_pence: number;
  created_at: string;
}

export interface PayrollLineWithEmployee extends PayrollLineRow {
  employee_name: string;
}
