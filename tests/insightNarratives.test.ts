import { describe, expect, it } from 'vitest';
import { buildTrusteePlainLanguageSummary, buildNarrativeSummaries } from '@/lib/insights/narratives';
import type { InsightInputs } from '@/lib/insights/types';

const inputs: InsightInputs = {
  periodLabel: 'June 2026',
  currentDate: '2026-06-30',
  latestPostedJournalDate: '2026-06-29',
  dashboard: {
    incomePence: 120000,
    expensePence: 135000,
    netPence: -15000,
    priorIncomePence: 100000,
    priorExpensePence: 90000,
    budgetVariancePence: 15000,
    budgetVariancePct: 0.16,
    giftAidOutstandingPence: 2500,
    donorsMissingDeclarations: 2,
  },
  bank: {
    unreconciledLines: 2,
    differencePence: 1000,
    balancedAccountCount: 1,
    totalAccountCount: 2,
  },
  trustee: {
    cashTotal: 50000,
    restrictedFundsTotal: -2500,
    forecastRiskLevel: 'AT_RISK',
  },
  operational: {
    overdueBills: 0,
    unpaidBills: 1,
    pendingInvoices: 0,
    pendingExpenses: 1,
    draftJournals: 1,
    draftBudgets: 0,
    unallocatedBankLines: 2,
    cashSpendsMissingReceipts: 0,
    approvedExpensesMissingReceipts: 0,
    draftPaymentRuns: 0,
    draftPayrollRuns: 1,
    overspentRestrictedFunds: 1,
    giftAidClaimsAvailable: true,
  },
  monthEnd: {
    monthLabel: 'June 2026',
    monthKey: '2026-06',
    reviewMonth: '2026-06-01',
    completedStepKeys: [],
    reportsGenerated: false,
    reviewCompletedAt: null,
  },
};

describe('insight narratives', () => {
  it('builds deterministic narratives from rules', () => {
    const anomalies = [
      {
        id: 'expense_spike',
        title: 'Expenses spiked against the prior period',
        severity: 'caution' as const,
        explanation: 'Expenses are up 30.0% compared with the prior matching period.',
        recommendedAction: 'Review budget variance.',
        href: '/reports/budget-vs-actual',
      },
    ];

    const narratives = buildNarrativeSummaries(inputs, anomalies);
    expect(narratives[0].body).toContain('June 2026');
    expect(narratives.some((item) => item.id === 'banking_summary')).toBe(true);
  });

  it('builds a trustee-friendly plain-language summary', () => {
    const summary = buildTrusteePlainLanguageSummary(inputs, [
      {
        id: 'expense_spike',
        title: 'Expenses spiked against the prior period',
        severity: 'caution',
        explanation: 'Expenses are up 30.0% compared with the prior matching period.',
        recommendedAction: 'Review budget variance.',
        href: '/reports/budget-vs-actual',
      },
    ]);

    expect(summary).toContain('June 2026');
    expect(summary).toContain('bank item');
    expect(summary).toContain('restricted fund');
  });
});
