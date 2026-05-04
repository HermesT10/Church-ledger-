import { formatCurrencyFromPence } from '@/lib/reports/framework';
import type { TrusteePackCommentaryItem, TrusteePackSection } from './types';

interface FinancialCommentaryInput {
  periodLabel: string;
  currentIncomePence: number;
  currentExpensePence: number;
  priorIncomePence?: number | null;
  priorExpensePence?: number | null;
  budgetVariancePence?: number | null;
  topBudgetVarianceLabel?: string | null;
  restrictedFundsRemainingPence?: number | null;
  unreconciledBankTransactions?: number | null;
  giftAidOutstandingPence?: number | null;
  supplierSpendPence?: number | null;
  topSupplierName?: string | null;
  payrollCostPence?: number | null;
  lettingsIncomePence?: number | null;
}

function percentChange(current: number, prior: number | null | undefined) {
  if (!prior) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

function signedPercent(value: number) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function item(params: TrusteePackCommentaryItem): TrusteePackCommentaryItem {
  return { ...params, editableText: params.adminOverrideText ?? params.editableText ?? params.body };
}

export function generateFinancialCommentary(input: FinancialCommentaryInput): TrusteePackCommentaryItem[] {
  const result: TrusteePackCommentaryItem[] = [];
  const incomeChange = percentChange(input.currentIncomePence, input.priorIncomePence);
  const expenseChange = percentChange(input.currentExpensePence, input.priorExpensePence);
  const netPosition = input.currentIncomePence - input.currentExpensePence;

  if (incomeChange !== null) {
    result.push(item({
      id: 'income-prior-period',
      title: 'Income movement',
      body: `Income ${incomeChange >= 0 ? 'increased' : 'decreased'} by ${signedPercent(incomeChange)} compared with the prior period.`,
      tone: incomeChange >= 0 ? 'positive' : 'caution',
      source: 'income_expenditure',
      calculation: `(current income ${input.currentIncomePence} - prior income ${input.priorIncomePence}) / prior income`,
      editableText: `Income ${incomeChange >= 0 ? 'increased' : 'decreased'} by ${signedPercent(incomeChange)} compared with the prior period.`,
    }));
  }

  if (expenseChange !== null) {
    result.push(item({
      id: 'expense-prior-period',
      title: 'Expenditure movement',
      body: `Expenditure ${expenseChange >= 0 ? 'increased' : 'decreased'} by ${signedPercent(expenseChange)} compared with the prior period.`,
      tone: expenseChange > 10 ? 'caution' : 'neutral',
      source: 'income_expenditure',
      calculation: `(current expenditure ${input.currentExpensePence} - prior expenditure ${input.priorExpensePence}) / prior expenditure`,
      editableText: `Expenditure ${expenseChange >= 0 ? 'increased' : 'decreased'} by ${signedPercent(expenseChange)} compared with the prior period.`,
    }));
  }

  result.push(item({
    id: 'net-position',
    title: netPosition >= 0 ? 'Positive net position' : 'Deficit for the period',
    body: `${input.periodLabel} shows a net position of ${formatCurrencyFromPence(netPosition)}.`,
    tone: netPosition >= 0 ? 'positive' : 'critical',
    source: 'income_expenditure',
    calculation: `income ${input.currentIncomePence} - expenditure ${input.currentExpensePence}`,
    editableText: `${input.periodLabel} shows a net position of ${formatCurrencyFromPence(netPosition)}.`,
  }));

  if (typeof input.budgetVariancePence === 'number') {
    const adverse = input.budgetVariancePence > 0;
    result.push(item({
      id: 'budget-variance',
      title: adverse ? 'Budget variance needs review' : 'Budget is within plan',
      body: `${input.topBudgetVarianceLabel ?? 'Overall budget'} is ${formatCurrencyFromPence(Math.abs(input.budgetVariancePence))} ${adverse ? 'above' : 'within or ahead of'} plan.`,
      tone: adverse ? 'caution' : 'positive',
      source: 'budget_vs_actual',
      calculation: `actual minus budget variance ${input.budgetVariancePence}`,
      editableText: `${input.topBudgetVarianceLabel ?? 'Overall budget'} variance is ${formatCurrencyFromPence(input.budgetVariancePence)}.`,
    }));
  }

  if (typeof input.restrictedFundsRemainingPence === 'number') {
    result.push(item({
      id: 'restricted-funds-remaining',
      title: 'Restricted funds remaining',
      body: `Restricted funds have ${formatCurrencyFromPence(input.restrictedFundsRemainingPence)} remaining for their specified purposes.`,
      tone: input.restrictedFundsRemainingPence >= 0 ? 'neutral' : 'critical',
      source: 'restricted_funds',
      calculation: `sum of restricted fund closing balances ${input.restrictedFundsRemainingPence}`,
      editableText: `Restricted funds have ${formatCurrencyFromPence(input.restrictedFundsRemainingPence)} remaining.`,
    }));
  }

  if (typeof input.unreconciledBankTransactions === 'number') {
    result.push(item({
      id: 'bank-reconciliation',
      title: input.unreconciledBankTransactions === 0 ? 'Bank reconciliation is clear' : 'Bank reconciliation needs action',
      body: `There are ${input.unreconciledBankTransactions} unreconciled bank transactions requiring review or allocation.`,
      tone: input.unreconciledBankTransactions === 0 ? 'positive' : 'caution',
      source: 'bank_reconciliation',
      calculation: `count of unreconciled bank transactions ${input.unreconciledBankTransactions}`,
      editableText: `There are ${input.unreconciledBankTransactions} unreconciled bank transactions requiring review or allocation.`,
    }));
  }

  if (typeof input.giftAidOutstandingPence === 'number' && input.giftAidOutstandingPence > 0) {
    result.push(item({
      id: 'gift-aid-outstanding',
      title: 'Gift Aid follow-up',
      body: `Gift Aid has ${formatCurrencyFromPence(input.giftAidOutstandingPence)} outstanding or claimable.`,
      tone: 'caution',
      source: 'gift_aid',
      calculation: `outstanding Gift Aid ${input.giftAidOutstandingPence}`,
      editableText: `Gift Aid has ${formatCurrencyFromPence(input.giftAidOutstandingPence)} outstanding or claimable.`,
    }));
  }

  if (typeof input.supplierSpendPence === 'number' && input.topSupplierName) {
    result.push(item({
      id: 'supplier-spend',
      title: 'Supplier spend highlight',
      body: `${input.topSupplierName} is the largest supplier spend highlighted at ${formatCurrencyFromPence(input.supplierSpendPence)}.`,
      tone: 'neutral',
      source: 'supplier_spend',
      calculation: `largest supplier spend ${input.supplierSpendPence}`,
      editableText: `${input.topSupplierName} is the largest supplier spend highlighted at ${formatCurrencyFromPence(input.supplierSpendPence)}.`,
    }));
  }

  if (typeof input.payrollCostPence === 'number' && input.payrollCostPence > 0) {
    result.push(item({
      id: 'payroll-summary',
      title: 'Payroll summary',
      body: `Payroll costs of ${formatCurrencyFromPence(input.payrollCostPence)} are included in this pack.`,
      tone: 'neutral',
      source: 'payroll',
      calculation: `payroll cost total ${input.payrollCostPence}`,
      editableText: `Payroll costs of ${formatCurrencyFromPence(input.payrollCostPence)} are included in this pack.`,
    }));
  }

  if (typeof input.lettingsIncomePence === 'number' && input.lettingsIncomePence > 0) {
    result.push(item({
      id: 'lettings-income',
      title: 'Lettings income',
      body: `Lettings income contributed ${formatCurrencyFromPence(input.lettingsIncomePence)} in this reporting period.`,
      tone: 'positive',
      source: 'lettings',
      calculation: `lettings income ${input.lettingsIncomePence}`,
      editableText: `Lettings income contributed ${formatCurrencyFromPence(input.lettingsIncomePence)} in this reporting period.`,
    }));
  }

  return result;
}

export function commentaryFromSections(sections: TrusteePackSection[]): FinancialCommentaryInput {
  const incomeSection = sections.find((section) => section.key === 'income_expenditure');
  const budgetSection = sections.find((section) => section.key === 'budget_vs_actual');
  const restrictedSection = sections.find((section) => section.key === 'restricted_funds');
  const bankSection = sections.find((section) => section.key === 'bank_reconciliation');
  const giftAidSection = sections.find((section) => section.key === 'gift_aid');
  const supplierSection = sections.find((section) => section.key === 'supplier_spend');
  const payrollSection = sections.find((section) => section.key === 'payroll_summary');
  const lettingsSection = sections.find((section) => section.key === 'lettings_income');

  const metricValue = (section: TrusteePackSection | undefined, label: string) => {
    const raw = section?.metrics.find((metric) => metric.label === label)?.value ?? '0';
    return Number(raw.replace(/[^0-9.-]/g, '')) * 100;
  };

  return {
    periodLabel: 'Selected period',
    currentIncomePence: metricValue(incomeSection, 'Income'),
    currentExpensePence: metricValue(incomeSection, 'Expenditure'),
    budgetVariancePence: metricValue(budgetSection, 'Variance'),
    restrictedFundsRemainingPence: metricValue(restrictedSection, 'Restricted funds'),
    unreconciledBankTransactions: Number(bankSection?.metrics.find((metric) => metric.label === 'Unreconciled items')?.value ?? 0),
    giftAidOutstandingPence: metricValue(giftAidSection, 'Outstanding Gift Aid'),
    supplierSpendPence: metricValue(supplierSection, 'Largest supplier'),
    payrollCostPence: metricValue(payrollSection, 'Payroll cost'),
    lettingsIncomePence: metricValue(lettingsSection, 'Lettings income'),
  };
}
