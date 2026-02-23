'use server';

import { MONTH_KEYS, type MonthKey } from '@/lib/budgets/budgetMath';
import {
  listBudgets,
  getBudgetGrid,
} from '@/lib/budgets/actions';
import type { BudgetRow, FundRef } from '@/lib/budgets/types';
import { getActualsByMonth } from '@/lib/reports/actuals';
import {
  buildBudgetVsActual,
  computeBvaTotals,
  type MonthCell,
} from '@/lib/reports/budgetVsActual';
import { getCached, setCached } from '@/lib/cache';
import { timedQuery } from '@/lib/perf';
import type { SMonthCell, SBvaRow, SBvaTotals, BvaReportData, SOverspendAlert, MonthlyChartPoint, DashboardData, SForecastSummary, SForecastReportRow, SForecastReportData, SIEAccountRow, SIECategory, SIEReport, SBSAccountRow, SBSSection, SBSReport, SFMFundRow, SFMReport, STrusteeCashItem, STrusteeCash, STrusteeFunds, STrusteeIEPeriod, STrusteeIE, STrusteeVariance, STrusteeForecast, STrusteeSnapshot } from './types';

/* ------------------------------------------------------------------ */
/*  Serialisation helpers                                              */
/* ------------------------------------------------------------------ */

function serializeCell(cell: MonthCell): SMonthCell {
  return {
    budget: Number(cell.budget),
    actual: Number(cell.actual),
    variance: Number(cell.variance),
    variancePct: cell.variancePct,
  };
}

/* ------------------------------------------------------------------ */
/*  Server action                                                      */
/* ------------------------------------------------------------------ */

