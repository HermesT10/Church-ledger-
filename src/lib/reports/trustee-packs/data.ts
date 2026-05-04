import 'server-only';

import { getActiveOrg } from '@/lib/org';
import { getDashboardOverview } from '@/lib/reports/dashboard';
import {
  getAGMReport,
  getBudgetVsActualReport,
  getQuarterlyReport,
  getTrusteeSnapshot,
} from '@/lib/reports/actions';
import { getSupplierSpendReport } from '@/lib/reports/glReports';
import {
  getBankReconciliationSummaryReport,
  getGiftAidSummaryReport,
  getLeadershipSnapshotReport,
} from '@/lib/reports/summaryReports';
import { formatCurrencyFromPence } from '@/lib/reports/framework';
import { TRUSTEE_PACK_GLOSSARY } from './glossary';
import { generateFinancialCommentary } from './commentary';
import type {
  TrusteePack,
  TrusteePackAction,
  TrusteePackChart,
  TrusteePackKpi,
  TrusteePackMetric,
  TrusteePackSection,
  TrusteePackSectionKey,
  TrusteePackType,
} from './types';

const DEFAULT_WIDGETS = [
  'cash-position',
  'fund-balances',
  'budget-vs-actual',
  'gift-aid-summary',
  'recent-transactions',
  'supplier-spend',
  'payroll-summary',
];

const PACK_TITLES: Record<TrusteePackType, string> = {
  monthly_dashboard: 'Monthly Trustee Dashboard Pack',
  trustee_snapshot: 'Trustee Snapshot Pack',
  leadership_snapshot: 'Leadership Snapshot Pack',
  quarterly: 'Quarterly Trustee Pack',
  agm: 'AGM Trustee Pack',
};

function money(pence: number) {
  return formatCurrencyFromPence(Math.round(pence));
}

function section(params: {
  key: TrusteePackSectionKey;
  title: string;
  description: string;
  metrics?: TrusteePackMetric[];
  narrative?: string[];
  table?: TrusteePackSection['table'];
  charts?: TrusteePackChart[];
  sourceRefs?: string[];
  status?: TrusteePackSection['status'];
}): TrusteePackSection {
  const hasContent =
    (params.metrics?.length ?? 0) > 0 ||
    (params.narrative?.length ?? 0) > 0 ||
    (params.table?.rows.length ?? 0) > 0 ||
    (params.charts?.some((chart) => chart.data.length > 0) ?? false);
  return {
    key: params.key,
    title: params.title,
    description: params.description,
    status: params.status ?? (hasContent ? 'populated' : 'empty'),
    metrics: params.metrics ?? [],
    narrative: params.narrative ?? [],
    table: params.table,
    charts: params.charts ?? [],
    sourceRefs: params.sourceRefs ?? [],
  };
}

function chart(type: TrusteePackChart['type'], title: string, description: string, data: TrusteePackChart['data']): TrusteePackChart {
  return {
    type,
    title,
    description,
    data,
    emptyState: 'No chart data is available for this section yet.',
  };
}

function packPeriod(year: number) {
  return { periodStart: `${year}-01-01`, periodEnd: `${year}-12-31` };
}

