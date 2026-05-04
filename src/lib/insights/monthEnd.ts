import type {
  InsightInputs,
  InsightSeverity,
  MonthEndChecklist,
  MonthEndChecklistStep,
} from './types';

type StepKey =
  | 'reconcile_bank_accounts'
  | 'review_unposted_drafts'
  | 'review_bills_and_payments'
  | 'review_restricted_funds'
  | 'review_payroll_postings'
  | 'review_donations_and_giftaid'
  | 'generate_reports'
  | 'mark_review_complete';

function buildStep(params: {
  key: StepKey;
  title: string;
  description: string;
  href: string;
  recommendedAction: string;
  isComplete: boolean;
  severity: InsightSeverity;
  isManual?: boolean;
}): MonthEndChecklistStep {
  return {
    key: params.key,
    title: params.title,
    description: params.description,
    status: params.isComplete ? 'complete' : params.isManual ? 'manual' : 'action_required',
    severity: params.isComplete ? 'positive' : params.severity,
    href: params.href,
    recommendedAction: params.recommendedAction,
    completionLabel: params.isComplete ? 'Complete' : params.isManual ? 'Manual confirmation required' : 'Needs review',
    isManual: Boolean(params.isManual),
  };
}

export function deriveReviewMonth(dateString: string): string {
  return `${dateString.slice(0, 7)}-01`;
}

