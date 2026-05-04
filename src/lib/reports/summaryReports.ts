'use server';

import { createClient } from '@/lib/supabase/server';
import { getGiftAidDashboard } from '@/lib/giftaid/actions';
import { getBankGLBalance, getReconciliationHistory, getUnreconciledBankLines } from '@/lib/reconciliation/actions';
import { getDashboardOverview } from './dashboard';
import { getTrusteeSnapshot } from './actions';
import type {
  SBankReconciliationRow,
  SBankReconciliationSummaryReport,
  SGiftAidSummaryClaim,
  SGiftAidSummaryReport,
  SLeadershipSnapshotReport,
} from './types';

export async function getGiftAidSummaryReport(params: {
  organisationId: string;
}): Promise<{ data: SGiftAidSummaryReport | null; error: string | null }> {
  const supabase = await createClient();
  const { data: dashboard, error } = await getGiftAidDashboard(params.organisationId);

  if (error || !dashboard) {
    return { data: null, error: error ?? 'Unable to load Gift Aid summary.' };
  }

  const { data: claims, error: claimsError } = await supabase
    .from('gift_aid_claims')
    .select('id, reference, status, claim_start, claim_end, total_gift_aid_pence, total_donations_pence, created_at')
    .eq('organisation_id', params.organisationId)
    .order('created_at', { ascending: false })
    .limit(8);

  if (claimsError) {
    return { data: null, error: claimsError.message };
  }

  const recentClaims: SGiftAidSummaryClaim[] = (claims ?? []).map((claim) => ({
    claimId: claim.id,
    reference: claim.reference,
    status: claim.status,
    claimStart: claim.claim_start,
    claimEnd: claim.claim_end,
    totalGiftAidPence: Number(claim.total_gift_aid_pence ?? 0),
    totalDonationsPence: Number(claim.total_donations_pence ?? 0),
    createdAt: claim.created_at,
  }));

  const [
    { count: eligibleDonationsCount, error: eligibleDonationsError },
    { count: missingDeclarationCount, error: missingDeclarationError },
  ] = await Promise.all([
    supabase
      .from('donations')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', params.organisationId)
      .eq('status', 'posted')
      .eq('gift_aid_eligible', true)
      .is('gift_aid_claim_id', null),
    supabase
      .from('donations')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', params.organisationId)
      .eq('status', 'posted')
      .in('gift_aid_status', ['matched_no_declaration']),
  ]);

  if (eligibleDonationsError) {
    return { data: null, error: eligibleDonationsError.message };
  }
  if (missingDeclarationError) {
    return { data: null, error: missingDeclarationError.message };
  }

  const recentBatchDonationPence = recentClaims.reduce(
    (sum, claim) => sum + claim.totalDonationsPence,
    0
  );
  const recentBatchGiftAidPence = recentClaims.reduce(
    (sum, claim) => sum + claim.totalGiftAidPence,
    0
  );

  return {
    data: {
      generatedAt: new Date().toISOString(),
      dashboard: {
        eligibleDonationsCount: eligibleDonationsCount ?? 0,
        estimatedReclaimThisYearPence: dashboard.estimatedReclaimThisYearPence,
        claimedAmountPence: dashboard.claimedAmountPence,
        unclaimedAmountPence: dashboard.estimatedReclaimThisYearPence,
        outstandingReclaimPence: dashboard.outstandingReclaimPence,
        paidAmountPence: dashboard.paidAmountPence,
        missingDeclarationCount: missingDeclarationCount ?? 0,
        donationsExcluded: dashboard.donationsExcluded,
        recentBatchCount: recentClaims.length,
        recentBatchDonationPence,
        recentBatchGiftAidPence,
      },
      recentClaims,
    },
    error: null,
  };
}

