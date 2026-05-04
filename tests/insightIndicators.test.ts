import { describe, expect, it } from 'vitest';
import { buildMonthEndChecklist } from '@/lib/insights/monthEnd';
import { buildHealthIndicators } from '@/lib/insights/indicators';
import type { InsightInputs } from '@/lib/insights/types';

function buildInputs(overrides?: Partial<InsightInputs>): InsightInputs {
  return {
    periodLabel: 'March 2026',
    currentDate: '2026-03-31',
    latestPostedJournalDate: '2026-03-30',
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
      restrictedFundsTotal: 50000,
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
      monthLabel: 'March 2026',
      monthKey: '2026-03',
      reviewMonth: '2026-03-01',
      completedStepKeys: [],
      reportsGenerated: false,
      reviewCompletedAt: null,
    },
    ...overrides,
  };
}

describe('buildHealthIndicators', () => {
  it('returns a healthy indicator when no warnings are triggered', () => {
    const inputs = buildInputs();
    const checklist = buildMonthEndChecklist(inputs);
    expect(buildHealthIndicators(inputs, checklist)[0].id).toBe('missing_month_end_steps');
  });

  it('flags cash, restricted fund, and unreconciled risks', () => {
    const inputs = buildInputs({
      bank: {
        unreconciledLines: 12,
        differencePence: 1000,
        balancedAccountCount: 0,
        totalAccountCount: 2,
      },
      trustee: {
        cashTotal: -5000,
        restrictedFundsTotal: -2500,
        forecastRiskLevel: 'AT_RISK',
      },
      operational: {
        ...buildInputs().operational,
        overspentRestrictedFunds: 1,
      },
    });
    const checklist = buildMonthEndChecklist(inputs);
    const ids = buildHealthIndicators(inputs, checklist).map((item) => item.id);
    expect(ids).toContain('unreconciled_bank_items');
    expect(ids).toContain('restricted_fund_risk');
    expect(ids).toContain('low_cash_warning');
  });
});
