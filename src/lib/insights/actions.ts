'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveOrg } from '@/lib/org';
import { logAuditEvent } from '@/lib/audit';
import { assertWriteAllowed } from '@/lib/demo';
import { getBankReconciliationSummaryReport } from '@/lib/reports/summaryReports';
import { getDashboardOverview } from '@/lib/reports/dashboard';
import { getTrusteeSnapshot } from '@/lib/reports/actions';
import { buildHealthIndicators } from './indicators';
import { detectInsightAnomalies } from './anomalies';
import { buildNarrativeSummaries } from './narratives';
import { buildMonthEndChecklist, buildMonthLabel, deriveReviewMonth } from './monthEnd';
import type { InsightSnapshot, InsightOperationalMetrics } from './types';

function canManageMonthEnd(role: string): boolean {
  return role === 'admin' || role === 'treasurer' || role === 'finance_user';
}

async function loadInsightMetrics(organisationId: string): Promise<{
  currentDate: string;
  latestPostedJournalDate: string | null;
  operational: InsightOperationalMetrics;
}> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    latestPostedJournalRes,
    draftJournalsRes,
    overdueBillsRes,
    unpaidBillsRes,
    pendingInvoicesRes,
    pendingExpensesRes,
    cashSpendsMissingReceiptsRes,
    approvedExpensesMissingReceiptsRes,
    draftPaymentRunsRes,
    draftPayrollRunsRes,
    draftBudgetsRes,
    overspentFundsRes,
    giftAidOpportunityRes,
  ] = await Promise.all([
    supabase
      .from('journals')
      .select('journal_date')
      .eq('organisation_id', organisationId)
      .eq('status', 'posted')
      .order('journal_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('journals')
      .select('*', { count: 'exact', head: true })
      .eq('organisation_id', organisationId)
      .eq('status', 'draft'),
    supabase
      .from('bills')
      .select('*', { count: 'exact', head: true })
      .eq('organisation_id', organisationId)
      .in('status', ['approved', 'posted'])
      .lt('due_date', today),
    supabase
      .from('bills')
      .select('*', { count: 'exact', head: true })
      .eq('organisation_id', organisationId)
      .in('status', ['approved', 'posted']),
    supabase
      .from('invoice_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('organisation_id', organisationId)
      .eq('status', 'pending'),
    supabase
      .from('expense_requests')
      .select('*', { count: 'exact', head: true })
      .eq('organisation_id', organisationId)
      .eq('status', 'pending'),
    supabase
      .from('cash_spends')
      .select('*', { count: 'exact', head: true })
      .eq('organisation_id', organisationId)
      .eq('status', 'posted')
      .is('receipt_url', null),
    supabase
      .from('expense_requests')
      .select('*', { count: 'exact', head: true })
      .eq('organisation_id', organisationId)
      .in('status', ['approved', 'converted'])
      .is('receipt_url', null),
    supabase
      .from('payment_runs')
      .select('*', { count: 'exact', head: true })
      .eq('organisation_id', organisationId)
      .eq('status', 'draft'),
    supabase
      .from('payroll_runs')
      .select('*', { count: 'exact', head: true })
      .eq('organisation_id', organisationId)
      .eq('status', 'draft'),
    supabase
      .from('budgets')
      .select('*', { count: 'exact', head: true })
      .eq('organisation_id', organisationId)
      .eq('status', 'draft'),
    supabase
      .from('funds')
      .select('id, name')
      .eq('organisation_id', organisationId)
      .eq('type', 'restricted')
      .eq('is_active', true),
    supabase
      .from('donations')
      .select('id')
      .eq('organisation_id', organisationId)
      .eq('status', 'posted')
      .is('gift_aid_claim_id', null)
      .limit(1),
  ]);

  let overspentRestrictedFunds = 0;
  if ((overspentFundsRes.data ?? []).length > 0) {
    const { data: fundBalances } = await supabase
      .from('journal_lines')
      .select('fund_id, debit_pence, credit_pence')
      .eq('organisation_id', organisationId)
      .in(
        'fund_id',
        (overspentFundsRes.data ?? []).map((fund) => fund.id),
      );

    const balanceByFund: Record<string, number> = {};
    for (const line of fundBalances ?? []) {
      if (!line.fund_id) continue;
      balanceByFund[line.fund_id] =
        (balanceByFund[line.fund_id] ?? 0) +
        Number(line.debit_pence ?? 0) -
        Number(line.credit_pence ?? 0);
    }

    overspentRestrictedFunds = (overspentFundsRes.data ?? []).filter(
      (fund) => (balanceByFund[fund.id] ?? 0) > 0,
    ).length;
  }

  const overdueBills = overdueBillsRes.count ?? 0;
  const unpaidBills = Math.max((unpaidBillsRes.count ?? 0) - overdueBills, 0);

  return {
    currentDate: today,
    latestPostedJournalDate: latestPostedJournalRes.data?.journal_date ?? null,
    operational: {
      overdueBills,
      unpaidBills,
      pendingInvoices: pendingInvoicesRes.count ?? 0,
      pendingExpenses: pendingExpensesRes.count ?? 0,
      draftJournals: draftJournalsRes.count ?? 0,
      draftBudgets: draftBudgetsRes.count ?? 0,
      unallocatedBankLines: 0,
      cashSpendsMissingReceipts: cashSpendsMissingReceiptsRes.count ?? 0,
      approvedExpensesMissingReceipts: approvedExpensesMissingReceiptsRes.count ?? 0,
      draftPaymentRuns: draftPaymentRunsRes.count ?? 0,
      draftPayrollRuns: draftPayrollRunsRes.count ?? 0,
      overspentRestrictedFunds,
      giftAidClaimsAvailable: (giftAidOpportunityRes.data?.length ?? 0) > 0,
    },
  };
}

async function getMonthEndReviewRow(params: {
  organisationId: string;
  reviewMonth: string;
}) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('month_end_reviews')
    .select('id, completed_step_keys, completed_at, notes')
    .eq('organisation_id', params.organisationId)
    .eq('review_month', params.reviewMonth)
    .maybeSingle();

  return data;
}