export async function getBankReconciliationSummaryReport(params: {
  organisationId: string;
}): Promise<{ data: SBankReconciliationSummaryReport | null; error: string | null }> {
  const supabase = await createClient();
  const { data: bankAccounts, error } = await supabase
    .from('bank_accounts')
    .select('id, name')
    .eq('organisation_id', params.organisationId)
    .eq('is_active', true)
    .order('name');

  if (error) {
    return { data: null, error: error.message };
  }

  const rows = await Promise.all(
    (bankAccounts ?? []).map(async (bankAccount): Promise<SBankReconciliationRow> => {
      const [glRes, historyRes, unreconciledRes] = await Promise.all([
        getBankGLBalance(bankAccount.id),
        getReconciliationHistory(bankAccount.id),
        getUnreconciledBankLines(bankAccount.id),
      ]);

      const latest = historyRes.data[0] ?? null;
      const statementBalancePence = latest?.statement_closing_balance_pence ?? glRes.data?.statementBalancePence ?? null;
      const differencePence =
        statementBalancePence === null
          ? 0
          : statementBalancePence - (glRes.data?.glBalancePence ?? 0);

      return {
        bankAccountId: bankAccount.id,
        bankAccountName: bankAccount.name,
        lastStatementDate: latest?.statement_date ?? null,
        lastReconciliationId: latest?.id ?? null,
        statementBalancePence,
        glBalancePence: glRes.data?.glBalancePence ?? 0,
        differencePence,
        unreconciledLines: unreconciledRes.data.length,
        isBalanced: statementBalancePence !== null ? differencePence === 0 : true,
      };
    }),
  );

  return {
    data: {
      asOfDate: new Date().toISOString().slice(0, 10),
      rows,
      totals: {
        statementBalancePence: rows.reduce(
          (sum, row) => sum + (row.statementBalancePence ?? 0),
          0,
        ),
        glBalancePence: rows.reduce((sum, row) => sum + row.glBalancePence, 0),
        differencePence: rows.reduce((sum, row) => sum + row.differencePence, 0),
        unreconciledLines: rows.reduce((sum, row) => sum + row.unreconciledLines, 0),
      },
    },
    error: null,
  };
}

export async function getLeadershipSnapshotReport(params: {
  organisationId: string;
  period: 'this_month' | 'last_month' | 'ytd';
}): Promise<{ data: SLeadershipSnapshotReport | null; error: string | null }> {
  const [snapshotRes, dashboardRes] = await Promise.all([
    getTrusteeSnapshot({ organisationId: params.organisationId }),
    getDashboardOverview({
      orgId: params.organisationId,
      period: params.period,
      visibleWidgets: [
        'cash-position',
        'fund-balances',
        'budget-vs-actual',
        'gift-aid-summary',
        'supplier-spend',
      ],
    }),
  ]);

  if (snapshotRes.error || !snapshotRes.data) {
    return { data: null, error: snapshotRes.error ?? 'Unable to load trustee snapshot.' };
  }

  if (dashboardRes.error) {
    return { data: null, error: dashboardRes.error };
  }

  const snapshot = snapshotRes.data;
  const dashboard = dashboardRes.data;
  const actions: string[] = [];

  if (snapshot.forecast.riskLevel === 'AT_RISK') {
    actions.push('Review the forecast and agree corrective action on overspending or income slippage.');
  }
  if (snapshot.funds.restrictedTotal < 0) {
    actions.push('Investigate overspent restricted funds and confirm whether reallocation or replenishment is required.');
  }
  if ((dashboard.cashPosition ?? []).length > 0) {
    const unreconciledCash = (dashboard.cashPosition ?? []).filter((item) => item.glBalancePence < 0);
    if (unreconciledCash.length > 0) {
      actions.push('Check negative cash positions or unsupported bank balances before circulation to trustees.');
    }
  }
  if ((dashboard.giftAidSummary?.donorsMissingDeclarations ?? 0) > 0) {
    actions.push('Follow up active donors without Gift Aid declarations to protect reclaim income.');
  }
  if (actions.length === 0) {
    actions.push('No immediate action is flagged; continue normal month-end review and board reporting.');
  }

  const summary = [
    `${dashboard.orgName} generated ${dashboard.totals.netPence >= 0 ? 'a surplus' : 'a deficit'} of £${Math.abs(dashboard.totals.netPence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} for ${dashboard.periodLabel}.`,
    `Cash stands at £${(snapshot.cash.total / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} and the forecast is currently marked ${snapshot.forecast.riskLevel === 'AT_RISK' ? 'at risk' : 'on track'}.`,
  ].join(' ');

  return {
    data: {
      generatedAt: new Date().toISOString(),
      plainEnglishSummary: summary,
      recommendedActions: actions,
      trusteeSnapshot: snapshot,
      dashboard,
    },
    error: null,
  };
}