export async function buildTrusteeReportingPack(params: {
  type: TrusteePackType;
  year?: number;
  period?: 'this_month' | 'last_month' | 'ytd';
}): Promise<{ data: TrusteePack | null; error: string | null }> {
  const { orgId, user } = await getActiveOrg();
  const year = params.year ?? new Date().getFullYear();
  const period = params.period ?? 'this_month';
  const { periodStart, periodEnd } = packPeriod(year);

  const [
    dashboardRes,
    trusteeRes,
    leadershipRes,
    quarterlyRes,
    agmRes,
    budgetRes,
    bankRes,
    giftAidRes,
    supplierRes,
  ] = await Promise.all([
    getDashboardOverview({ orgId, period, visibleWidgets: DEFAULT_WIDGETS }),
    getTrusteeSnapshot({ organisationId: orgId }),
    getLeadershipSnapshotReport({ organisationId: orgId, period }),
    getQuarterlyReport({ organisationId: orgId, year }),
    getAGMReport({ organisationId: orgId, year }),
    getBudgetVsActualReport({ orgId, year }),
    getBankReconciliationSummaryReport({ organisationId: orgId }),
    getGiftAidSummaryReport({ organisationId: orgId }),
    getSupplierSpendReport({ year }),
  ]);

  const dashboard = dashboardRes.data;
  const trustee = trusteeRes.data;
  const leadership = leadershipRes.data;
  const quarterly = quarterlyRes.data;
  const agm = agmRes.data;
  const budget = budgetRes.data;
  const bank = bankRes.data;
  const giftAid = giftAidRes.data;
  const supplier = supplierRes.data;

  if (!dashboard && !trustee && !agm && !quarterly) {
    return { data: null, error: dashboardRes.error ?? trusteeRes.error ?? agmRes.error ?? quarterlyRes.error ?? 'Unable to build trustee pack.' };
  }

  const incomePence =
    dashboard?.totals.incomePence ??
    agm?.totalIncomePence ??
    trustee?.incomeExpenditure.ytd.income ??
    quarterly?.annualTotal.incomeTotal ??
    0;
  const expensePence =
    dashboard?.totals.expensePence ??
    agm?.totalExpensePence ??
    trustee?.incomeExpenditure.ytd.expense ??
    quarterly?.annualTotal.expenseTotal ??
    0;
  const netPence = incomePence - expensePence;
  const restrictedPence =
    trustee?.funds.restrictedTotal ??
    dashboard?.fundBalances?.filter((fund) => fund.fundType === 'restricted').reduce((sum, fund) => sum + fund.balancePence, 0) ??
    agm?.restrictedFunds.reduce((sum, fund) => sum + fund.balancePence, 0) ??
    0;
  const cashPence = trustee?.cash.total ?? dashboard?.cashPosition?.reduce((sum, row) => sum + row.glBalancePence, 0) ?? 0;
  const budgetVariancePence = dashboard?.budgetVsActual?.variancePence ?? budget?.totals.ytd.variance ?? 0;
  const topSupplier = dashboard?.supplierSpend?.[0] ?? supplier?.rows[0] ?? null;
  const payrollCostPence = dashboard?.payrollSummary?.grossPence ?? 0;
  const giftAidOutstandingPence = dashboard?.giftAidSummary?.outstandingPence ?? giftAid?.dashboard.outstandingReclaimPence ?? 0;
  const unreconciledItems = bank?.totals.unreconciledLines ?? 0;

  const kpis: TrusteePackKpi[] = [
    { label: 'Income', value: money(incomePence), helper: 'Posted income for the reporting period.', tone: 'positive', source: 'income_expenditure' },
    { label: 'Expenditure', value: money(expensePence), helper: 'Posted expenditure for the reporting period.', tone: 'neutral', source: 'income_expenditure' },
    { label: 'Net position', value: money(netPence), helper: 'Income less expenditure.', tone: netPence >= 0 ? 'positive' : 'critical', source: 'income_expenditure' },
    { label: 'Cash', value: money(cashPence), helper: 'Cash and bank balances visible to this pack.', tone: 'neutral', source: 'cash_position' },
  ];

  const actions: TrusteePackAction[] = [
    ...(leadership?.recommendedActions.map((body, index) => ({
      id: `leadership-action-${index + 1}`,
      title: 'Recommended trustee action',
      body,
      priority: body.toLowerCase().includes('investigate') || body.toLowerCase().includes('review') ? 'high' as const : 'medium' as const,
      source: 'leadership_snapshot',
    })) ?? []),
    ...(unreconciledItems > 0 ? [{
      id: 'reconcile-bank-items',
      title: 'Review unreconciled bank transactions',
      body: `${unreconciledItems} bank transactions need reconciliation before trustees rely on cash totals.`,
      priority: 'high' as const,
      source: 'bank_reconciliation',
    }] : []),
  ];

  if (actions.length === 0) {
    actions.push({
      id: 'no-immediate-action',
      title: 'No immediate action flagged',
      body: 'Continue normal review, reconciliation, and trustee reporting cadence.',
      priority: 'low',
      source: 'pack_composer',
    });
  }

  const incomeExpenseChart = chart(
    'income_vs_expenses',
    'Income vs expenses',
    'Compares income and expenditure across the selected period.',
    dashboard?.series.map((point) => ({ label: point.dateLabel, value: point.income, secondaryValue: point.expense })) ??
      quarterly?.quarters.map((quarter) => ({ label: quarter.quarter, value: quarter.incomeTotal, secondaryValue: quarter.expenseTotal })) ??
      [{ label: 'Current', value: incomePence, secondaryValue: expensePence }],
  );

  const sections: TrusteePackSection[] = [
    section({
      key: 'cover',
      title: PACK_TITLES[params.type],
      description: `${PACK_TITLES[params.type]} for ${dashboard?.periodLabel ?? year}.`,
      narrative: [`Generated for trustee and leadership review on ${new Date().toLocaleDateString('en-GB')}.`],
      sourceRefs: ['pack_composer'],
    }),
    section({
      key: 'executive_summary',
      title: 'Executive summary',
      description: 'Plain-English financial overview for trustees.',
      narrative: [
        leadership?.plainEnglishSummary ??
          `${dashboard?.orgName ?? 'The organisation'} reports a net position of ${money(netPence)} for ${dashboard?.periodLabel ?? year}.`,
      ],
      sourceRefs: ['leadership_snapshot', 'dashboard'],
    }),
    section({
      key: 'key_financial_kpis',
      title: 'Key financial KPIs',
      description: 'The core financial indicators trustees need first.',
      metrics: kpis,
      sourceRefs: ['dashboard', 'trustee_snapshot'],
    }),
    section({
      key: 'income_expenditure',
      title: 'Income and expenditure summary',
      description: 'Summary of income, expenditure and net position.',
      metrics: [
        { label: 'Income', value: money(incomePence), tone: 'positive' },
        { label: 'Expenditure', value: money(expensePence), tone: 'neutral' },
        { label: 'Net position', value: money(netPence), tone: netPence >= 0 ? 'positive' : 'critical' },
      ],
      charts: [
        incomeExpenseChart,
        chart(
          'top_expense_categories',
          'Top expense categories',
          'Largest expense categories in the reporting period.',
          dashboard?.expenseBreakdown.slice(0, 5).map((item) => ({ label: item.name, value: item.amountPence })) ?? [],
        ),
      ],
      table: {
        headers: ['Line', 'Amount'],
        rows: [['Income', money(incomePence)], ['Expenditure', money(expensePence)], ['Net position', money(netPence)]],
      },
      sourceRefs: ['income_expenditure'],
    }),
    section({
      key: 'budget_vs_actual',
      title: 'Budget vs actual',
      description: 'Shows whether activity is above or below budget.',
      metrics: [
        { label: 'Budget', value: money(dashboard?.budgetVsActual?.totalBudgetPence ?? budget?.totals.ytd.budget ?? 0) },
        { label: 'Actual', value: money(dashboard?.budgetVsActual?.totalActualPence ?? budget?.totals.ytd.actual ?? 0) },
        { label: 'Variance', value: money(budgetVariancePence), tone: budgetVariancePence > 0 ? 'caution' : 'positive' },
      ],
      charts: [chart('budget_variance', 'Budget variance', 'Budget compared with actual activity.', [
        { label: 'Budget', value: dashboard?.budgetVsActual?.totalBudgetPence ?? budget?.totals.ytd.budget ?? 0 },
        { label: 'Actual', value: dashboard?.budgetVsActual?.totalActualPence ?? budget?.totals.ytd.actual ?? 0 },
      ])],
      sourceRefs: ['budget_vs_actual'],
    }),
    section({
      key: 'restricted_funds',
      title: 'Restricted funds summary',
      description: 'Money that must be used for donor or grant-specified purposes.',
      metrics: [{ label: 'Restricted funds', value: money(restrictedPence), tone: restrictedPence >= 0 ? 'neutral' : 'critical' }],
      table: {
        headers: ['Fund', 'Balance'],
        rows:
          agm?.restrictedFunds.map((fund) => [fund.fundName, money(fund.balancePence)]) ??
          dashboard?.fundBalances?.filter((fund) => fund.fundType === 'restricted').map((fund) => [fund.fundName, money(fund.balancePence)]) ??
          [],
      },
      charts: [chart('restricted_funds_remaining', 'Restricted funds remaining', 'Closing balances for restricted funds.', [
        { label: 'Restricted', value: restrictedPence },
      ])],
      sourceRefs: ['fund_movements'],
    }),
    section({
      key: 'cash_position',
      title: 'Cash position',
      description: 'Cash and bank balances available in the snapshot.',
      metrics: [{ label: 'Cash', value: money(cashPence), tone: 'neutral' }],
      table: {
        headers: ['Account', 'Balance'],
        rows:
          trustee?.cash.items.map((item) => [item.accountName, money(item.balance)]) ??
          dashboard?.cashPosition?.map((item) => [item.bankAccountName, money(item.glBalancePence)]) ??
          [],
      },
      charts: [chart('cash_trend', 'Cash trend', 'Cash movement where period data exists.', [{ label: 'Cash', value: cashPence }])],
      sourceRefs: ['cash_position'],
    }),
    section({
      key: 'bank_reconciliation',
      title: 'Bank reconciliation status',
      description: 'Checks whether bank and ledger records agree.',
      metrics: [
        { label: 'Unreconciled items', value: String(unreconciledItems), tone: unreconciledItems > 0 ? 'caution' : 'positive' },
        { label: 'Difference', value: money(bank?.totals.differencePence ?? 0), tone: (bank?.totals.differencePence ?? 0) === 0 ? 'positive' : 'caution' },
      ],
      table: {
        headers: ['Bank account', 'Unreconciled', 'Difference'],
        rows: bank?.rows.map((row) => [row.bankAccountName, String(row.unreconciledLines), money(row.differencePence)]) ?? [],
      },
      sourceRefs: ['bank_reconciliation'],
    }),
    section({
      key: 'gift_aid',
      title: 'Gift Aid status',
      description: 'Gift Aid claims, outstanding reclaim and declaration follow-up.',
      metrics: [
        { label: 'Outstanding Gift Aid', value: money(giftAidOutstandingPence), tone: giftAidOutstandingPence > 0 ? 'caution' : 'positive' },
        { label: 'Missing declarations', value: String(dashboard?.giftAidSummary?.donorsMissingDeclarations ?? giftAid?.dashboard.missingDeclarationCount ?? 0), tone: 'caution' },
      ],
      sourceRefs: ['gift_aid'],
    }),
    section({
      key: 'lettings_income',
      title: 'Lettings income',
      description: 'Lettings income is included when the lettings module has matching activity.',
      metrics: [{ label: 'Lettings income', value: money(0), tone: 'neutral' }],
      narrative: ['No lettings income data is currently embedded in this pack composer.'],
      status: 'empty',
      sourceRefs: ['lettings'],
    }),
    section({
      key: 'supplier_spend',
      title: 'Supplier spend highlights',
      description: 'Highlights supplier concentration and major spend.',
      metrics: [{ label: 'Largest supplier', value: money(topSupplier?.totalPence ?? 0), helper: topSupplier?.supplierName ?? 'No supplier spend found' }],
      table: {
        headers: ['Supplier', 'Spend'],
        rows: (dashboard?.supplierSpend ?? supplier?.rows ?? []).slice(0, 5).map((row) => [row.supplierName, money(row.totalPence)]),
      },
      charts: [chart('supplier_spend', 'Supplier spend', 'Top supplier spend in the reporting period.', (dashboard?.supplierSpend ?? supplier?.rows ?? []).slice(0, 5).map((row) => ({ label: row.supplierName, value: row.totalPence })))],
      sourceRefs: ['supplier_spend'],
    }),
    section({
      key: 'payroll_summary',
      title: 'Payroll summary',
      description: 'Payroll activity where applicable.',
      metrics: [{ label: 'Payroll cost', value: money(payrollCostPence), helper: dashboard?.payrollSummary?.status ?? 'No payroll activity found' }],
      status: payrollCostPence > 0 ? 'populated' : 'not_applicable',
      sourceRefs: ['payroll'],
    }),
    section({
      key: 'risks_alerts',
      title: 'Risks and alerts',
      description: 'Items trustees should understand before approving or relying on the pack.',
      narrative: [
        ...(dashboard?.todoItems.map((todo) => todo.label) ?? []),
        ...(trustee?.forecast.riskLevel === 'AT_RISK' ? ['Forecast is currently marked at risk.'] : []),
      ],
      sourceRefs: ['dashboard', 'forecast'],
    }),
    section({
      key: 'recommended_actions',
      title: 'Recommended trustee actions',
      description: 'Action-oriented follow-up for trustees and leadership.',
      narrative: actions.map((action) => action.body),
      sourceRefs: ['leadership_snapshot', 'pack_composer'],
    }),
    section({
      key: 'appendices',
      title: 'Appendices',
      description: 'Supporting schedules, glossary definitions and source report references.',
      table: {
        headers: ['Appendix', 'Source'],
        rows: [
          ['Glossary', 'trustee_pack_glossary'],
          ['Dashboard data', 'dashboard'],
          ['Trustee snapshot', 'trustee_snapshot'],
          ['Bank reconciliation', 'bank_reconciliation'],
          ['Gift Aid', 'gift_aid'],
        ],
      },
      sourceRefs: ['appendices'],
    }),
  ];

  const commentary = generateFinancialCommentary({
    periodLabel: dashboard?.periodLabel ?? String(year),
    currentIncomePence: incomePence,
    currentExpensePence: expensePence,
    priorIncomePence: dashboard?.priorPeriodTotals?.incomePence ?? null,
    priorExpensePence: dashboard?.priorPeriodTotals?.expensePence ?? null,
    budgetVariancePence,
    topBudgetVarianceLabel: 'Overall budget',
    restrictedFundsRemainingPence: restrictedPence,
    unreconciledBankTransactions: unreconciledItems,
    giftAidOutstandingPence,
    supplierSpendPence: topSupplier?.totalPence ?? null,
    topSupplierName: topSupplier?.supplierName ?? null,
    payrollCostPence,
    lettingsIncomePence: 0,
  });

  return {
    data: {
      id: crypto.randomUUID(),
      type: params.type,
      reportType: params.type,
      title: PACK_TITLES[params.type],
      periodLabel: dashboard?.periodLabel ?? String(year),
      periodStart,
      periodEnd,
      generatedAt: new Date().toISOString(),
      generatedBy: user.email ?? user.id,
      sections,
      kpis,
      commentary,
      definitions: TRUSTEE_PACK_GLOSSARY,
      actions,
      approval: {
        status: 'draft',
        preparedBy: user.id,
        reviewedBy: null,
        approvedBy: null,
        approvedByName: null,
        approvedAt: null,
        trusteeReviewNotes: [],
        internalComments: [],
      },
      exports: [
        { format: 'pdf', label: 'PDF pack', description: 'Trustee-ready PDF pack.', requiresApproval: true },
        { format: 'docx', label: 'Word pack', description: 'Editable Word pack for review.', requiresApproval: false },
        { format: 'excel', label: 'Excel appendix', description: 'Supporting schedules workbook.', requiresApproval: false },
      ],
      sourceReports: {
        dashboard,
        trustee,
        leadership,
        quarterly,
        agm,
        budget,
        bank,
        giftAid,
        supplier,
      },
    },
    error: null,
  };
}