export async function getInsightSnapshot(params: {
  organisationId: string;
  period: 'this_month' | 'last_month' | 'ytd';
  reviewMonth?: string;
}): Promise<{ data: InsightSnapshot | null; error: string | null }> {
  const { orgId } = await getActiveOrg();
  if (params.organisationId !== orgId) {
    return { data: null, error: 'Organisation context mismatch.' };
  }

  const reviewMonth = params.reviewMonth ?? deriveReviewMonth(new Date().toISOString().slice(0, 10));
  const monthKey = reviewMonth.slice(0, 7);

  const [dashboardRes, bankRes, trusteeRes, metrics] = await Promise.all([
    getDashboardOverview({
      orgId: params.organisationId,
      period: params.period,
      visibleWidgets: [
        'cash-position',
        'fund-balances',
        'budget-vs-actual',
        'gift-aid-summary',
        'payroll-summary',
      ],
    }),
    getBankReconciliationSummaryReport({
      organisationId: params.organisationId,
    }),
    getTrusteeSnapshot({
      organisationId: params.organisationId,
    }),
    loadInsightMetrics(params.organisationId),
  ]);

  if (dashboardRes.error || !dashboardRes.data) {
    return { data: null, error: dashboardRes.error ?? 'Unable to load dashboard data.' };
  }
  if (bankRes.error || !bankRes.data) {
    return { data: null, error: bankRes.error ?? 'Unable to load reconciliation summary.' };
  }
  if (trusteeRes.error || !trusteeRes.data) {
    return { data: null, error: trusteeRes.error ?? 'Unable to load trustee snapshot.' };
  }

  metrics.operational.unallocatedBankLines = bankRes.data.totals.unreconciledLines;
  const reviewRow = await getMonthEndReviewRow({
    organisationId: params.organisationId,
    reviewMonth,
  });

  const inputs = {
    periodLabel: dashboardRes.data.periodLabel,
    currentDate: metrics.currentDate,
    latestPostedJournalDate: metrics.latestPostedJournalDate,
    dashboard: {
      incomePence: dashboardRes.data.totals.incomePence,
      expensePence: dashboardRes.data.totals.expensePence,
      netPence: dashboardRes.data.totals.netPence,
      priorIncomePence: dashboardRes.data.priorPeriodTotals?.incomePence ?? null,
      priorExpensePence: dashboardRes.data.priorPeriodTotals?.expensePence ?? null,
      budgetVariancePence: dashboardRes.data.budgetVsActual?.variancePence ?? null,
      budgetVariancePct: dashboardRes.data.budgetVsActual?.variancePct ?? null,
      giftAidOutstandingPence: dashboardRes.data.giftAidSummary?.outstandingPence ?? 0,
      donorsMissingDeclarations: dashboardRes.data.giftAidSummary?.donorsMissingDeclarations ?? 0,
    },
    bank: {
      unreconciledLines: bankRes.data.totals.unreconciledLines,
      differencePence: bankRes.data.totals.differencePence,
      balancedAccountCount: bankRes.data.rows.filter((row) => row.isBalanced).length,
      totalAccountCount: bankRes.data.rows.length,
    },
    trustee: {
      cashTotal: trusteeRes.data.cash.total,
      restrictedFundsTotal: trusteeRes.data.funds.restrictedTotal,
      forecastRiskLevel: trusteeRes.data.forecast.riskLevel,
    },
    operational: metrics.operational,
    monthEnd: {
      monthLabel: buildMonthLabel(reviewMonth),
      monthKey,
      reviewMonth,
      completedStepKeys: reviewRow?.completed_step_keys ?? [],
      reportsGenerated: (reviewRow?.completed_step_keys ?? []).includes('generate_reports'),
      reviewCompletedAt: reviewRow?.completed_at ?? null,
    },
  } satisfies Parameters<typeof buildMonthEndChecklist>[0];

  const monthEnd = buildMonthEndChecklist(inputs);
  const indicators = buildHealthIndicators(inputs, monthEnd);
  const anomalies = detectInsightAnomalies(inputs);
  const narratives = buildNarrativeSummaries(inputs, anomalies);

  return {
    data: {
      generatedAt: new Date().toISOString(),
      periodLabel: dashboardRes.data.periodLabel,
      indicators,
      anomalies,
      narratives,
      monthEnd,
    },
    error: null,
  };
}

