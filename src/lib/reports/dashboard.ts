'use server';

import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { getCached, setCached } from '@/lib/cache';
import { timedQuery } from '@/lib/perf';
import type {
  DashboardOverview,
  DashboardOverviewSeries,
  CategoryBreakdown,
  TodoItem,
  DashboardCashPosition,
  DashboardFundBalance,
  DashboardBudgetVsActual,
  DashboardGiftAidSummary,
  DashboardRecentTxn,
  DashboardSupplierSpend,
  DashboardPayrollSummary,
} from './types';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function getDateRange(period: string): {
  start: string;
  end: string;
  priorStart: string;
  priorEnd: string;
  label: string;
} {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based

  switch (period) {
    case 'last_month': {
      const lm = m === 0 ? 11 : m - 1;
      const ly = m === 0 ? y - 1 : y;
      const daysInLM = new Date(ly, lm + 1, 0).getDate();
      const plm = lm === 0 ? 11 : lm - 1;
      const ply = lm === 0 ? ly - 1 : ly;
      const daysInPLM = new Date(ply, plm + 1, 0).getDate();
      return {
        start: `${ly}-${String(lm + 1).padStart(2, '0')}-01`,
        end: `${ly}-${String(lm + 1).padStart(2, '0')}-${daysInLM}`,
        priorStart: `${ply}-${String(plm + 1).padStart(2, '0')}-01`,
        priorEnd: `${ply}-${String(plm + 1).padStart(2, '0')}-${daysInPLM}`,
        label: `${MONTH_NAMES[lm]} ${ly}`,
      };
    }
    case 'ytd': {
      return {
        start: `${y}-01-01`,
        end: now.toISOString().slice(0, 10),
        priorStart: `${y - 1}-01-01`,
        priorEnd: `${y - 1}-12-31`,
        label: `Jan – ${MONTH_NAMES[m]} ${y}`,
      };
    }
    case 'this_month':
    default: {
      const daysInM = new Date(y, m + 1, 0).getDate();
      const pm = m === 0 ? 11 : m - 1;
      const py = m === 0 ? y - 1 : y;
      const daysInPM = new Date(py, pm + 1, 0).getDate();
      return {
        start: `${y}-${String(m + 1).padStart(2, '0')}-01`,
        end: `${y}-${String(m + 1).padStart(2, '0')}-${daysInM}`,
        priorStart: `${py}-${String(pm + 1).padStart(2, '0')}-01`,
        priorEnd: `${py}-${String(pm + 1).padStart(2, '0')}-${daysInPM}`,
        label: `${MONTH_NAMES[m]} ${y}`,
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/*  getDashboardOverview                                               */
/* ------------------------------------------------------------------ */

const CACHE_TTL_MS = 60 * 1000;

export async function getDashboardOverview(params: {
  orgId: string;
  period: string;
  visibleWidgets?: string[];
}): Promise<{ data: DashboardOverview; error: string | null }> {
  const { orgId, period, visibleWidgets = [] } = params;
  const wantWidget = (id: string) => visibleWidgets.includes(id);

  const cacheKey = `dashboard-overview:${orgId}:${period}:${visibleWidgets.sort().join(',')}`;
  const cached = getCached<DashboardOverview>(cacheKey);
  if (cached) return { data: cached, error: null };

  return timedQuery(`getDashboardOverview(${orgId}, ${period})`, async () => {
    const supabase = await createClient();
    const { start, end, priorStart, priorEnd, label } = getDateRange(period);

    // Fetch org name
    const { data: org } = await supabase
      .from('organisations')
      .select('name')
      .eq('id', orgId)
      .single();

    const orgName = org?.name ?? 'Organisation';

    // Fetch posted journals in date range
    const { data: journals } = await supabase
      .from('journals')
      .select('id, journal_date')
      .eq('organisation_id', orgId)
      .eq('status', 'posted')
      .gte('journal_date', start)
      .lte('journal_date', end);

    const journalIds = (journals ?? []).map((j) => j.id);
    const journalDateMap: Record<string, string> = {};
    for (const j of journals ?? []) {
      journalDateMap[j.id] = j.journal_date;
    }

    // Fetch prior period journals
    const { data: priorJournals } = await supabase
      .from('journals')
      .select('id, journal_date')
      .eq('organisation_id', orgId)
      .eq('status', 'posted')
      .gte('journal_date', priorStart)
      .lte('journal_date', priorEnd);

    const priorJournalIds = (priorJournals ?? []).map((j) => j.id);
    const priorJournalDateMap: Record<string, string> = {};
    for (const j of priorJournals ?? []) {
      priorJournalDateMap[j.id] = j.journal_date;
    }

    // Fetch journal lines for current period
    let lines: { account_id: string; debit_pence: number; credit_pence: number; journal_id: string }[] = [];
    if (journalIds.length > 0) {
      const { data: linesData } = await supabase
        .from('journal_lines')
        .select('account_id, debit_pence, credit_pence, journal_id')
        .eq('organisation_id', orgId)
        .in('journal_id', journalIds);
      lines = linesData ?? [];
    }

    // Fetch journal lines for prior period
    let priorLines: { account_id: string; debit_pence: number; credit_pence: number; journal_id: string }[] = [];
    if (priorJournalIds.length > 0) {
      const { data: priorLinesData } = await supabase
        .from('journal_lines')
        .select('account_id, debit_pence, credit_pence, journal_id')
        .eq('organisation_id', orgId)
        .in('journal_id', priorJournalIds);
      priorLines = priorLinesData ?? [];
    }

    // Fetch account info
    const allAccountIds = [
      ...new Set([
        ...lines.map((l) => l.account_id),
        ...priorLines.map((l) => l.account_id),
      ]),
    ];

    let accountMap: Record<string, { type: string; name: string }> = {};
    if (allAccountIds.length > 0) {
      const { data: accounts } = await supabase
        .from('accounts')
        .select('id, type, name')
        .in('id', allAccountIds);

      for (const a of accounts ?? []) {
        accountMap[a.id] = { type: a.type, name: a.name };
      }
    }

    // Aggregate current period
    const monthlyData: Record<string, { income: number; expense: number }> = {};
    const incomeByAccount: Record<string, { name: string; total: number }> = {};
    const expenseByAccount: Record<string, { name: string; total: number }> = {};
    let totalIncomePence = 0;
    let totalExpensePence = 0;

    for (const line of lines) {
      const acc = accountMap[line.account_id];
      if (!acc) continue;

      const journalDate = journalDateMap[line.journal_id];
      if (!journalDate) continue;

      let netPence = 0;
      if (acc.type === 'income') {
        netPence = line.credit_pence - line.debit_pence;
        totalIncomePence += netPence;

        if (!incomeByAccount[line.account_id]) {
          incomeByAccount[line.account_id] = { name: acc.name, total: 0 };
        }
        incomeByAccount[line.account_id].total += netPence;
      } else if (acc.type === 'expense') {
        netPence = line.debit_pence - line.credit_pence;
        totalExpensePence += netPence;

        if (!expenseByAccount[line.account_id]) {
          expenseByAccount[line.account_id] = { name: acc.name, total: 0 };
        }
        expenseByAccount[line.account_id].total += netPence;
      } else {
        continue;
      }

      // Group by month for chart series
      const monthIdx = new Date(journalDate).getMonth();
      const monthLabel = MONTH_NAMES[monthIdx];
      if (!monthlyData[monthLabel]) {
        monthlyData[monthLabel] = { income: 0, expense: 0 };
      }
      if (acc.type === 'income') {
        monthlyData[monthLabel].income += netPence;
      } else {
        monthlyData[monthLabel].expense += netPence;
      }
    }

    // Build the chart series (YTD shows all months up to current, this_month/last_month just the single month)
    const series: DashboardOverviewSeries[] = [];
    if (period === 'ytd') {
      const currentMonth = new Date().getMonth();
      for (let i = 0; i <= currentMonth; i++) {
        const ml = MONTH_NAMES[i];
        const entry = monthlyData[ml] ?? { income: 0, expense: 0 };
        series.push({
          dateLabel: ml,
          income: Math.round(entry.income) / 100,
          expense: Math.round(entry.expense) / 100,
        });
      }
    } else {
      // For single month, aggregate into a single point or by week for visual interest
      // We'll show last 6 months for context regardless of period selection
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const ml = MONTH_NAMES[d.getMonth()];
        const entry = monthlyData[ml] ?? { income: 0, expense: 0 };
        series.push({
          dateLabel: ml,
          income: Math.round(entry.income) / 100,
          expense: Math.round(entry.expense) / 100,
        });
      }
    }

    // Find peak income date
    let peakDate: string | null = null;
    let peakIncome = 0;
    if (series.length > 0) {
      let maxIncome = 0;
      for (const s of series) {
        if (s.income > maxIncome) {
          maxIncome = s.income;
          peakDate = s.dateLabel;
          peakIncome = s.income;
        }
      }
    }

    // Aggregate prior period
    let priorIncomePence = 0;
    let priorExpensePence = 0;
    for (const line of priorLines) {
      const acc = accountMap[line.account_id];
      if (!acc) continue;
      if (acc.type === 'income') {
        priorIncomePence += line.credit_pence - line.debit_pence;
      } else if (acc.type === 'expense') {
        priorExpensePence += line.debit_pence - line.credit_pence;
      }
    }

    // Build breakdowns (top 5)
    const incomeBreakdown: CategoryBreakdown[] = Object.values(incomeByAccount)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map((item) => ({
        name: item.name,
        amountPence: item.total,
        pct: totalIncomePence > 0 ? Math.round((item.total / totalIncomePence) * 1000) / 10 : 0,
      }));

    const expenseBreakdown: CategoryBreakdown[] = Object.values(expenseByAccount)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map((item) => ({
        name: item.name,
        amountPence: item.total,
        pct: totalExpensePence > 0 ? Math.round((item.total / totalExpensePence) * 1000) / 10 : 0,
      }));

    // Build to-do items — query many real data sources in parallel
    const todoItems: TodoItem[] = [];
    const today = new Date().toISOString().slice(0, 10);

    const [
      unpaidBillsRes,
      overdueBillsRes,
      pendingInvoicesRes,
      pendingExpensesRes,
      draftBudgetsRes,
      unallocatedBankLinesRes,
      cashSpendsMissingReceiptsRes,
      expenseMissingReceiptsRes,
      draftPaymentRunsRes,
      draftPayrollRunsRes,
      gaDonationsRes,
      overspentFundsRes,
    ] = await Promise.all([
      // 1. Unpaid bills (approved/posted but not paid)
      supabase
        .from('bills')
        .select('*', { count: 'exact', head: true })
        .eq('organisation_id', orgId)
        .in('status', ['approved', 'posted']),

      // 2. Overdue bills (due_date < today AND not paid)
      supabase
        .from('bills')
        .select('*', { count: 'exact', head: true })
        .eq('organisation_id', orgId)
        .in('status', ['approved', 'posted'])
        .lt('due_date', today),

      // 3. Pending invoice submissions
      supabase
        .from('invoice_submissions')
        .select('*', { count: 'exact', head: true })
        .eq('organisation_id', orgId)
        .eq('status', 'pending'),

      // 4. Pending expense requests
      supabase
        .from('expense_requests')
        .select('*', { count: 'exact', head: true })
        .eq('organisation_id', orgId)
        .eq('status', 'pending'),

      // 5. Draft budgets
      supabase
        .from('budgets')
        .select('*', { count: 'exact', head: true })
        .eq('organisation_id', orgId)
        .eq('status', 'draft'),

      // 6. Unallocated bank lines
      supabase
        .from('bank_lines')
        .select('*', { count: 'exact', head: true })
        .eq('organisation_id', orgId)
        .eq('allocated', false),

      // 7. Cash spends missing receipts (posted but no receipt_url)
      supabase
        .from('cash_spends')
        .select('*', { count: 'exact', head: true })
        .eq('organisation_id', orgId)
        .eq('status', 'posted')
        .is('receipt_url', null),

      // 8. Expense requests approved/converted but missing receipt
      supabase
        .from('expense_requests')
        .select('*', { count: 'exact', head: true })
        .eq('organisation_id', orgId)
        .in('status', ['approved', 'converted'])
        .is('receipt_url', null),

      // 9. Draft payment runs
      supabase
        .from('payment_runs')
        .select('*', { count: 'exact', head: true })
        .eq('organisation_id', orgId)
        .eq('status', 'draft'),

      // 10. Draft payroll runs
      supabase
        .from('payroll_runs')
        .select('*', { count: 'exact', head: true })
        .eq('organisation_id', orgId)
        .eq('status', 'draft'),

      // 11. Unclaimed Gift Aid donations
      supabase
        .from('donations')
        .select('amount_pence')
        .eq('organisation_id', orgId)
        .eq('status', 'posted')
        .is('gift_aid_claim_id', null)
        .limit(1),

      // 12. Overspent restricted funds — fetch restricted funds with balance info
      // We query funds + aggregate net movements from journal_lines
      supabase
        .from('funds')
        .select('id, name, type')
        .eq('organisation_id', orgId)
        .eq('type', 'restricted')
        .eq('is_active', true),
    ]);

    // --- Overdue bills (highest priority — red warning) ---
    const overdueBills = overdueBillsRes.count ?? 0;
    if (overdueBills > 0) {
      todoItems.push({
        label: `${overdueBills} overdue invoice${overdueBills === 1 ? '' : 's'} — payment past due`,
        href: '/bills?status=approved',
        type: 'warning',
      });
    }

    // --- Unpaid bills (excluding overdue to avoid double-counting) ---
    const unpaidBills = (unpaidBillsRes.count ?? 0) - overdueBills;
    if (unpaidBills > 0) {
      todoItems.push({
        label: `${unpaidBills} invoice${unpaidBills === 1 ? '' : 's'} awaiting payment`,
        href: '/bills?status=approved',
        type: 'action',
      });
    }

    // --- Pending invoice submissions ---
    const pendingInvoices = pendingInvoicesRes.count ?? 0;
    if (pendingInvoices > 0) {
      todoItems.push({
        label: `${pendingInvoices} invoice submission${pendingInvoices === 1 ? '' : 's'} to review`,
        href: '/workflows/invoices?status=pending',
        type: 'action',
      });
    }

    // --- Pending expense requests ---
    const pendingExpenses = pendingExpensesRes.count ?? 0;
    if (pendingExpenses > 0) {
      todoItems.push({
        label: `${pendingExpenses} expense request${pendingExpenses === 1 ? '' : 's'} to review`,
        href: '/workflows/expenses?status=pending',
        type: 'action',
      });
    }

    // --- Cash spends missing receipts ---
    const cashMissingReceipts = cashSpendsMissingReceiptsRes.count ?? 0;
    if (cashMissingReceipts > 0) {
      todoItems.push({
        label: `${cashMissingReceipts} cash spend${cashMissingReceipts === 1 ? '' : 's'} missing receipt`,
        href: '/cash/spends',
        type: 'warning',
      });
    }

    // --- Expense requests missing receipts ---
    const expMissingReceipts = expenseMissingReceiptsRes.count ?? 0;
    if (expMissingReceipts > 0) {
      todoItems.push({
        label: `${expMissingReceipts} approved expense${expMissingReceipts === 1 ? '' : 's'} missing receipt`,
        href: '/workflows/expenses',
        type: 'warning',
      });
    }

    // --- Unallocated bank lines ---
    const unallocated = unallocatedBankLinesRes.count ?? 0;
    if (unallocated > 0) {
      todoItems.push({
        label: `${unallocated} bank transaction${unallocated === 1 ? '' : 's'} to allocate`,
        href: '/banking',
        type: 'action',
      });
    }

    // --- Draft payment runs ---
    const draftPaymentRuns = draftPaymentRunsRes.count ?? 0;
    if (draftPaymentRuns > 0) {
      todoItems.push({
        label: `${draftPaymentRuns} payment run${draftPaymentRuns === 1 ? '' : 's'} awaiting posting`,
        href: '/payment-runs',
        type: 'action',
      });
    }

    // --- Draft payroll runs ---
    const draftPayrollRuns = draftPayrollRunsRes.count ?? 0;
    if (draftPayrollRuns > 0) {
      todoItems.push({
        label: `${draftPayrollRuns} payroll run${draftPayrollRuns === 1 ? '' : 's'} awaiting posting`,
        href: '/payroll',
        type: 'action',
      });
    }

    // --- Draft budgets ---
    const draftBudgets = draftBudgetsRes.count ?? 0;
    if (draftBudgets > 0) {
      todoItems.push({
        label: `${draftBudgets} draft budget${draftBudgets === 1 ? '' : 's'} to approve`,
        href: '/budgets',
        type: 'info',
      });
    }

    // --- Overspent restricted funds ---
    const restrictedFunds = overspentFundsRes.data ?? [];
    if (restrictedFunds.length > 0) {
      // For each restricted fund, check balance via journal_lines aggregate
      const fundIds = restrictedFunds.map((f) => f.id);
      const { data: fundBalances } = await supabase
        .from('journal_lines')
        .select('fund_id, debit_pence, credit_pence')
        .eq('organisation_id', orgId)
        .in('fund_id', fundIds);

      const balanceByFund: Record<string, number> = {};
      for (const line of fundBalances ?? []) {
        if (!line.fund_id) continue;
        if (!balanceByFund[line.fund_id]) balanceByFund[line.fund_id] = 0;
        balanceByFund[line.fund_id] += (line.debit_pence ?? 0) - (line.credit_pence ?? 0);
      }

      const overspentNames: string[] = [];
      for (const fund of restrictedFunds) {
        const bal = balanceByFund[fund.id] ?? 0;
        // For restricted funds: if balance (debits - credits) > 0, expenses exceed income
        // Actually, net = income credits - expense debits; if net < 0, overspent
        // But since we're summing debit-credit, a positive number means net outflow
        if (bal > 0) {
          overspentNames.push(fund.name);
        }
      }

      if (overspentNames.length > 0) {
        todoItems.push({
          label: `${overspentNames.length} restricted fund${overspentNames.length === 1 ? '' : 's'} overspent — ${overspentNames.slice(0, 2).join(', ')}${overspentNames.length > 2 ? '…' : ''}`,
          href: '/funds',
          type: 'warning',
        });
      }
    }

    // --- Unclaimed Gift Aid ---
    if (gaDonationsRes.data && gaDonationsRes.data.length > 0) {
      todoItems.push({
        label: 'Gift Aid claims available to submit',
        href: '/gift-aid/new',
        type: 'info',
      });
    }

    // --- Static reconciliation prompt only if no unallocated lines already shown ---
    if (unallocated === 0) {
      todoItems.push({
        label: 'Review bank reconciliation',
        href: '/reconciliation',
        type: 'info',
      });
    }

    /* ================================================================ */
    /*  Optional widget data — only fetched when the widget is visible  */
    /* ================================================================ */

    let cashPosition: DashboardCashPosition[] | undefined;
    let fundBalancesData: DashboardFundBalance[] | undefined;
    let budgetVsActual: DashboardBudgetVsActual | undefined;
    let giftAidSummary: DashboardGiftAidSummary | undefined;
    let recentTransactions: DashboardRecentTxn[] | undefined;
    let supplierSpend: DashboardSupplierSpend[] | undefined;
    let payrollSummary: DashboardPayrollSummary | null | undefined;

    // Cash Position widget
    if (wantWidget('cash-position')) {
      const { data: bankAccounts } = await supabase
        .from('bank_accounts')
        .select('id, name')
        .eq('organisation_id', orgId)
        .eq('is_active', true);

      if (bankAccounts && bankAccounts.length > 0) {
        const baIds = bankAccounts.map((ba) => ba.id);
        const { data: glAccounts } = await supabase
          .from('accounts')
          .select('id, name, code')
          .eq('organisation_id', orgId)
          .eq('type', 'asset')
          .eq('is_system', true);

        const glAccountIds = (glAccounts ?? []).map((a) => a.id);
        let glBalanceMap: Record<string, number> = {};

        if (glAccountIds.length > 0) {
          const { data: glLines } = await supabase
            .from('journal_lines')
            .select('account_id, debit_pence, credit_pence')
            .eq('organisation_id', orgId)
            .in('account_id', glAccountIds);

          for (const line of glLines ?? []) {
            if (!glBalanceMap[line.account_id]) glBalanceMap[line.account_id] = 0;
            glBalanceMap[line.account_id] += (line.debit_pence ?? 0) - (line.credit_pence ?? 0);
          }
        }

        cashPosition = bankAccounts.map((ba, idx) => ({
          bankAccountId: ba.id,
          bankAccountName: ba.name,
          glBalancePence: glAccountIds[idx] ? (glBalanceMap[glAccountIds[idx]] ?? 0) : 0,
        }));
      }
    }

    // Fund Balances widget
    if (wantWidget('fund-balances')) {
      const { data: allFunds } = await supabase
        .from('funds')
        .select('id, name, type')
        .eq('organisation_id', orgId)
        .eq('is_active', true)
        .order('name');

      if (allFunds && allFunds.length > 0) {
        const fIds = allFunds.map((f) => f.id);
        const { data: fLines } = await supabase
          .from('journal_lines')
          .select('fund_id, debit_pence, credit_pence')
          .eq('organisation_id', orgId)
          .in('fund_id', fIds);

        const balMap: Record<string, number> = {};
        for (const line of fLines ?? []) {
          if (!line.fund_id) continue;
          if (!balMap[line.fund_id]) balMap[line.fund_id] = 0;
          // Net balance: credits - debits (positive = surplus)
          balMap[line.fund_id] += (line.credit_pence ?? 0) - (line.debit_pence ?? 0);
        }

        fundBalancesData = allFunds.map((f) => {
          const bal = balMap[f.id] ?? 0;
          return {
            fundId: f.id,
            fundName: f.name,
            fundType: f.type,
            balancePence: bal,
            isOverspent: f.type === 'restricted' && bal < 0,
          };
        });
      }
    }

    // Budget vs Actual widget
    if (wantWidget('budget-vs-actual')) {
      const currentYear = new Date().getFullYear();
      const { data: approvedBudgets } = await supabase
        .from('budgets')
        .select('id')
        .eq('organisation_id', orgId)
        .eq('financial_year', currentYear)
        .eq('status', 'approved')
        .limit(1);

      if (approvedBudgets && approvedBudgets.length > 0) {
        const budgetId = approvedBudgets[0].id;
        const { data: bLines } = await supabase
          .from('budget_lines')
          .select('planned_amount_pence')
          .eq('budget_id', budgetId);

        const totalBudgetPence = (bLines ?? []).reduce((s, l) => s + (l.planned_amount_pence ?? 0), 0);
        const totalActualPence = totalIncomePence - totalExpensePence;
        const variancePence = totalActualPence - totalBudgetPence;
        const variancePct = totalBudgetPence !== 0
          ? Math.round((variancePence / Math.abs(totalBudgetPence)) * 1000) / 10
          : 0;

        budgetVsActual = { totalBudgetPence, totalActualPence, variancePence, variancePct };
      }
    }

    // Gift Aid Summary widget
    if (wantWidget('gift-aid-summary')) {
      const [eligibleRes, claimedRes, missingDeclRes] = await Promise.all([
        supabase
          .from('donations')
          .select('amount_pence')
          .eq('organisation_id', orgId)
          .eq('status', 'posted')
          .eq('gift_aid_eligible', true)
          .is('gift_aid_claim_id', null),
        supabase
          .from('gift_aid_claims')
          .select('total_gift_aid_pence, status')
          .eq('organisation_id', orgId),
        supabase
          .from('donors')
          .select('id', { count: 'exact', head: true })
          .eq('organisation_id', orgId)
          .not('id', 'in', `(select donor_id from gift_aid_declarations where active = true AND organisation_id = '${orgId}')`)
      ]);

      const estimatedReclaimPence = (eligibleRes.data ?? []).reduce(
        (s, d) => s + Math.round((d.amount_pence ?? 0) * 0.25), 0
      );
      const claimedPence = (claimedRes.data ?? [])
        .filter((c) => c.status === 'paid' || c.status === 'submitted')
        .reduce((s, c) => s + (c.total_gift_aid_pence ?? 0), 0);

      giftAidSummary = {
        estimatedReclaimPence,
        claimedPence,
        outstandingPence: estimatedReclaimPence - claimedPence,
        donorsMissingDeclarations: missingDeclRes.count ?? 0,
      };
    }

    // Recent Transactions widget
    if (wantWidget('recent-transactions')) {
      const { data: recentJournals } = await supabase
        .from('journals')
        .select('id, journal_date, description, source_type')
        .eq('organisation_id', orgId)
        .eq('status', 'posted')
        .order('journal_date', { ascending: false })
        .limit(10);

      if (recentJournals && recentJournals.length > 0) {
        const rjIds = recentJournals.map((j) => j.id);
        const { data: rjLines } = await supabase
          .from('journal_lines')
          .select('journal_id, debit_pence')
          .eq('organisation_id', orgId)
          .in('journal_id', rjIds);

        const debitTotals: Record<string, number> = {};
        for (const l of rjLines ?? []) {
          if (!debitTotals[l.journal_id]) debitTotals[l.journal_id] = 0;
          debitTotals[l.journal_id] += l.debit_pence ?? 0;
        }

        recentTransactions = recentJournals.map((j) => ({
          id: j.id,
          date: j.journal_date,
          description: j.description ?? j.source_type ?? 'Journal',
          amountPence: debitTotals[j.id] ?? 0,
          type: j.source_type ?? 'manual',
        }));
      }
    }

    // Supplier Spend widget
    if (wantWidget('supplier-spend')) {
      const { data: bills } = await supabase
        .from('bills')
        .select('supplier_id, total_pence')
        .eq('organisation_id', orgId)
        .in('status', ['posted', 'paid'])
        .gte('issue_date', start)
        .lte('issue_date', end);

      if (bills && bills.length > 0) {
        const supplierIds = [...new Set(bills.map((b) => b.supplier_id).filter(Boolean))] as string[];
        const spendMap: Record<string, number> = {};
        for (const b of bills) {
          if (!b.supplier_id) continue;
          if (!spendMap[b.supplier_id]) spendMap[b.supplier_id] = 0;
          spendMap[b.supplier_id] += b.total_pence ?? 0;
        }

        let nameMap: Record<string, string> = {};
        if (supplierIds.length > 0) {
          const { data: suppliers } = await supabase
            .from('suppliers')
            .select('id, name')
            .in('id', supplierIds);
          for (const s of suppliers ?? []) {
            nameMap[s.id] = s.name;
          }
        }

        supplierSpend = Object.entries(spendMap)
          .map(([sid, total]) => ({ supplierName: nameMap[sid] ?? 'Unknown', totalPence: total }))
          .sort((a, b) => b.totalPence - a.totalPence)
          .slice(0, 5);
      }
    }

    // Payroll Summary widget
    if (wantWidget('payroll-summary')) {
      const { data: latestPayroll } = await supabase
        .from('payroll_runs')
        .select('id, period_start, period_end, total_gross_pence, total_net_pence, status')
        .eq('organisation_id', orgId)
        .order('period_end', { ascending: false })
        .limit(1);

      if (latestPayroll && latestPayroll.length > 0) {
        const pr = latestPayroll[0];
        payrollSummary = {
          periodLabel: `${pr.period_start} – ${pr.period_end}`,
          grossPence: pr.total_gross_pence ?? 0,
          netPence: pr.total_net_pence ?? 0,
          status: pr.status,
        };
      } else {
        payrollSummary = null;
      }
    }

    const result: DashboardOverview = {
      orgName,
      periodLabel: label,
      series,
      totals: {
        incomePence: totalIncomePence,
        expensePence: totalExpensePence,
        netPence: totalIncomePence - totalExpensePence,
      },
      priorPeriodTotals:
        priorJournalIds.length > 0
          ? { incomePence: priorIncomePence, expensePence: priorExpensePence }
          : null,
      peakDate,
      peakIncome: Math.round(peakIncome * 100) / 100,
      incomeBreakdown,
      expenseBreakdown,
      todoItems,
      ...(cashPosition ? { cashPosition } : {}),
      ...(fundBalancesData ? { fundBalances: fundBalancesData } : {}),
      ...(budgetVsActual ? { budgetVsActual } : {}),
      ...(giftAidSummary ? { giftAidSummary } : {}),
      ...(recentTransactions ? { recentTransactions } : {}),
      ...(supplierSpend ? { supplierSpend } : {}),
      ...(payrollSummary !== undefined ? { payrollSummary } : {}),
    };

    setCached(cacheKey, result, CACHE_TTL_MS);

    return { data: result, error: null };
  });
}
