import type { HealthIndicator, InsightInputs, MonthEndChecklist } from './types';

function formatCurrencyFromPence(pence: number): string {
  return `£${(pence / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatRelativeDays(days: number): string {
  if (days <= 0) {
    return 'today';
  }
  if (days === 1) {
    return '1 day ago';
  }
  return `${days} days ago`;
}

export function buildHealthIndicators(
  inputs: InsightInputs,
  monthEnd?: MonthEndChecklist,
): HealthIndicator[] {
  const indicators: HealthIndicator[] = [];

  if (inputs.bank.unreconciledLines > 0) {
    indicators.push({
      id: 'unreconciled_bank_items',
      title: 'Unreconciled bank items',
      severity: inputs.bank.unreconciledLines > 10 ? 'critical' : 'caution',
      value: `${inputs.bank.unreconciledLines} item${inputs.bank.unreconciledLines === 1 ? '' : 's'}`,
      explanation: `${inputs.bank.unreconciledLines} bank transaction${inputs.bank.unreconciledLines === 1 ? '' : 's'} remain unreconciled, so cash figures should be treated as provisional.`,
      recommendedAction: 'Open reconciliation and clear unmatched items before relying on the closing cash position.',
      href: '/reconciliation',
    });
  }

  if (inputs.trustee.restrictedFundsTotal < 0 || inputs.operational.overspentRestrictedFunds > 0) {
    indicators.push({
      id: 'restricted_fund_risk',
      title: 'Restricted fund risk',
      severity: 'critical',
      value:
        inputs.operational.overspentRestrictedFunds > 0
          ? `${inputs.operational.overspentRestrictedFunds} fund${inputs.operational.overspentRestrictedFunds === 1 ? '' : 's'}`
          : formatCurrencyFromPence(inputs.trustee.restrictedFundsTotal),
      explanation: 'Restricted funds are overspent or negative, which may indicate that designated money has been used before being covered.',
      recommendedAction: 'Review fund movements and document how the deficit will be corrected or reallocated.',
      href: '/reports/fund-movements',
    });
  }

  if (typeof inputs.dashboard.budgetVariancePence === 'number' && inputs.dashboard.budgetVariancePence > 0) {
    indicators.push({
      id: 'overspend_vs_budget',
      title: 'Overspend against budget',
      severity:
        typeof inputs.dashboard.budgetVariancePct === 'number' && inputs.dashboard.budgetVariancePct > 0.2
          ? 'critical'
          : 'caution',
      value: formatCurrencyFromPence(inputs.dashboard.budgetVariancePence),
      explanation: `Actual spend is ahead of plan by ${formatCurrencyFromPence(inputs.dashboard.budgetVariancePence)} for the selected period.`,
      recommendedAction: 'Open Budget vs Actual to identify the categories causing the overspend and agree corrective action.',
      href: '/reports/budget-vs-actual',
    });
  }

  const lowCashThreshold = Math.max(inputs.dashboard.expensePence, 0);
  if (inputs.trustee.cashTotal <= lowCashThreshold) {
    indicators.push({
      id: 'low_cash_warning',
      title: 'Low cash warning',
      severity: inputs.trustee.cashTotal < 0 ? 'critical' : 'caution',
      value: formatCurrencyFromPence(inputs.trustee.cashTotal),
      explanation:
        inputs.trustee.cashTotal < 0
          ? 'Cash is negative, which needs immediate investigation.'
          : 'Cash on hand is at or below one period of expenditure, so short-term resilience is tight.',
      recommendedAction: 'Review bank balances, timing of payments, and expected incoming receipts before month-end sign-off.',
      href: '/reports/cash-position',
    });
  }

  if (inputs.latestPostedJournalDate) {
    const daysSinceLastPostedJournal = Math.floor(
      (new Date(inputs.currentDate).getTime() - new Date(inputs.latestPostedJournalDate).getTime()) /
        (24 * 60 * 60 * 1000),
    );

    if (daysSinceLastPostedJournal >= 14) {
      indicators.push({
        id: 'stale_bookkeeping',
        title: 'Stale bookkeeping',
        severity: daysSinceLastPostedJournal >= 30 ? 'critical' : 'caution',
        value: formatRelativeDays(daysSinceLastPostedJournal),
        explanation: `The latest posted journal is from ${inputs.latestPostedJournalDate}, which suggests the books may not be fully up to date.`,
        recommendedAction: 'Review draft journals, bank imports, and pending finance workflows to bring postings up to date.',
        href: '/journals',
      });
    }
  }

  if (monthEnd && !monthEnd.isCompleted && monthEnd.completedCount < monthEnd.totalCount) {
    indicators.push({
      id: 'missing_month_end_steps',
      title: 'Month-end review incomplete',
      severity: 'caution',
      value: `${monthEnd.completedCount}/${monthEnd.totalCount} complete`,
      explanation: `${inputs.monthEnd.monthLabel} month-end review has not been fully completed, so control checks may still be outstanding.`,
      recommendedAction: 'Open the month-end assistant and finish the remaining review steps.',
      href: '/month-end',
    });
  }

  const outstandingApprovals = inputs.operational.pendingInvoices + inputs.operational.pendingExpenses;
  if (outstandingApprovals > 0) {
    indicators.push({
      id: 'outstanding_approvals',
      title: 'Outstanding approvals',
      severity: outstandingApprovals >= 5 ? 'critical' : 'caution',
      value: `${outstandingApprovals} item${outstandingApprovals === 1 ? '' : 's'}`,
      explanation: `${outstandingApprovals} invoice or expense approval${outstandingApprovals === 1 ? '' : 's'} are still waiting, which can delay accurate month-end reporting.`,
      recommendedAction: 'Review pending workflows and approve, reject, or convert them before close.',
      href: '/workflows',
    });
  }

  const incompleteWorkflows =
    inputs.operational.draftPayrollRuns +
    inputs.operational.draftPaymentRuns +
    inputs.operational.unpaidBills +
    (inputs.operational.giftAidClaimsAvailable ? 1 : 0);
  if (incompleteWorkflows > 0) {
    indicators.push({
      id: 'incomplete_finance_workflows',
      title: 'Incomplete finance workflows',
      severity: incompleteWorkflows >= 4 ? 'critical' : 'caution',
      value: `${incompleteWorkflows} open flow${incompleteWorkflows === 1 ? '' : 's'}`,
      explanation: 'Payroll, payment, billing, or Gift Aid work is still open, which means some finance activity may not yet be reflected in the final reports.',
      recommendedAction: 'Review payroll runs, payment runs, bills, and Gift Aid tasks before issuing reports.',
      href: '/month-end',
    });
  }

  if (indicators.length === 0) {
    indicators.push({
      id: 'finance_controls_healthy',
      title: 'Finance controls look healthy',
      severity: 'positive',
      value: 'No major flags',
      explanation: 'No material health warnings are currently triggered across reconciliation, budgeting, restricted funds, or month-end review.',
      recommendedAction: 'Continue routine monitoring and complete the normal month-end review.',
      href: '/month-end',
    });
  }

  return indicators;
}
