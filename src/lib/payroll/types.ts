/* Payroll types (shared, not a server action file) */

import type { PayrollLineWithEmployee } from '@/lib/employees/types';

export interface PayrollRunSummary {
  id: string;
  payrollMonth: string;
  status: string;
  totalGrossPence: number;
  totalNetPence: number;
  totalPayePence: number;
  totalNicPence: number;
  totalPensionPence: number;
  journalId: string | null;
  createdAt: string;
}

export interface PayrollRunDetail extends PayrollRunSummary {
  organisationId: string;
  periodStart: string | null;
  periodEnd: string | null;
  createdBy: string | null;
  splits: {
    id: string;
    fundId: string | null;
    fundName: string | null;
    amountPence: number;
  }[];
  payrollLines: PayrollLineWithEmployee[];
}