export function buildMonthLabel(reviewMonth: string): string {
  const date = new Date(`${reviewMonth}T00:00:00Z`);
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function buildMonthEndChecklist(inputs: InsightInputs): MonthEndChecklist {
  const manualComplete = new Set(inputs.monthEnd.completedStepKeys);
  const operational = inputs.operational;

  const steps: MonthEndChecklistStep[] = [];

  steps.push(
    buildStep({
      key: 'reconcile_bank_accounts',
      title: 'Reconcile all bank accounts',
      description: `${inputs.bank.unreconciledLines} unreconciled bank item${inputs.bank.unreconciledLines === 1 ? '' : 's'} remain across ${inputs.bank.totalAccountCount} account${inputs.bank.totalAccountCount === 1 ? '' : 's'}.`,
      href: '/reconciliation',
      recommendedAction:
        inputs.bank.unreconciledLines === 0
          ? 'All bank accounts are reconciled for this review period.'
          : 'Finish reconciling unmatched bank lines and resolve statement-to-ledger differences.',
      isComplete: inputs.bank.unreconciledLines === 0 && inputs.bank.differencePence === 0,
      severity: inputs.bank.unreconciledLines > 10 ? 'critical' : 'caution',
    }),
  );

  const totalDrafts =
    operational.draftJournals + operational.draftPaymentRuns + operational.draftPayrollRuns;
  steps.push(
    buildStep({
      key: 'review_unposted_drafts',
      title: 'Review unposted drafts',
      description: `${totalDrafts} draft workflow item${totalDrafts === 1 ? '' : 's'} remain across journals, payment runs, and payroll.`,
      href: '/journals',
      recommendedAction:
        totalDrafts === 0
          ? 'No draft journals or runs are waiting for posting.'
          : 'Post or archive draft journals, payment runs, and payroll runs before close.',
      isComplete: totalDrafts === 0,
      severity: totalDrafts >= 5 ? 'critical' : 'caution',
    }),
  );

  const billWorkflowItems =
    operational.overdueBills + operational.unpaidBills + operational.pendingInvoices + operational.pendingExpenses;
  steps.push(
    buildStep({
      key: 'review_bills_and_payments',
      title: 'Review bills and payments',
      description: `${billWorkflowItems} billing or approval item${billWorkflowItems === 1 ? '' : 's'} still need attention.`,
      href: '/bills',
      recommendedAction:
        billWorkflowItems === 0
          ? 'Bills, invoices, and approval queues are clear for month-end.'
          : 'Clear overdue bills, approve pending requests, and confirm payment status before closing.',
      isComplete: billWorkflowItems === 0,
      severity: operational.overdueBills > 0 ? 'critical' : 'caution',
    }),
  );

  steps.push(
    buildStep({
      key: 'review_restricted_funds',
      title: 'Review restricted funds',
      description: `${operational.overspentRestrictedFunds} restricted fund${operational.overspentRestrictedFunds === 1 ? '' : 's'} are currently overspent.`,
      href: '/reports/fund-movements',
      recommendedAction:
        operational.overspentRestrictedFunds === 0
          ? 'Restricted funds remain covered.'
          : 'Investigate overspent restricted funds and document any reallocation or corrective action.',
      isComplete: operational.overspentRestrictedFunds === 0,
      severity: operational.overspentRestrictedFunds > 0 ? 'critical' : 'positive',
    }),
  );

  steps.push(
    buildStep({
      key: 'review_payroll_postings',
      title: 'Review payroll postings',
      description: `${operational.draftPayrollRuns} payroll run${operational.draftPayrollRuns === 1 ? '' : 's'} are still in draft.`,
      href: '/payroll',
      recommendedAction:
        operational.draftPayrollRuns === 0
          ? 'No draft payroll runs remain for the period.'
          : 'Approve and post outstanding payroll runs before finance review is completed.',
      isComplete: operational.draftPayrollRuns === 0,
      severity: operational.draftPayrollRuns > 0 ? 'caution' : 'positive',
    }),
  );

  const donationItems =
    (operational.giftAidClaimsAvailable ? 1 : 0) +
    (inputs.dashboard.donorsMissingDeclarations > 0 ? 1 : 0);
  steps.push(
    buildStep({
      key: 'review_donations_and_giftaid',
      title: 'Review donations and Gift Aid completeness',
      description: `${inputs.dashboard.giftAidOutstandingPence > 0 ? 'Gift Aid is outstanding' : 'Gift Aid is up to date'} and ${inputs.dashboard.donorsMissingDeclarations} donor${inputs.dashboard.donorsMissingDeclarations === 1 ? '' : 's'} still miss declarations.`,
      href: '/gift-aid',
      recommendedAction:
        donationItems === 0
          ? 'Donations and Gift Aid look complete for this close.'
          : 'Submit available Gift Aid claims and chase missing declarations for active donors.',
      isComplete: donationItems === 0,
      severity: donationItems > 0 ? 'caution' : 'positive',
    }),
  );

  steps.push(
    buildStep({
      key: 'generate_reports',
      title: 'Generate board and finance reports',
      description: 'Open the monthly dashboard, leadership snapshot, and board pack before sign-off.',
      href: '/reports/monthly-dashboard',
      recommendedAction:
        manualComplete.has('generate_reports') || inputs.monthEnd.reportsGenerated
          ? 'Reports have been marked as generated for this period.'
          : 'Generate and review the monthly dashboard, leadership snapshot, and export pack.',
      isComplete: manualComplete.has('generate_reports') || inputs.monthEnd.reportsGenerated,
      severity: 'info',
      isManual: true,
    }),
  );

  const allCoreStepsComplete = steps.every((step) => step.status === 'complete');
  steps.push(
    buildStep({
      key: 'mark_review_complete',
      title: 'Mark month-end review complete',
      description: 'Final sign-off confirms the month-end close review has been completed.',
      href: '/month-end',
      recommendedAction:
        inputs.monthEnd.reviewCompletedAt
          ? 'Month-end review has been completed.'
          : allCoreStepsComplete
            ? 'All prior checks are complete. Record the final month-end sign-off.'
            : 'Finish the outstanding steps before marking the review complete.',
      isComplete: Boolean(inputs.monthEnd.reviewCompletedAt),
      severity: allCoreStepsComplete ? 'info' : 'caution',
      isManual: true,
    }),
  );

  const completedCount = steps.filter((step) => step.status === 'complete').length;
  const totalCount = steps.length;

  return {
    monthLabel: inputs.monthEnd.monthLabel,
    monthKey: inputs.monthEnd.monthKey,
    reviewMonth: inputs.monthEnd.reviewMonth,
    completedCount,
    totalCount,
    progressPercent: Math.round((completedCount / totalCount) * 100),
    isCompleted: Boolean(inputs.monthEnd.reviewCompletedAt),
    completedStepKeys: [...manualComplete],
    steps,
  };
}