export async function getBudgetVsActualReport(params: {
  orgId: string;
  year: number;
  budgetId?: string;
  fundId?: string | null;
}): Promise<{ data: BvaReportData | null; error: string | null }> {
  const { orgId, year, budgetId, fundId } = params;

  // 1. List budgets for the year
  const { data: budgets, error: budgetsErr } = await listBudgets(orgId, year);
  if (budgetsErr) return { data: null, error: budgetsErr };
  if (budgets.length === 0) {
    return { data: { rows: [], totals: emptyTotals(), budgets: [], funds: [] }, error: null };
  }

  // 2. Pick requested budget or first available
  const selectedId = budgetId && budgets.some((b) => b.id === budgetId)
    ? budgetId
    : budgets[0].id;

  // 3. Load budget grid (accounts, funds, lines)
  const { data: grid, error: gridErr } = await getBudgetGrid(selectedId);
  if (gridErr || !grid) return { data: null, error: gridErr ?? 'Budget not found.' };

  // 4. Filter budget lines by fund
  const budgetLines = fundId
    ? grid.lines.filter((l) => l.fund_id === fundId)
    : grid.lines.filter((l) => l.fund_id === null);

  // 5. Load actuals
  const accountIds = grid.accounts.map((a) => a.id);
  const { data: actualsMap, error: actualsErr } = await getActualsByMonth({
    organisationId: orgId,
    year,
    fundId: fundId ?? undefined,
    accountIds,
  });
  if (actualsErr) return { data: null, error: actualsErr };

  // 6. Build BvA rows + totals
  const bvaRows = buildBudgetVsActual({
    accounts: grid.accounts,
    budgetLines,
    actualsByAccountMonth: actualsMap,
  });
  const bvaTotals = computeBvaTotals(bvaRows);

  // 7. Serialise bigint -> number for client transport
  const rows: SBvaRow[] = bvaRows.map((r) => {
    const months: Record<string, SMonthCell> = {};
    for (const k of MONTH_KEYS) {
      months[k] = serializeCell(r.months[k]);
    }
    return {
      accountId: r.accountId,
      accountCode: r.accountCode,
      accountName: r.accountName,
      accountType: r.accountType,
      months,
      ytd: serializeCell(r.ytd),
      annual: serializeCell(r.annual),
    };
  });

  const totals: SBvaTotals = {
    months: {} as Record<string, SMonthCell>,
    ytd: serializeCell(bvaTotals.ytd),
    annual: serializeCell(bvaTotals.annual),
  };
  for (const k of MONTH_KEYS) {
    totals.months[k] = serializeCell(bvaTotals.months[k]);
  }

  return {
    data: {
      rows,
      totals,
      budgets,
      funds: grid.funds,
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  Overspend alerts (serializable)                                    */
/* ------------------------------------------------------------------ */

export async function getTopOverspendAlerts(params: {
  orgId: string;
  year: number;
  fundId?: string | null;
  period: 'MTD' | 'YTD';
  monthIndex?: number;
  limit?: number;
}): Promise<{ data: SOverspendAlert[]; error: string | null }> {
  const { orgId, year, fundId, period, monthIndex, limit = 5 } = params;

  // 1. Find a budget for this year
  const { data: budgets, error: budgetsErr } = await listBudgets(orgId, year);
  if (budgetsErr) return { data: [], error: budgetsErr };
  if (budgets.length === 0) return { data: [], error: null };

  const budgetId = budgets[0].id;

  // 2. Delegate to the existing alert detection
  const { getOverspendAlerts } = await import('@/lib/alerts/overspend');
  const { data: alerts, error: alertsErr } = await getOverspendAlerts({
    organisationId: orgId,
    year,
    budgetId,
    fundId: fundId ?? undefined,
    period,
    monthIndex,
  });

  if (alertsErr) return { data: [], error: alertsErr };

  // 3. Slice to limit and serialise bigint -> number
  const top: SOverspendAlert[] = alerts.slice(0, limit).map((a) => ({
    accountId: a.accountId,
    accountCode: a.accountCode,
    accountName: a.accountName,
    accountType: a.accountType,
    adverseVariancePence: Number(a.adverseVariancePence),
    adverseVariancePct: a.adverseVariancePct,
    budgetPence: Number(a.budgetPence),
    actualPence: Number(a.actualPence),
  }));

  return { data: top, error: null };
}

/* ------------------------------------------------------------------ */
/*  Dashboard aggregate data                                           */
/* ------------------------------------------------------------------ */

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Cache TTL for dashboard KPIs: 60 seconds */
const DASHBOARD_CACHE_TTL_MS = 60 * 1000;

export async function getDashboardData(params: {
  orgId: string;
  year: number;
}): Promise<{ data: DashboardData; error: string | null }> {
  const { orgId, year } = params;

  // Check cache first
  const cacheKey = `dashboard:${orgId}:${year}`;
  const cached = getCached<DashboardData>(cacheKey);
  if (cached) return { data: cached, error: null };

  return timedQuery(`getDashboardData(${orgId}, ${year})`, async () => {
  const { createClient } = await import('@/lib/supabase/server');
  const { listBankAccounts } = await import('@/lib/banking/bankAccounts');

  const supabase = await createClient();

  // 1. Fetch counts in parallel
  const [accountsRes, budgetsRes, bankRes, alertsRes, unpaidBillsRes, giftAidRes] = await Promise.all([
    supabase
      .from('accounts')
      .select('*', { count: 'exact', head: true })
      .eq('organisation_id', orgId)
      .eq('is_active', true),
    listBudgets(orgId, year),
    listBankAccounts(orgId),
    getTopOverspendAlerts({ orgId, year, period: 'YTD' }),
    // Unpaid bills: approved or posted but not yet paid
    supabase
      .from('bills')
      .select('*', { count: 'exact', head: true })
      .eq('organisation_id', orgId)
      .in('status', ['approved', 'posted']),
    // Gift Aid: unclaimed posted donations
    supabase
      .from('donations')
      .select('amount_pence')
      .eq('organisation_id', orgId)
      .eq('status', 'posted')
      .is('gift_aid_claim_id', null),
  ]);

  const accountCount = accountsRes.count ?? 0;
  const budgetCount = budgetsRes.data.length;
  const bankAccountCount = bankRes.data.length;
  const alerts = alertsRes.data;
  const alertCount = alerts.length;
  const unpaidBillCount = unpaidBillsRes.count ?? 0;

  // Sum unclaimed donation amounts and compute 25% claimable
  let giftAidClaimablePence = 0;
  if (giftAidRes.data) {
    for (const d of giftAidRes.data) {
      giftAidClaimablePence += Math.round(Number(d.amount_pence) * 0.25);
    }
  }

  // 2. Load BvA report for monthly chart data
  const { data: bva } = await getBudgetVsActualReport({ orgId, year });

  // 3. Aggregate income/expense by month
  const monthlyIncome: MonthlyChartPoint[] = [];
  const monthlyExpense: MonthlyChartPoint[] = [];

  let totalIncomeBudget = 0;
  let totalIncomeActual = 0;
  let totalExpenseBudget = 0;
  let totalExpenseActual = 0;

  for (let i = 0; i < 12; i++) {
    const mk = MONTH_KEYS[i];
    let incBudget = 0;
    let incActual = 0;
    let expBudget = 0;
    let expActual = 0;

    if (bva?.rows) {
      for (const row of bva.rows) {
        const cell = row.months[mk];
        if (row.accountType === 'income') {
          incBudget += cell.budget;
          incActual += cell.actual;
        } else if (row.accountType === 'expense') {
          expBudget += cell.budget;
          expActual += cell.actual;
        }
      }
    }

    // Convert pence to pounds for chart display
    monthlyIncome.push({
      month: MONTH_LABELS[i],
      budget: Math.round(incBudget) / 100,
      actual: Math.round(incActual) / 100,
    });
    monthlyExpense.push({
      month: MONTH_LABELS[i],
      budget: Math.round(expBudget) / 100,
      actual: Math.round(expActual) / 100,
    });

    totalIncomeBudget += incBudget;
    totalIncomeActual += incActual;
    totalExpenseBudget += expBudget;
    totalExpenseActual += expActual;
  }

  const dashboardData: DashboardData = {
      accountCount,
      budgetCount,
      bankAccountCount,
      alertCount,
      monthlyIncome,
      monthlyExpense,
      alerts,
      totalIncomeBudget: Math.round(totalIncomeBudget) / 100,
      totalIncomeActual: Math.round(totalIncomeActual) / 100,
      totalExpenseBudget: Math.round(totalExpenseBudget) / 100,
      totalExpenseActual: Math.round(totalExpenseActual) / 100,
      unpaidBillCount,
      giftAidClaimablePence,
    };

  // Store in cache
  setCached(cacheKey, dashboardData, DASHBOARD_CACHE_TTL_MS);

  return { data: dashboardData, error: null };
  }); // end timedQuery
}

/* ------------------------------------------------------------------ */
/*  Dashboard forecast summary (serializable)                          */
/* ------------------------------------------------------------------ */

export async function getDashboardForecastSummary(params: {
  organisationId: string;
}): Promise<{ data: SForecastSummary | null; error: string | null }> {
  const { organisationId } = params;

  const { getAsOfPeriod } = await import('@/lib/forecast/getAsOfPeriod');
  const { sumMonths } = await import('@/lib/budgets/budgetMath');
  const { computeForecastSummary } = await import('@/lib/forecast/forecastSummary');

  const { year, monthIndex: asOfMonthIndex } = getAsOfPeriod();

  // 1. Find a budget for the current year
  const { data: budgets, error: budgetsErr } = await listBudgets(organisationId, year);
  if (budgetsErr) return { data: null, error: budgetsErr };
  if (budgets.length === 0) return { data: null, error: null };

  // 2. Load budget grid (accounts, funds, lines)
  const { data: grid, error: gridErr } = await getBudgetGrid(budgets[0].id);
  if (gridErr || !grid) return { data: null, error: gridErr ?? 'Budget not found.' };

  // 3. Filter budget lines to "All funds" view (fund_id is null)
  const budgetLines = grid.lines.filter((l) => l.fund_id === null);

  // 4. Load actuals
  const accountIds = grid.accounts.map((a) => a.id);
  const { data: actualsMap, error: actualsErr } = await getActualsByMonth({
    organisationId,
    year,
    accountIds,
  });
  if (actualsErr) return { data: null, error: actualsErr };

  // 5. Build BvA rows (bigint, not serialized)
  const bvaRows = buildBudgetVsActual({
    accounts: grid.accounts,
    budgetLines,
    actualsByAccountMonth: actualsMap,
  });

  // 6. Build annualBudgetsByAccount map
  const annualBudgetsByAccount: Record<string, bigint> = {};
  for (const line of budgetLines) {
    const total = sumMonths(line as unknown as Parameters<typeof sumMonths>[0]);
    annualBudgetsByAccount[line.account_id] =
      (annualBudgetsByAccount[line.account_id] ?? 0n) + total;
  }

  // 7. Build AccountMeta[]
  const accounts = grid.accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
  }));

  // 8. Compute forecast summary
  const summary = computeForecastSummary({
    bvaRows,
    actualsMap,
    accounts,
    annualBudgetsByAccount,
    asOfMonthIndex,
  });

  // 9. Serialize bigint -> number
  return {
    data: {
      asOfMonthIndex: summary.asOfMonthIndex,
      baseline: {
        forecastYearEndVarianceTotal: Number(summary.baseline.forecastYearEndVarianceTotal),
        forecastYearEndActualTotal: Number(summary.baseline.forecastYearEndActualTotal),
      },
      trend: {
        forecastYearEndVarianceTotal: Number(summary.trend.forecastYearEndVarianceTotal),
        forecastYearEndActualTotal: Number(summary.trend.forecastYearEndActualTotal),
      },
      riskDelta: Number(summary.riskDelta),
      riskLevel: summary.riskLevel,
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  Forecast report (serializable)                                     */
/* ------------------------------------------------------------------ */

export async function getForecastReport(params: {
  organisationId: string;
  year?: number;
  fundId?: string | null;
}): Promise<{ data: SForecastReportData | null; error: string | null }> {
  const { organisationId, fundId } = params;

  const { getAsOfPeriod } = await import('@/lib/forecast/getAsOfPeriod');
  const { sumMonths } = await import('@/lib/budgets/budgetMath');
  const { buildForecastReport } = await import('@/lib/forecast/forecastReport');

  const { year: serverYear, monthIndex: asOfMonthIndex } = getAsOfPeriod();
  const year = params.year ?? serverYear;

  // 1. Find a budget for the year
  const { data: budgets, error: budgetsErr } = await listBudgets(organisationId, year);
  if (budgetsErr) return { data: null, error: budgetsErr };
  if (budgets.length === 0) return { data: null, error: null };

  // 2. Load budget grid
  const { data: grid, error: gridErr } = await getBudgetGrid(budgets[0].id);
  if (gridErr || !grid) return { data: null, error: gridErr ?? 'Budget not found.' };

  // 3. Filter budget lines by fund
  const budgetLines = fundId
    ? grid.lines.filter((l) => l.fund_id === fundId)
    : grid.lines.filter((l) => l.fund_id === null);

  // 4. Load actuals
  const accountIds = grid.accounts.map((a) => a.id);
  const { data: actualsMap, error: actualsErr } = await getActualsByMonth({
    organisationId,
    year,
    fundId: fundId ?? undefined,
    accountIds,
  });
  if (actualsErr) return { data: null, error: actualsErr };

  // 5. Build BvA rows (bigint)
  const bvaRows = buildBudgetVsActual({
    accounts: grid.accounts,
    budgetLines,
    actualsByAccountMonth: actualsMap,
  });

  // 6. Build annualBudgetsByAccount map
  const annualBudgetsByAccount: Record<string, bigint> = {};
  for (const line of budgetLines) {
    const total = sumMonths(line as unknown as Parameters<typeof sumMonths>[0]);
    annualBudgetsByAccount[line.account_id] =
      (annualBudgetsByAccount[line.account_id] ?? 0n) + total;
  }

  // 7. Build AccountMeta[]
  const accounts = grid.accounts.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
  }));

  // 8. Load tolerance from org settings (default 0)
  let tolerancePence = 0n;
  try {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();
    const { data: settings } = await supabase
      .from('organisation_settings')
      .select('overspend_amount_pence')
      .eq('organisation_id', organisationId)
      .single();
    if (settings?.overspend_amount_pence) {
      tolerancePence = BigInt(settings.overspend_amount_pence);
    }
  } catch {
    // Fall back to 0 tolerance if settings table is unavailable
  }

  // 9. Build forecast report
  const report = buildForecastReport({
    bvaRows,
    actualsMap,
    accounts,
    annualBudgetsByAccount,
    asOfMonthIndex,
    tolerancePence,
  });

  // 10. Serialize bigint -> number
  function serializeRow(r: (typeof report.rows)[number]): SForecastReportRow {
    return {
      accountId: r.accountId,
      accountCode: r.accountCode,
      accountName: r.accountName,
      accountType: r.accountType,
      annualBudget: Number(r.annualBudget),
      actualYTD: Number(r.actualYTD),
      baselineYearEndActual: Number(r.baselineYearEndActual),
      baselineVariance: Number(r.baselineVariance),
      trendYearEndActual: Number(r.trendYearEndActual),
      trendVariance: Number(r.trendVariance),
      riskDelta: Number(r.riskDelta),
      riskStatus: r.riskStatus,
    };
  }

  return {
    data: {
      asOfMonthIndex: report.asOfMonthIndex,
      year,
      fundId: fundId ?? null,
      rows: report.rows.map(serializeRow),
      totals: serializeRow(report.totals),
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  Income & Expenditure report (serializable)                         */
/* ------------------------------------------------------------------ */

export async function getIncomeExpenditureReport(params: {
  organisationId: string;
  year: number;
  month?: number;
  fundId?: string | null;
}): Promise<{ data: SIEReport | null; error: string | null }> {
  const { organisationId, year, month, fundId } = params;

  const { buildIncomeExpenditureReport } = await import(
    '@/lib/reports/incomeExpenditure'
  );

  // Auth check
  const { getActiveOrg } = await import('@/lib/org');
  await getActiveOrg();

  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();

  // 1. Fetch income + expense accounts, sorted by type then code
  const { data: accounts, error: accErr } = await supabase
    .from('accounts')
    .select('id, code, name, type')
    .eq('organisation_id', organisationId)
    .in('type', ['income', 'expense'])
    .eq('is_active', true)
    .order('type')
    .order('code');

  if (accErr) return { data: null, error: accErr.message };
  if (!accounts || accounts.length === 0) {
    return {
      data: {
        categories: [],
        totals: { monthlyActual: 0, ytdActual: 0 },
      },
      error: null,
    };
  }

  // 2. Load actuals
  const accountIds = accounts.map((a) => a.id);
  const { data: actualsMap, error: actualsErr } = await getActualsByMonth({
    organisationId,
    year,
    fundId: fundId ?? undefined,
    accountIds,
  });
  if (actualsErr) return { data: null, error: actualsErr };

  // 3. Build report (bigint)
  const report = buildIncomeExpenditureReport({
    accounts,
    actualsMap,
    month,
  });

  // 4. Serialize bigint -> number
  const serializeCategory = (cat: (typeof report.categories)[number]): SIECategory => ({
    categoryName: cat.categoryName,
    rows: cat.rows.map((r) => ({
      accountId: r.accountId,
      accountCode: r.accountCode,
      accountName: r.accountName,
      monthlyActual: Number(r.monthlyActual),
      ytdActual: Number(r.ytdActual),
    })),
    totals: {
      monthlyActual: Number(cat.totals.monthlyActual),
      ytdActual: Number(cat.totals.ytdActual),
    },
  });

  return {
    data: {
      categories: report.categories.map(serializeCategory),
      totals: {
        monthlyActual: Number(report.totals.monthlyActual),
        ytdActual: Number(report.totals.ytdActual),
      },
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  Balance Sheet report (serializable)                                */
/* ------------------------------------------------------------------ */

export async function getBalanceSheetReport(params: {
  organisationId: string;
  asOfDate: string;
  fundId?: string | null;
}): Promise<{ data: SBSReport | null; error: string | null }> {
  const { organisationId, asOfDate, fundId } = params;

  const { buildBalanceSheetReport } = await import(
    '@/lib/reports/balanceSheet'
  );

  // Auth check
  const { getActiveOrg } = await import('@/lib/org');
  await getActiveOrg();

  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();

  // 1. Fetch asset / liability / equity accounts, sorted by type then code
  const { data: accounts, error: accErr } = await supabase
    .from('accounts')
    .select('id, code, name, type')
    .eq('organisation_id', organisationId)
    .in('type', ['asset', 'liability', 'equity'])
    .eq('is_active', true)
    .order('type')
    .order('code');

  if (accErr) return { data: null, error: accErr.message };
  if (!accounts || accounts.length === 0) {
    const emptySection = { rows: [], total: 0 };
    return {
      data: {
        asOfDate,
        sections: { assets: emptySection, liabilities: emptySection, equity: emptySection },
        netAssets: 0,
        check: { balances: true, difference: 0 },
      },
      error: null,
    };
  }

  // 2. Fetch posted journals with journal_date <= asOfDate
  const { data: journals, error: journalErr } = await supabase
    .from('journals')
    .select('id')
    .eq('organisation_id', organisationId)
    .eq('status', 'posted')
    .lte('journal_date', asOfDate);

  if (journalErr) return { data: null, error: journalErr.message };
  if (!journals || journals.length === 0) {
    const emptySection = { rows: [], total: 0 };
    return {
      data: {
        asOfDate,
        sections: { assets: emptySection, liabilities: emptySection, equity: emptySection },
        netAssets: 0,
        check: { balances: true, difference: 0 },
      },
      error: null,
    };
  }

  const journalIds = journals.map((j) => j.id);
  const accountIds = accounts.map((a) => a.id);

  // 3. Fetch journal lines for those journals, filtered to BS accounts
  // Add organisation_id early so the DB can use idx_jlines_org_account
  let linesQuery = supabase
    .from('journal_lines')
    .select('account_id, debit_pence, credit_pence')
    .eq('organisation_id', organisationId)
    .in('journal_id', journalIds)
    .in('account_id', accountIds);

  if (fundId !== undefined && fundId !== null) {
    linesQuery = linesQuery.eq('fund_id', fundId);
  }

  const { data: lines, error: linesErr } = await linesQuery;
  if (linesErr) return { data: null, error: linesErr.message };

  // 4. Build report (bigint)
  const report = buildBalanceSheetReport({
    accounts,
    lines: lines ?? [],
    asOfDate,
  });

  // 5. Serialize bigint -> number
  const serializeSection = (s: { rows: { accountId: string; accountCode: string; accountName: string; balance: bigint }[]; total: bigint }): SBSSection => ({
    rows: s.rows.map((r) => ({
      accountId: r.accountId,
      accountCode: r.accountCode,
      accountName: r.accountName,
      balance: Number(r.balance),
    })),
    total: Number(s.total),
  });

  return {
    data: {
      asOfDate: report.asOfDate,
      sections: {
        assets: serializeSection(report.sections.assets),
        liabilities: serializeSection(report.sections.liabilities),
        equity: serializeSection(report.sections.equity),
      },
      netAssets: Number(report.netAssets),
      check: {
        balances: report.check.balances,
        difference: Number(report.check.difference),
      },
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  Fund Movements report (serializable)                               */
/* ------------------------------------------------------------------ */

export async function getFundMovementsReport(params: {
  organisationId: string;
  year: number;
  month?: number;
  mode: 'MONTH' | 'YTD';
  fundFilter?: 'ALL' | 'RESTRICTED' | 'UNRESTRICTED' | 'DESIGNATED' | { fundId: string };
}): Promise<{ data: SFMReport | null; error: string | null }> {
  const { organisationId, year, month, mode, fundFilter } = params;

  const { buildFundMovementsReport } = await import(
    '@/lib/reports/fundMovements'
  );

  // Auth check
  const { getActiveOrg } = await import('@/lib/org');
  await getActiveOrg();

  // 1. Compute period dates
  let startDate: string;
  let endDate: string;

  if (mode === 'MONTH' && month) {
    startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    // Last day of month
    const lastDay = new Date(year, month, 0).getDate();
    endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  } else {
    // YTD
    startDate = `${year}-01-01`;
    if (month) {
      const lastDay = new Date(year, month, 0).getDate();
      endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    } else {
      endDate = `${year}-12-31`;
    }
  }

  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();

  // 2. Fetch funds for the org
  let fundsQuery = supabase
    .from('funds')
    .select('id, name, type')
    .eq('organisation_id', organisationId)
    .eq('is_active', true)
    .order('name');

  // Apply fund type filter
  if (fundFilter && fundFilter !== 'ALL') {
    if (typeof fundFilter === 'object' && 'fundId' in fundFilter) {
      fundsQuery = fundsQuery.eq('id', fundFilter.fundId);
    } else {
      fundsQuery = fundsQuery.eq('type', fundFilter.toLowerCase());
    }
  }

  const { data: funds, error: fundsErr } = await fundsQuery;
  if (fundsErr) return { data: null, error: fundsErr.message };

  // 3. Fetch all posted journals with journal_date <= endDate (need history for opening balance)
  const { data: journals, error: journalErr } = await supabase
    .from('journals')
    .select('id, journal_date')
    .eq('organisation_id', organisationId)
    .eq('status', 'posted')
    .lte('journal_date', endDate);

  if (journalErr) return { data: null, error: journalErr.message };

  if (!journals || journals.length === 0) {
    const emptyRow = {
      openingBalancePence: 0,
      incomePence: 0,
      expenditurePence: 0,
      netMovementPence: 0,
      closingBalancePence: 0,
    };
    return {
      data: {
        period: { year, month, startDate, endDate },
        funds: [],
        totals: emptyRow,
      },
      error: null,
    };
  }

  const journalDateMap: Record<string, string> = {};
  const journalIds: string[] = [];
  for (const j of journals) {
    journalDateMap[j.id] = j.journal_date;
    journalIds.push(j.id);
  }

  // 4. Fetch income/expense accounts for the org
  const { data: accounts, error: accErr } = await supabase
    .from('accounts')
    .select('id, type')
    .eq('organisation_id', organisationId)
    .in('type', ['income', 'expense']);

  if (accErr) return { data: null, error: accErr.message };

  const accountTypes: Record<string, string> = {};
  for (const acc of accounts ?? []) {
    accountTypes[acc.id] = acc.type;
  }

  const accountIds = Object.keys(accountTypes);
  if (accountIds.length === 0) {
    const emptyRow = {
      openingBalancePence: 0,
      incomePence: 0,
      expenditurePence: 0,
      netMovementPence: 0,
      closingBalancePence: 0,
    };
    return {
      data: {
        period: { year, month, startDate, endDate },
        funds: [],
        totals: emptyRow,
      },
      error: null,
    };
  }

  // 5. Fetch journal lines for those journals, filtered to income/expense accounts
  // Add organisation_id early so the DB can use idx_jlines_org_account
  let linesQuery = supabase
    .from('journal_lines')
    .select('account_id, fund_id, debit_pence, credit_pence, journal_id')
    .eq('organisation_id', organisationId)
    .in('journal_id', journalIds)
    .in('account_id', accountIds);

  // If filtering to a specific fund, also filter lines
  if (fundFilter && typeof fundFilter === 'object' && 'fundId' in fundFilter) {
    linesQuery = linesQuery.eq('fund_id', fundFilter.fundId);
  }

  const { data: lines, error: linesErr } = await linesQuery;
  if (linesErr) return { data: null, error: linesErr.message };

  // 6. Transform to FMRawLine format
  type FMRawLine = import('@/lib/reports/fundMovements').FMRawLine;
  const rawLines: FMRawLine[] = (lines ?? []).map((l) => ({
    fund_id: l.fund_id,
    account_type: accountTypes[l.account_id],
    debit_pence: l.debit_pence,
    credit_pence: l.credit_pence,
    journal_date: journalDateMap[l.journal_id],
  }));

  // If filtering by fund type (not specific fundId), filter lines to only include
  // lines whose fund_id is in the funds list (or null)
  if (fundFilter && fundFilter !== 'ALL' && typeof fundFilter !== 'object') {
    const fundIdSet = new Set((funds ?? []).map((f) => f.id));
    // Keep lines matching the filtered funds, plus unallocated lines
    const filtered = rawLines.filter(
      (l) => l.fund_id === null || fundIdSet.has(l.fund_id),
    );
    rawLines.length = 0;
    rawLines.push(...filtered);
  }

  // 7. Build report
  const report = buildFundMovementsReport({
    funds: funds ?? [],
    lines: rawLines,
    startDate,
    endDate,
    year,
    month,
  });

  // 8. Serialize bigint -> number
  const serializeRow = (r: { openingBalancePence: bigint; incomePence: bigint; expenditurePence: bigint; netMovementPence: bigint; closingBalancePence: bigint }) => ({
    openingBalancePence: Number(r.openingBalancePence),
    incomePence: Number(r.incomePence),
    expenditurePence: Number(r.expenditurePence),
    netMovementPence: Number(r.netMovementPence),
    closingBalancePence: Number(r.closingBalancePence),
  });

  return {
    data: {
      period: report.period,
      funds: report.funds.map((f) => ({
        fundId: f.fundId,
        fundName: f.fundName,
        fundType: f.fundType,
        ...serializeRow(f),
      })),
      totals: serializeRow(report.totals),
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  Trustee Snapshot (serializable)                                    */
/* ------------------------------------------------------------------ */

export async function getTrusteeSnapshot(params: {
  organisationId: string;
}): Promise<{ data: STrusteeSnapshot | null; error: string | null }> {
  const { organisationId } = params;

  const { buildTrusteeSnapshot } = await import(
    '@/lib/reports/trusteeSnapshot'
  );

  // Auth check
  const { getActiveOrg } = await import('@/lib/org');
  await getActiveOrg();

  const today = new Date();
  const asOfDate = today.toISOString().slice(0, 10);
  const year = today.getFullYear();
  const monthIndex = today.getMonth() + 1; // 1-based

  // Fetch all five upstream reports in parallel
  const [bsResult, fmResult, ieResult, alertsResult, forecastResult] =
    await Promise.all([
      getBalanceSheetReport({ organisationId, asOfDate }),
      getFundMovementsReport({ organisationId, year, mode: 'YTD' }),
      getIncomeExpenditureReport({ organisationId, year, month: monthIndex }),
      getTopOverspendAlerts({
        orgId: organisationId,
        year,
        period: 'YTD',
        limit: 5,
      }),
      getDashboardForecastSummary({ organisationId }),
    ]);

  // Build inputs for the pure function (convert serialized numbers to bigint)
  const bsAssets = bsResult.data
    ? {
        rows: bsResult.data.sections.assets.rows.map((r) => ({
          accountId: r.accountId,
          accountName: r.accountName,
          accountCode: r.accountCode,
          balance: BigInt(r.balance),
        })),
        total: BigInt(bsResult.data.sections.assets.total),
      }
    : { rows: [], total: 0n };

  const fundRows = (fmResult.data?.funds ?? []).map((f) => ({
    fundType: f.fundType,
    closingBalancePence: BigInt(f.closingBalancePence),
  }));

  const ieCategories = (ieResult.data?.categories ?? []).map((c) => ({
    categoryName: c.categoryName,
    totals: {
      monthlyActual: BigInt(c.totals.monthlyActual),
      ytdActual: BigInt(c.totals.ytdActual),
    },
  }));

  const ieTotals = ieResult.data
    ? {
        monthlyActual: BigInt(ieResult.data.totals.monthlyActual),
        ytdActual: BigInt(ieResult.data.totals.ytdActual),
      }
    : { monthlyActual: 0n, ytdActual: 0n };

  const alerts = (alertsResult.data ?? []).map((a) => ({
    accountId: a.accountId,
    accountCode: a.accountCode,
    accountName: a.accountName,
    accountType: a.accountType,
    adverseVariancePence: BigInt(a.adverseVariancePence),
    adverseVariancePct: a.adverseVariancePct,
  }));

  const forecast = forecastResult.data
    ? {
        baseline: {
          forecastYearEndActualTotal: BigInt(
            forecastResult.data.baseline.forecastYearEndActualTotal,
          ),
        },
        trend: {
          forecastYearEndActualTotal: BigInt(
            forecastResult.data.trend.forecastYearEndActualTotal,
          ),
        },
        riskLevel: forecastResult.data.riskLevel,
      }
    : null;

  const snapshot = buildTrusteeSnapshot({
    balanceSheetAssets: bsAssets,
    fundRows,
    ieCategories,
    ieTotals,
    alerts,
    forecast: forecast as import('@/lib/reports/trusteeSnapshot').SnapshotForecastSummary | null,
    asOfDate,
  });

  // Serialize bigint -> number
  const serializeIEPeriod = (p: { income: bigint; expense: bigint; surplus: bigint }) => ({
    income: Number(p.income),
    expense: Number(p.expense),
    surplus: Number(p.surplus),
  });

  return {
    data: {
      asOfDate: snapshot.asOfDate,
      cash: {
        items: snapshot.cash.items.map((i) => ({
          accountId: i.accountId,
          accountName: i.accountName,
          balance: Number(i.balance),
        })),
        total: Number(snapshot.cash.total),
      },
      funds: {
        restrictedTotal: Number(snapshot.funds.restrictedTotal),
        unrestrictedTotal: Number(snapshot.funds.unrestrictedTotal),
        designatedTotal: Number(snapshot.funds.designatedTotal),
      },
      incomeExpenditure: {
        mtd: serializeIEPeriod(snapshot.incomeExpenditure.mtd),
        ytd: serializeIEPeriod(snapshot.incomeExpenditure.ytd),
      },
      topVariances: snapshot.topVariances.map((v) => ({
        accountId: v.accountId,
        accountCode: v.accountCode,
        accountName: v.accountName,
        accountType: v.accountType,
        adverseVariancePence: Number(v.adverseVariancePence),
        adverseVariancePct: v.adverseVariancePct,
      })),
      forecast: {
        baselineYE: Number(snapshot.forecast.baselineYE),
        trendYE: Number(snapshot.forecast.trendYE),
        riskLevel: snapshot.forecast.riskLevel,
      },
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  Cash Flow Statement (serializable)                                 */
/* ------------------------------------------------------------------ */

export async function getCashFlowReport(params: {
  organisationId: string;
  year: number;
  month?: number;
}): Promise<{ data: import('./types').SCashFlowReport | null; error: string | null }> {
  const { organisationId, year, month } = params;

  const { getActiveOrg } = await import('@/lib/org');
  await getActiveOrg();

  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();

  // Determine period
  let periodStart: string;
  let periodEnd: string;
  if (month) {
    periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    periodEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  } else {
    periodStart = `${year}-01-01`;
    periodEnd = `${year}-12-31`;
  }

  // 1. Find all cash/bank type accounts (asset accounts that are bank-linked or cash-in-hand)
  const { data: allAccounts, error: accErr } = await supabase
    .from('accounts')
    .select('id, code, name, type')
    .eq('organisation_id', organisationId)
    .eq('is_active', true)
    .order('code');

  if (accErr) return { data: null, error: accErr.message };

  const accountTypeMap: Record<string, string> = {};
  for (const a of allAccounts ?? []) {
    accountTypeMap[a.id] = a.type;
  }

  // Get asset accounts (bank/cash)
  const assetAccounts = (allAccounts ?? []).filter((a) => a.type === 'asset');
  const incomeAccounts = (allAccounts ?? []).filter((a) => a.type === 'income');
  const expenseAccounts = (allAccounts ?? []).filter((a) => a.type === 'expense');
  const liabilityAccounts = (allAccounts ?? []).filter((a) => a.type === 'liability');

  // 2. Fetch all posted journals up to periodEnd
  const { data: allJournals } = await supabase
    .from('journals')
    .select('id, journal_date')
    .eq('organisation_id', organisationId)
    .eq('status', 'posted')
    .lte('journal_date', periodEnd);

  if (!allJournals || allJournals.length === 0) {
    return {
      data: {
        periodStart,
        periodEnd,
        openingBalancePence: 0,
        sections: [],
        netChangePence: 0,
        closingBalancePence: 0,
      },
      error: null,
    };
  }

  // Split journals by period
  const prePeriodJournalIds: string[] = [];
  const inPeriodJournalIds: string[] = [];
  for (const j of allJournals) {
    if (j.journal_date < periodStart) {
      prePeriodJournalIds.push(j.id);
    } else {
      inPeriodJournalIds.push(j.id);
    }
  }

  const assetAccountIds = assetAccounts.map((a) => a.id);

  // 3. Compute opening balance of cash/bank accounts (before period)
  let openingBalancePence = 0;
  if (prePeriodJournalIds.length > 0 && assetAccountIds.length > 0) {
    const { data: priorLines } = await supabase
      .from('journal_lines')
      .select('account_id, debit_pence, credit_pence')
      .eq('organisation_id', organisationId)
      .in('journal_id', prePeriodJournalIds)
      .in('account_id', assetAccountIds);

    for (const l of priorLines ?? []) {
      openingBalancePence += Number(l.debit_pence) - Number(l.credit_pence);
    }
  }

  // 4. Fetch in-period journal lines for cash/bank accounts
  if (inPeriodJournalIds.length === 0) {
    return {
      data: {
        periodStart,
        periodEnd,
        openingBalancePence,
        sections: [],
        netChangePence: 0,
        closingBalancePence: openingBalancePence,
      },
      error: null,
    };
  }

  // Get ALL lines for in-period journals (we need to classify cash movements)
  const { data: inPeriodLines } = await supabase
    .from('journal_lines')
    .select('account_id, debit_pence, credit_pence, journal_id, description')
    .eq('organisation_id', organisationId)
    .in('journal_id', inPeriodJournalIds);

  // 5. Build cash flow sections by analysing movements through cash/bank accounts
  // Operating: income & expenses flowing through asset accounts
  // We aggregate by looking at the COUNTER-entries that correspond to cash movements

  const incomeAccountSet = new Set(incomeAccounts.map((a) => a.id));
  const expenseAccountSet = new Set(expenseAccounts.map((a) => a.id));
  const assetAccountSet = new Set(assetAccountIds);
  const liabilityAccountSet = new Set(liabilityAccounts.map((a) => a.id));

  // Group lines by journal_id
  const linesByJournal = new Map<string, typeof inPeriodLines>();
  for (const l of inPeriodLines ?? []) {
    const arr = linesByJournal.get(l.journal_id) ?? [];
    arr.push(l);
    linesByJournal.set(l.journal_id, arr);
  }

  // Track totals by category
  let operatingIncomePence = 0;
  let operatingExpensePence = 0;
  let investingPence = 0;
  let financingPence = 0;

  // For each journal, find cash-side movements and categorize them
  for (const [, journalLines] of linesByJournal) {
    if (!journalLines) continue;

    // Find the net cash movement in this journal
    let cashMovement = 0;
    const counterTypes = new Set<string>();

    for (const l of journalLines) {
      if (assetAccountSet.has(l.account_id)) {
        cashMovement += Number(l.debit_pence) - Number(l.credit_pence);
      } else {
        const accType = accountTypeMap[l.account_id];
        if (accType) counterTypes.add(accType);
      }
    }

    if (cashMovement === 0) continue;

    // Classify based on counter-entries
    if (counterTypes.has('income') || counterTypes.has('expense')) {
      if (cashMovement > 0) operatingIncomePence += cashMovement;
      else operatingExpensePence += cashMovement;
    } else if (counterTypes.has('liability') || counterTypes.has('equity')) {
      financingPence += cashMovement;
    } else {
      investingPence += cashMovement;
    }
  }

  const operatingNet = operatingIncomePence + operatingExpensePence;

  type SCashFlowSection = import('./types').SCashFlowSection;

  const sections: SCashFlowSection[] = [
    {
      label: 'Operating Activities',
      items: [
        { label: 'Cash received from operations', amountPence: operatingIncomePence },
        { label: 'Cash paid for operations', amountPence: operatingExpensePence },
      ],
      totalPence: operatingNet,
    },
    {
      label: 'Investing Activities',
      items: [
        { label: 'Net investing cash flows', amountPence: investingPence },
      ],
      totalPence: investingPence,
    },
    {
      label: 'Financing Activities',
      items: [
        { label: 'Net financing cash flows', amountPence: financingPence },
      ],
      totalPence: financingPence,
    },
  ];

  const netChangePence = operatingNet + investingPence + financingPence;
  const closingBalancePence = openingBalancePence + netChangePence;

  return {
    data: {
      periodStart,
      periodEnd,
      openingBalancePence,
      sections,
      netChangePence,
      closingBalancePence,
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  Quarterly Report (serializable)                                    */
/* ------------------------------------------------------------------ */

export async function getQuarterlyReport(params: {
  organisationId: string;
  year: number;
}): Promise<{ data: import('./types').SQuarterlyReport | null; error: string | null }> {
  const { organisationId, year } = params;

  const { getActiveOrg } = await import('@/lib/org');
  await getActiveOrg();

  const quarters: import('./types').SQuarterSummary[] = [];
  let annualIncome = 0;
  let annualExpense = 0;

  // Fetch I&E for each quarter
  for (let q = 1; q <= 4; q++) {
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = q * 3;

    // We use the existing I&E action with month range
    // For quarter, fetch YTD up to endMonth and subtract up to startMonth-1
    const [endRes, startRes] = await Promise.all([
      getIncomeExpenditureReport({
        organisationId,
        year,
        month: endMonth,
      }),
      startMonth > 1
        ? getIncomeExpenditureReport({
            organisationId,
            year,
            month: startMonth - 1,
          })
        : Promise.resolve({ data: null, error: null }),
    ]);

    const endYtdIncome = endRes.data?.categories.find((c) => c.categoryName === 'Income')?.totals.ytdActual ?? 0;
    const endYtdExpense = endRes.data?.categories.find((c) => c.categoryName === 'Expenses')?.totals.ytdActual ?? 0;
    const startYtdIncome = startRes.data?.categories.find((c) => c.categoryName === 'Income')?.totals.ytdActual ?? 0;
    const startYtdExpense = startRes.data?.categories.find((c) => c.categoryName === 'Expenses')?.totals.ytdActual ?? 0;

    const qIncome = endYtdIncome - startYtdIncome;
    const qExpense = endYtdExpense - startYtdExpense;

    quarters.push({
      quarter: `Q${q}`,
      incomeTotal: qIncome,
      expenseTotal: qExpense,
      surplus: qIncome - qExpense,
    });

    annualIncome += qIncome;
    annualExpense += qExpense;
  }

  // Fund balances (current)
  const fmRes = await getFundMovementsReport({
    organisationId,
    year,
    mode: 'YTD',
  });

  const fundBalances = (fmRes.data?.funds ?? []).map((f) => ({
    fundId: f.fundId,
    fundName: f.fundName,
    fundType: f.fundType,
    balancePence: f.closingBalancePence,
  }));

  return {
    data: {
      year,
      quarters,
      annualTotal: {
        quarter: 'Annual',
        incomeTotal: annualIncome,
        expenseTotal: annualExpense,
        surplus: annualIncome - annualExpense,
      },
      fundBalances,
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  Annual Report (composite)                                          */
/* ------------------------------------------------------------------ */

export async function getAnnualReport(params: {
  organisationId: string;
  year: number;
}): Promise<{ data: import('./types').SAnnualReport | null; error: string | null }> {
  const { organisationId, year } = params;

  const { getActiveOrg } = await import('@/lib/org');
  await getActiveOrg();

  const asOfDate = `${year}-12-31`;
  const priorAsOfDate = `${year - 1}-12-31`;

  const [ieRes, bsRes, fmRes, priorIeRes, priorBsRes, bvaRes] = await Promise.all([
    getIncomeExpenditureReport({ organisationId, year }),
    getBalanceSheetReport({ organisationId, asOfDate }),
    getFundMovementsReport({ organisationId, year, mode: 'YTD' }),
    getIncomeExpenditureReport({ organisationId, year: year - 1 }),
    getBalanceSheetReport({ organisationId, asOfDate: priorAsOfDate }),
    getBudgetVsActualReport({ orgId: organisationId, year }),
  ]);

  // Build budget summary
  let budgetVsActual = null;
  if (bvaRes.data && bvaRes.data.totals) {
    budgetVsActual = {
      totalBudgetPence: bvaRes.data.totals.annual.budget,
      totalActualPence: bvaRes.data.totals.annual.actual,
      variancePence: bvaRes.data.totals.annual.variance,
    };
  }

  return {
    data: {
      year,
      incomeStatement: ieRes.data,
      balanceSheet: bsRes.data,
      fundMovements: fmRes.data,
      budgetVsActual,
      priorYear: {
        incomeStatement: priorIeRes.data,
        balanceSheet: priorBsRes.data,
      },
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  AGM Report Pack                                                    */
/* ------------------------------------------------------------------ */

export async function getAGMReport(params: {
  organisationId: string;
  year: number;
}): Promise<{ data: import('./types').SAGMReport | null; error: string | null }> {
  const { organisationId, year } = params;

  const { getActiveOrg } = await import('@/lib/org');
  await getActiveOrg();

  const [ieRes, fmRes] = await Promise.all([
    getIncomeExpenditureReport({ organisationId, year }),
    getFundMovementsReport({ organisationId, year, mode: 'YTD' }),
  ]);

  const incomeCategory = ieRes.data?.categories.find((c) => c.categoryName === 'Income');
  const expenseCategory = ieRes.data?.categories.find((c) => c.categoryName === 'Expenses');

  const totalIncome = incomeCategory?.totals.ytdActual ?? 0;
  const totalExpense = expenseCategory?.totals.ytdActual ?? 0;
  const netResult = totalIncome - totalExpense;

  const restrictedFunds = (fmRes.data?.funds ?? [])
    .filter((f) => f.fundType === 'restricted')
    .map((f) => ({ fundName: f.fundName, balancePence: f.closingBalancePence }));

  const unrestrictedBalancePence = (fmRes.data?.funds ?? [])
    .filter((f) => f.fundType === 'unrestricted')
    .reduce((sum, f) => sum + f.closingBalancePence, 0);

  const designatedBalancePence = (fmRes.data?.funds ?? [])
    .filter((f) => f.fundType === 'designated')
    .reduce((sum, f) => sum + f.closingBalancePence, 0);

  return {
    data: {
      year,
      totalIncomePence: totalIncome,
      totalExpensePence: totalExpense,
      netResultPence: netResult,
      restrictedFunds,
      unrestrictedBalancePence,
      designatedBalancePence,
      commentary: '',
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  Drill-Down: Transaction List (serializable)                        */
/* ------------------------------------------------------------------ */

export interface DrillDownTransaction {
  journalId: string;
  journalDate: string;
  memo: string;
  description: string;
  debitPence: number;
  creditPence: number;
  fundName: string | null;
}

export async function getDrillDownTransactions(params: {
  organisationId: string;
  accountId: string;
  startDate: string;
  endDate: string;
  fundId?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<{ data: DrillDownTransaction[]; total: number; error: string | null }> {
  const { organisationId, accountId, startDate, endDate, fundId, page = 1, pageSize = 50 } = params;

  const { getActiveOrg } = await import('@/lib/org');
  await getActiveOrg();

  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();

  // 1. Find posted journals in the date range
  const { data: journals, error: journalErr } = await supabase
    .from('journals')
    .select('id, journal_date, memo')
    .eq('organisation_id', organisationId)
    .eq('status', 'posted')
    .gte('journal_date', startDate)
    .lte('journal_date', endDate)
    .order('journal_date', { ascending: false });

  if (journalErr) return { data: [], total: 0, error: journalErr.message };
  if (!journals || journals.length === 0) return { data: [], total: 0, error: null };

  const journalIds = journals.map((j) => j.id);
  const journalMap = new Map(journals.map((j) => [j.id, j]));

  // 2. Count matching lines
  let countQuery = supabase
    .from('journal_lines')
    .select('*', { count: 'exact', head: true })
    .eq('organisation_id', organisationId)
    .eq('account_id', accountId)
    .in('journal_id', journalIds);

  if (fundId) countQuery = countQuery.eq('fund_id', fundId);

  const { count } = await countQuery;
  const total = count ?? 0;

  // 3. Fetch paginated lines
  const offset = (page - 1) * pageSize;

  let linesQuery = supabase
    .from('journal_lines')
    .select('journal_id, description, debit_pence, credit_pence, fund_id')
    .eq('organisation_id', organisationId)
    .eq('account_id', accountId)
    .in('journal_id', journalIds)
    .range(offset, offset + pageSize - 1);

  if (fundId) linesQuery = linesQuery.eq('fund_id', fundId);

  const { data: lines, error: linesErr } = await linesQuery;
  if (linesErr) return { data: [], total: 0, error: linesErr.message };

  // 4. Fetch fund names if needed
  const fundIds = [...new Set((lines ?? []).map((l) => l.fund_id).filter(Boolean))] as string[];
  let fundNameMap = new Map<string, string>();
  if (fundIds.length > 0) {
    const { data: funds } = await supabase
      .from('funds')
      .select('id, name')
      .in('id', fundIds);
    for (const f of funds ?? []) {
      fundNameMap.set(f.id, f.name);
    }
  }

  // 5. Build response
  const transactions: DrillDownTransaction[] = (lines ?? []).map((l) => {
    const journal = journalMap.get(l.journal_id);
    return {
      journalId: l.journal_id,
      journalDate: journal?.journal_date ?? '',
      memo: journal?.memo ?? '',
      description: l.description ?? '',
      debitPence: Number(l.debit_pence),
      creditPence: Number(l.credit_pence),
      fundName: l.fund_id ? (fundNameMap.get(l.fund_id) ?? null) : null,
    };
  });

  // Sort by date descending
  transactions.sort((a, b) => b.journalDate.localeCompare(a.journalDate));

  return { data: transactions, total, error: null };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function emptyTotals(): SBvaTotals {
  const emptyCell: SMonthCell = { budget: 0, actual: 0, variance: 0, variancePct: null };
  const months: Record<string, SMonthCell> = {};
  for (const k of MONTH_KEYS) {
    months[k] = { ...emptyCell };
  }
  return { months, ytd: { ...emptyCell }, annual: { ...emptyCell } };
}
