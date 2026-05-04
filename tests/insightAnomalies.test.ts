import { describe, expect, it } from 'vitest';
import { detectInsightAnomalies } from '@/lib/insights/anomalies';
import type { InsightInputs } from '@/lib/insights/types';

function createInputs(): InsightInputs {
  return {
    periodLabel: 'April 2026',
    currentDate: '2026-04-30',
    latestPostedJournalDate: '2026-04-29',
    dashboard: {
      incomePence: 80000,
      expensePence: 140000,
      netPence: -60000,
      priorIncomePence: 120000,
      priorExpensePence: 90000,
      budgetVariancePence: 20000,
      budgetVariancePct: 0.25,
      giftAidOutstandingPence: 0,
      donorsMissingDeclarations: 0,
    },
    bank: {
      unreconciledLines: 14,
      differencePence: 5000,
      balancedAccountCount: 0,
      totalAccountCount: 2,
    },
    trustee: {
      cashTotal: 10000,
      restrictedFundsTotal: -5000,
      forecastRiskLevel: 'AT_RISK',
    },
    operational: {
      overdueBills: 1,
      unpaidBills: 2,
      pendingInvoices: 1,
      pendingExpenses: 1,
      draftJournals: 3,
      draftBudgets: 1,
      unallocatedBankLines: 14,
      cashSpendsMissingReceipts: 0,
      approvedExpensesMissingReceipts: 0,
      draftPaymentRuns: 1,
      draftPayrollRuns: 2,
      overspentRestrictedFunds: 1,
      giftAidClaimsAvailable: true,
    },
    monthEnd: {
      monthLabel: 'April 2026',
      monthKey: '2026-04',
      reviewMonth: '2026-04-01',
      completedStepKeys: [],
      reportsGenerated: false,
      reviewCompletedAt: null,
    },
  };
}

describe('detectInsightAnomalies', () => {
  it('detects material finance anomalies from period deltas and workflow backlogs', () => {
    const ids = detectInsightAnomalies(createInputs()).map((item) => item.id);
    expect(ids).toContain('expense_spike');
    expect(ids).toContain('income_drop');
    expect(ids).toContain('negative_restricted_funds');
    expect(ids).toContain('draft_backlog');
    expect(ids).toContain('unreconciled_growth');
    expect(ids).toContain('net_result_change');
  });
});
