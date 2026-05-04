import { describe, expect, it } from 'vitest';
import { buildMonthEndChecklist } from '@/lib/insights/monthEnd';
import type { InsightInputs } from '@/lib/insights/types';

const baseInputs: InsightInputs = {
  periodLabel: 'May 2026',
  currentDate: '2026-05-31',
  latestPostedJournalDate: '2026-05-31',
  dashboard: {
    incomePence: 100000,
    expensePence: 90000,
    netPence: 10000,
    priorIncomePence: 95000,
    priorExpensePence: 85000,
    budgetVariancePence: 0,
    budgetVariancePct: 0,
    giftAidOutstandingPence: 0,
    donorsMissingDeclarations: 0,
  },
  bank: {
    unreconciledLines: 0,
    differencePence: 0,
    balancedAccountCount: 2,
    totalAccountCount: 2,
  },
  trustee: {
    cashTotal: 200000,
    restrictedFundsTotal: 10000,
    forecastRiskLevel: 'ON_TRACK',
  },
  operational: {
    overdueBills: 0,
    unpaidBills: 0,
    pendingInvoices: 0,
    pendingExpenses: 0,
    draftJournals: 0,
    draftBudgets: 0,
    unallocatedBankLines: 0,
    cashSpendsMissingReceipts: 0,
    approvedExpensesMissingReceipts: 0,
    draftPaymentRuns: 0,
    draftPayrollRuns: 0,
    overspentRestrictedFunds: 0,
    giftAidClaimsAvailable: false,
  },
  monthEnd: {
    monthLabel: 'May 2026',
    monthKey: '2026-05',
    reviewMonth: '2026-05-01',
    completedStepKeys: ['generate_reports'],
    reportsGenerated: true,
    reviewCompletedAt: null,
  },
};

describe('buildMonthEndChecklist', () => {
  it('marks auto steps complete when control metrics are clear', () => {
    const checklist = buildMonthEndChecklist(baseInputs);
    expect(checklist.steps[0].status).toBe('complete');
    expect(checklist.steps[5].status).toBe('complete');
    expect(checklist.steps[6].status).toBe('complete');
  });

  it('keeps the final close step incomplete until sign-off is recorded', () => {
    const checklist = buildMonthEndChecklist(baseInputs);
    expect(checklist.steps[7].status).toBe('manual');
    expect(checklist.isCompleted).toBe(false);
  });
});