export async function toggleMonthEndStep(params: {
  reviewMonth: string;
  stepKey: string;
  complete: boolean;
}): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  if (!canManageMonthEnd(role)) {
    return { error: 'Only finance users, treasurers, or admins can update month-end progress.' };
  }

  const supabase = await createClient();
  const existing = await getMonthEndReviewRow({
    organisationId: orgId,
    reviewMonth: params.reviewMonth,
  });

  const nextKeys = new Set<string>(existing?.completed_step_keys ?? []);
  if (params.complete) {
    nextKeys.add(params.stepKey);
  } else {
    nextKeys.delete(params.stepKey);
  }

  const { error } = await supabase.from('month_end_reviews').upsert(
    {
      organisation_id: orgId,
      review_month: params.reviewMonth,
      completed_step_keys: [...nextKeys],
      created_by: existing?.id ? undefined : user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organisation_id,review_month' },
  );

  if (!error) {
    await logAuditEvent({
      orgId,
      userId: user.id,
      action: params.complete ? 'complete_month_end_step' : 'reopen_month_end_step',
      entityType: 'month_end_review',
      entityId: params.reviewMonth,
      metadata: { stepKey: params.stepKey },
    });
    revalidatePath('/month-end');
  }

  return { error: error?.message ?? null };
}

export async function completeMonthEndReview(params: {
  reviewMonth: string;
}): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  if (!canManageMonthEnd(role)) {
    return { error: 'Only finance users, treasurers, or admins can complete month-end review.' };
  }

  const snapshotRes = await getInsightSnapshot({
    organisationId: orgId,
    period: 'this_month',
    reviewMonth: params.reviewMonth,
  });

  if (!snapshotRes.data) {
    return { error: snapshotRes.error ?? 'Unable to validate month-end review.' };
  }

  const incompleteCoreSteps = snapshotRes.data.monthEnd.steps.filter(
    (step) => step.key !== 'mark_review_complete' && step.status !== 'complete',
  );
  if (incompleteCoreSteps.length > 0) {
    return { error: 'Complete all prior month-end steps before final sign-off.' };
  }

  const supabase = await createClient();
  const existing = await getMonthEndReviewRow({
    organisationId: orgId,
    reviewMonth: params.reviewMonth,
  });
  const nextKeys = new Set<string>(existing?.completed_step_keys ?? []);
  nextKeys.add('mark_review_complete');
  nextKeys.add('generate_reports');

  const { error } = await supabase.from('month_end_reviews').upsert(
    {
      organisation_id: orgId,
      review_month: params.reviewMonth,
      completed_step_keys: [...nextKeys],
      completed_by: user.id,
      completed_at: new Date().toISOString(),
      created_by: existing?.id ? undefined : user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organisation_id,review_month' },
  );

  if (!error) {
    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'complete_month_end_review',
      entityType: 'month_end_review',
      entityId: params.reviewMonth,
    });
    revalidatePath('/month-end');
  }

  return { error: error?.message ?? null };
}
