import type { AnomalyFinding, InsightInputs, NarrativeSummary } from './types';

function formatCurrencyFromPence(pence: number): string {
  return `£${(pence / 100).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function buildNarrativeSummaries(
  inputs: InsightInputs,
  anomalies: AnomalyFinding[],
): NarrativeSummary[] {
  const summaries: NarrativeSummary[] = [];

  const priorNet =
    inputs.dashboard.priorIncomePence !== null && inputs.dashboard.priorExpensePence !== null
      ? inputs.dashboard.priorIncomePence - inputs.dashboard.priorExpensePence
      : null;

  if (priorNet !== null) {
    const betterOrWorse =
      inputs.dashboard.netPence >= priorNet ? 'stronger' : 'weaker';
    summaries.push({
      id: 'performance_comparison',
      title: 'Period performance',
      body: `${inputs.periodLabel} closed at ${formatCurrencyFromPence(inputs.dashboard.netPence)}, which is ${betterOrWorse} than the prior matching period.`,
      severity: inputs.dashboard.netPence >= 0 ? 'positive' : 'caution',
    });
  } else {
    summaries.push({
      id: 'performance_snapshot',
      title: 'Period performance',
      body: `${inputs.periodLabel} closed at ${formatCurrencyFromPence(inputs.dashboard.netPence)} based on posted income and expenditure.`,
      severity: inputs.dashboard.netPence >= 0 ? 'positive' : 'caution',
    });
  }

  if (inputs.operational.overspentRestrictedFunds > 0) {
    summaries.push({
      id: 'restricted_funds_summary',
      title: 'Restricted funds need attention',
      body: `${inputs.operational.overspentRestrictedFunds} restricted fund${inputs.operational.overspentRestrictedFunds === 1 ? '' : 's'} are overspent, so trustees should review whether spend was authorised and how the balance will be corrected.`,
      severity: 'critical',
    });
  }

  if (inputs.bank.unreconciledLines > 0) {
    summaries.push({
      id: 'banking_summary',
      title: 'Cash should be treated carefully',
      body: `${inputs.bank.unreconciledLines} bank item${inputs.bank.unreconciledLines === 1 ? '' : 's'} are still unreconciled, so closing cash should be treated as provisional until reconciliation is complete.`,
      severity: inputs.bank.unreconciledLines > 10 ? 'critical' : 'caution',
    });
  }

  if (anomalies.length > 0) {
    const top = anomalies[0];
    summaries.push({
      id: 'anomaly_summary',
      title: 'Most significant change',
      body: `${top.title}. ${top.explanation}`,
      severity: top.severity,
    });
  }

  if (!inputs.monthEnd.reviewCompletedAt) {
    summaries.push({
      id: 'month_end_summary',
      title: 'Month-end review still open',
      body: `${inputs.monthEnd.monthLabel} review has not been marked complete yet. Finish the checklist before circulating final reports to trustees.`,
      severity: 'info',
    });
  }

  return summaries.slice(0, 4);
}

export function buildTrusteePlainLanguageSummary(
  inputs: InsightInputs,
  anomalies: AnomalyFinding[],
): string {
  const parts: string[] = [];

  parts.push(
    `${inputs.periodLabel} closed at ${formatCurrencyFromPence(inputs.dashboard.netPence)}.`,
  );

  if (inputs.dashboard.netPence < 0) {
    parts.push('This means expenditure was higher than income for the period.');
  } else {
    parts.push('This means income stayed ahead of expenditure for the period.');
  }

  if (inputs.bank.unreconciledLines > 0) {
    parts.push(
      `${inputs.bank.unreconciledLines} bank item${inputs.bank.unreconciledLines === 1 ? '' : 's'} still need reconciliation, so cash should be treated as provisional.`,
    );
  }

  if (inputs.operational.overspentRestrictedFunds > 0) {
    parts.push(
      `${inputs.operational.overspentRestrictedFunds} restricted fund${inputs.operational.overspentRestrictedFunds === 1 ? '' : 's'} are overspent and need review.`,
    );
  }

  if (anomalies.length > 0) {
    parts.push(`The main unusual change is that ${anomalies[0].explanation.toLowerCase()}`);
  }

  return parts.join(' ');
}
