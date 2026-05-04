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
  totalEmployeeNicPence?: number;
  totalEmployerNicPence?: number;
  totalEmployeePensionPence?: number;
  totalEmployerPensionPence?: number;
  totalOtherDeductionsPence?: number;
  totalEmployerCostPence?: number;
  journalId: string | null;
  createdAt: string;
  attachmentUrl: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
}

export interface PayrollRunDetail extends PayrollRunSummary {
  organisationId: string;
  periodStart: string | null;
  periodEnd: string | null;
  paymentDate?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  paidAt?: string | null;
  paidBy?: string | null;
  reconciledAt?: string | null;
  reconciledBy?: string | null;
  reversedAt?: string | null;
  reversedBy?: string | null;
  paymentReference?: string | null;
  createdBy: string | null;
  splits: {
    id: string;
    fundId: string | null;
    fundName: string | null;
    amountPence: number;
  }[];
  payrollLines: PayrollLineWithEmployee[];
}
