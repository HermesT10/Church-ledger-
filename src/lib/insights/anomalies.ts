import type { AnomalyFinding, InsightInputs } from './types';

function formatCurrencyFromPence(pence: number): string {
  return `£${(pence / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function pctChange(current: number, prior: number | null): number | null {
  if (prior === null || prior === 0) {
    return null;
  }
  return (current - prior) / Math.abs(prior);
}

export function detectInsightAnomalies(inputs: InsightInputs): AnomalyFinding[] {
  const anomalies: AnomalyFinding[] = [];

  const expenseChange = pctChange(
    inputs.dashboard.expensePence,
    inputs.dashboard.priorExpensePence,
  );
  if (expenseChange !== null && expenseChange >= 0.25) {
    anomalies.push({
      id: 'expense_spike',
      title: 'Expenses spiked against the prior period',
      severity: expenseChange >= 0.5 ? 'critical' : 'caution',
      explanation: `Expenses are up ${(expenseChange * 100).toFixed(1)}% compared with the prior matching period.`,
      recommendedAction: 'Open Budget vs Actual and supplier spend to identify which categories drove the increase.',
      href: '/reports/budget-vs-actual',
    });
  }

  const incomeChange = pctChange(
    inputs.dashboard.incomePence,
    inputs.dashboard.priorIncomePence,
  );
  if (incomeChange !== null && incomeChange <= -0.2) {
    anomalies.push({
      id: 'income_drop',
      title: 'Expected income pattern is down',
      severity: incomeChange <= -0.4 ? 'critical' : 'caution',
      explanation: `Income is down ${Math.abs(incomeChange * 100).toFixed(1)}% compared with the prior matching period.`,
      recommendedAction: 'Review donation, letting, and grant income patterns to confirm whether this is timing or an emerging shortfall.',
      href: '/reports/income-statement',
    });
  }

  if (inputs.trustee.restrictedFundsTotal < 0) {
    anomalies.push({
      id: 'negative_restricted_funds',
      title: 'Restricted fund balances are negative',
      severity: 'critical',
      explanation: `Restricted fund balances total ${formatCurrencyFromPence(inputs.trustee.restrictedFundsTotal)}.`,
      recommendedAction: 'Inspect fund movements and confirm whether spend should be reallocated or covered by designated/unrestricted funds.',
      href: '/reports/fund-movements',
    });
  }

  const draftBacklog =
    inputs.operational.draftJournals +
    inputs.operational.draftPaymentRuns +
    inputs.operational.draftPayrollRuns;
  if (draftBacklog >= 3) {
    anomalies.push({
      id: 'draft_backlog',
      title: 'Unposted drafts are building up',
      severity: draftBacklog >= 6 ? 'critical' : 'caution',
      explanation: `${draftBacklog} draft journal or run item${draftBacklog === 1 ? '' : 's'} remain unposted.`,
      recommendedAction: 'Review and either post or archive outdated drafts so reporting reflects real activity.',
      href: '/journals',
    });
  }

  if (inputs.bank.unreconciledLines >= 10) {
    anomalies.push({
      id: 'unreconciled_growth',
      title: 'Reconciliation backlog is material',
      severity: inputs.bank.unreconciledLines >= 25 ? 'critical' : 'caution',
      explanation: `${inputs.bank.unreconciledLines} bank lines are unreconciled, which increases the chance of timing or posting errors.`,
      recommendedAction: 'Prioritise reconciliation before finalising month-end reports.',
      href: '/reconciliation',
    });
  }

  const netDelta = pctChange(
    inputs.dashboard.netPence,
    inputs.dashboard.priorIncomePence !== null && inputs.dashboard.priorExpensePence !== null
      ? inputs.dashboard.priorIncomePence - inputs.dashboard.priorExpensePence
      : null,
  );
  if (netDelta !== null && Math.abs(netDelta) >= 0.3) {
    anomalies.push({
      id: 'net_result_change',
      title: 'Net result changed sharply month on month',
      severity: Math.abs(netDelta) >= 0.6 ? 'critical' : 'caution',
      explanation: `Net movement changed by ${(Math.abs(netDelta) * 100).toFixed(1)}% compared with the prior matching period.`,
      recommendedAction: 'Use the monthly dashboard and income statement to explain the main drivers before presenting results.',
      href: '/reports/monthly-dashboard',
    });
  }

  return anomalies;
}
