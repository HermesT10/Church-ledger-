export type InsightSeverity = 'info' | 'caution' | 'critical' | 'positive';

export interface HealthIndicator {
  id: string;
  title: string;
  severity: InsightSeverity;
  value: string;
  explanation: string;
  recommendedAction: string;
  href: string;
}

export interface AnomalyFinding {
  id: string;
  title: string;
  severity: InsightSeverity;
  explanation: string;
  recommendedAction: string;
  href: string;
}

export interface NarrativeSummary {
  id: string;
  title: string;
  body: string;
  severity: InsightSeverity;
}

export type MonthEndStepStatus = 'complete' | 'action_required' | 'manual';

export interface MonthEndChecklistStep {
  key: string;
  title: string;
  description: string;
  status: MonthEndStepStatus;
  severity: InsightSeverity;
  href: string;
  recommendedAction: string;
  completionLabel: string;
  isManual: boolean;
}

export interface MonthEndChecklist {
  monthLabel: string;
  monthKey: string;
  reviewMonth: string;
  completedCount: number;
  totalCount: number;
  progressPercent: number;
  isCompleted: boolean;
  completedStepKeys: string[];
  steps: MonthEndChecklistStep[];
}

export interface InsightSnapshot {
  generatedAt: string;
  periodLabel: string;
  indicators: HealthIndicator[];
  anomalies: AnomalyFinding[];
  narratives: NarrativeSummary[];
  monthEnd: MonthEndChecklist;
}

export interface InsightOperationalMetrics {
  overdueBills: number;
  unpaidBills: number;
  pendingInvoices: number;
  pendingExpenses: number;
  draftJournals: number;
  draftBudgets: number;
  unallocatedBankLines: number;
  cashSpendsMissingReceipts: number;
  approvedExpensesMissingReceipts: number;
  draftPaymentRuns: number;
  draftPayrollRuns: number;
  overspentRestrictedFunds: number;
  giftAidClaimsAvailable: boolean;
}

export interface InsightInputs {
  periodLabel: string;
  currentDate: string;
  latestPostedJournalDate: string | null;
  dashboard: {
    incomePence: number;
    expensePence: number;
    netPence: number;
    priorIncomePence: number | null;
    priorExpensePence: number | null;
    budgetVariancePence: number | null;
    budgetVariancePct: number | null;
    giftAidOutstandingPence: number;
    donorsMissingDeclarations: number;
  };
  bank: {
    unreconciledLines: number;
    differencePence: number;
    balancedAccountCount: number;
    totalAccountCount: number;
  };
  trustee: {
    cashTotal: number;
    restrictedFundsTotal: number;
    forecastRiskLevel: 'ON_TRACK' | 'AT_RISK';
  };
  operational: InsightOperationalMetrics;
  monthEnd: {
    monthLabel: string;
    monthKey: string;
    reviewMonth: string;
    completedStepKeys: string[];
    reportsGenerated: boolean;
    reviewCompletedAt: string | null;
  };
}
