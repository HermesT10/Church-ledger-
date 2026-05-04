import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildFinancialAlerts,
  buildMonthlyIncomeExpense,
  buildRestrictedFundTracker,
  buildYearComparison,
  calculateLoanAndLiabilityTotals,
  sumCashPositionRows,
} from '../src/lib/reports/dashboard-financial-overview';

const dashboardLoader = readFileSync(
  new URL('../src/lib/reports/dashboard.ts', import.meta.url),
  'utf8',
);
const dashboardClient = readFileSync(
  new URL('../src/app/(app)/dashboard/dashboard-client.tsx', import.meta.url),
  'utf8',
);
const dashboardPage = readFileSync(
  new URL('../src/app/(app)/dashboard/page.tsx', import.meta.url),
  'utf8',
);
const dashboardTasks = readFileSync(
  new URL('../src/lib/dashboard/tasks.ts', import.meta.url),
  'utf8',
);
const dashboardTaskActions = readFileSync(
  new URL('../src/app/(app)/dashboard/task-actions.ts', import.meta.url),
  'utf8',
);
const dashboardTasksMigration = readFileSync(
  new URL('../supabase/migrations/20260501110300_dashboard_tasks_calendar.sql', import.meta.url),
  'utf8',
);
const giftAidWidget = readFileSync(
  new URL('../src/app/(app)/dashboard/widgets/gift-aid-summary-widget.tsx', import.meta.url),
  'utf8',
);
const fundBalancesWidget = readFileSync(
  new URL('../src/app/(app)/dashboard/widgets/fund-balances-widget.tsx', import.meta.url),
  'utf8',
);
const auditDoc = readFileSync(
  new URL('../docs/audits/dashboard-financial-overview-audit.md', import.meta.url),
  'utf8',
);
const summaryDoc = readFileSync(
  new URL('../docs/implementation/dashboard-financial-overview-summary.md', import.meta.url),
  'utf8',
);
const cardPurposeAuditDoc = readFileSync(
  new URL('../docs/audits/dashboard-card-purpose-audit.md', import.meta.url),
  'utf8',
);
const cardPurposeSummaryDoc = readFileSync(
  new URL('../docs/implementation/dashboard-card-purpose-refinement-summary.md', import.meta.url),
  'utf8',
);

describe('dashboard financial overview calculations', () => {
  it('calculates cash position totals from dashboard rows', () => {
    expect(sumCashPositionRows([
      { balancePence: 10_000 },
      { balancePence: 25_000 },
      { balancePence: -5_000 },
    ])).toBe(30_000);
  });

  it('calculates restricted fund tracker donated, used, remaining, and status', () => {
    const rows = buildRestrictedFundTracker(
      [{ id: 'fund-1', name: 'Building Fund' }],
      [
        { accountId: 'income', accountType: 'income', fundId: 'fund-1', journalDate: '2026-01-01', debitPence: 0, creditPence: 100_000 },
        { accountId: 'expense', accountType: 'expense', fundId: 'fund-1', journalDate: '2026-01-02', debitPence: 85_000, creditPence: 0 },
      ],
    );

    expect(rows[0]).toMatchObject({
      donatedPence: 100_000,
      usedPence: 85_000,
      remainingPence: 15_000,
      status: 'low_remaining',
      href: '/funds/fund-1',
    });
  });

  it('splits loan-like liabilities from other liabilities', () => {
    const totals = calculateLoanAndLiabilityTotals([
      { code: 'LIA-LOAN', name: 'Church loan', netPence: -50_000 },
      { code: 'LIA-AP', name: 'Accounts payable', netPence: -12_500 },
      { code: 'LIA-CLEAR', name: 'Cleared liability', netPence: 2_000 },
    ]);

    expect(totals.loansOutstandingPence).toBe(50_000);
    expect(totals.otherLiabilitiesPence).toBe(12_500);
  });

  it('builds monthly income and expense totals for a selected year', () => {
    const rows = buildMonthlyIncomeExpense(2026, [
      { accountId: 'income', accountType: 'income', fundId: null, journalDate: '2026-04-10', debitPence: 0, creditPence: 80_000 },
      { accountId: 'expense', accountType: 'expense', fundId: null, journalDate: '2026-04-12', debitPence: 45_000, creditPence: 0 },
      { accountId: 'old', accountType: 'income', fundId: null, journalDate: '2025-04-12', debitPence: 0, creditPence: 99_000 },
    ]);

    expect(rows[3]).toMatchObject({
      month: 'Apr',
      incomePence: 80_000,
      expensePence: 45_000,
      netPence: 35_000,
      incomeHref: '/income/register?year=2026&month=04',
      expenseHref: '/expenses/register?year=2026&month=04',
    });
  });

  it('builds previous year comparison variance and percentages', () => {
    const comparison = buildYearComparison(
      2026,
      [{ accountId: 'income', accountType: 'income', fundId: null, journalDate: '2026-01-01', debitPence: 0, creditPence: 120_000 }],
      [{ accountId: 'income', accountType: 'income', fundId: null, journalDate: '2025-01-01', debitPence: 0, creditPence: 100_000 }],
    );

    expect(comparison.incomeVariancePence).toBe(20_000);
    expect(comparison.incomeVariancePct).toBe(20);
  });

  it('creates plain-language dashboard alerts', () => {
    const alerts = buildFinancialAlerts({
      restrictedFunds: [
        { fundId: 'fund-1', fundName: 'Building Fund', donatedPence: 100, usedPence: 120, remainingPence: -20, status: 'overspent', href: '/funds/fund-1' },
      ],
      loansOutstandingPence: 50_000,
      ytdIncomePence: 20_000,
      ytdExpensePence: 30_000,
      unallocatedBankLines: 2,
      hasGiftAidOpportunity: true,
      uncategorisedExpenseCount: 1,
    });

    expect(alerts.map((alert) => alert.id)).toEqual(expect.arrayContaining([
      'restricted-fund-overspent',
      'loan-balance-exists',
      'expenses-exceed-income',
      'unallocated-bank-lines',
      'gift-aid-opportunity',
      'uncategorised-expenses',
    ]));
  });
});

describe('dashboard financial overview integration', () => {
  it('derives all dashboard overview queries from the active organisation scope', () => {
    expect(dashboardLoader).toContain(".eq('organisation_id', orgId)");
    expect(dashboardLoader).toContain(".eq('workspace_id', orgId)");
    expect(dashboardPage).toContain('getActiveOrg');
  });

  it('exposes drill-down links for meaningful amounts', () => {
    expect(dashboardClient).toContain("href: '/banking'");
    expect(dashboardClient).toContain("href: '/funds?type=restricted'");
    expect(dashboardClient).toContain("href: '/accounts?type=liability'");
    expect(dashboardClient).toContain("href: '/income/register'");
    expect(dashboardClient).toContain("href: '/expenses/register'");
    expect(dashboardClient).toContain('row.incomeHref');
    expect(dashboardClient).toContain('row.expenseHref');
  });

  it('adds setup prompts for dashboard empty states', () => {
    expect(dashboardClient).toContain('Complete your dashboard setup');
    expect(dashboardClient).toContain('Create bank account');
    expect(dashboardClient).toContain('Create restricted fund');
    expect(dashboardClient).toContain('Import bank statement');
    expect(dashboardClient).toContain('Configure accounts');
  });

  it('keeps the redesigned dashboard focused by removing duplicate action and cash cards', () => {
    expect(dashboardClient).toContain('To Do & Alerts');
    expect(dashboardClient).toContain('Day Calendar View');
    expect(dashboardClient).toContain('sortDashboardTasks(items).slice(0, 9)');
    expect(dashboardClient).toContain("visibleCount === 9 ? '9 tasks'");
    expect(dashboardClient).toContain('min-h-[620px] self-stretch');
    expect(dashboardClient).toContain("completed && 'bg-muted/25 text-muted-foreground'");
    expect(dashboardClient).toContain('Total Cash');
    expect(dashboardClient).toContain('Available Cash');
    expect(dashboardClient).toContain('Restricted Cash');
    expect(dashboardClient).toContain('Cash in Hand');
    expect(dashboardClient).not.toContain("key: 'total-cash'");
    expect(dashboardClient).not.toContain('Alerts / Next Actions');
    expect(dashboardClient).not.toContain('Restricted Funds & Commitments');
    expect(dashboardClient).not.toContain('Detected Changes');
    expect(dashboardClient).toContain("case 'cash-position':");
    expect(dashboardClient).toContain('return null;');
  });

  it('places moved dashboard cards explicitly in the redesigned hierarchy', () => {
    expect(dashboardClient).toContain('MANUAL_WIDGET_IDS');
    expect(dashboardClient).toContain('priorityFinanceWidgets');
    expect(dashboardClient).toContain('<FundBalancesWidget key="fund-balances"');
    expect(dashboardClient).toContain('<GiftAidSummaryWidget key="gift-aid-summary"');
    expect(dashboardClient).toContain('<RestrictedFundTracker rows={data.financialOverview.restrictedFundTracker} />');
    expect(dashboardClient).toContain('<MonthlyIncomeExpense data={data} />');
    expect(dashboardClient.match(/<CashPositionOverview/g)?.length).toBe(1);
    expect(dashboardClient.indexOf('<CashPositionOverview rows={data.financialOverview.cashPosition} />')).toBeLessThan(
      dashboardClient.indexOf("{isVisible('todo-list') ? renderWidget('todo-list') : null}"),
    );
    expect(dashboardClient.indexOf('<RestrictedFundTracker rows={data.financialOverview.restrictedFundTracker} />')).toBeLessThan(
      dashboardClient.indexOf("{isVisible('todo-list') ? renderWidget('todo-list') : null}"),
    );
    expect(dashboardClient.indexOf("{isVisible('todo-list') ? renderWidget('todo-list') : null}")).toBeLessThan(
      dashboardClient.indexOf('<DashboardDayCalendarCard events={data.dayCalendarEvents} />'),
    );
    expect(dashboardClient.indexOf('<DashboardDayCalendarCard events={data.dayCalendarEvents} />')).toBeLessThan(
      dashboardClient.indexOf('{priorityFinanceWidgets}'),
    );
  });

  it('persists dashboard tasks and links them to calendar events', () => {
    expect(dashboardTasksMigration).toContain('create table if not exists public.dashboard_tasks');
    expect(dashboardTasksMigration).toContain('calendar_event_id uuid references public.calendar_events(id)');
    expect(dashboardTasksMigration).toContain('idx_dashboard_tasks_workspace_key');
    expect(dashboardTasksMigration).toContain('alter table public.dashboard_tasks force row level security');
    expect(dashboardTasks).toContain('syncDashboardTasks');
    expect(dashboardTasks).toContain('createCalendarEventForTask');
    expect(dashboardTasks).toContain(".in('status', ['active', 'completed', 'inactive'])");
    expect(dashboardTasks).toContain("linked_source_type: 'workflow'");
    expect(dashboardLoader).toContain('mergeDashboardTaskCandidates(todoItems, financialOverview.alerts)');
    expect(dashboardLoader).toContain("key = `financial-alert-${alert.id}`");
    expect(dashboardTaskActions).toContain('setDashboardTaskCompletion');
    expect(dashboardTaskActions).toContain("status: completed ? 'completed' : 'active'");
    expect(dashboardTaskActions).toContain("status: completed ? 'completed' : 'scheduled'");
  });

  it('keeps KPI totals out of the trend chart and replaces them with insights', () => {
    expect(dashboardClient).not.toContain('YTD income</p>');
    expect(dashboardClient).not.toContain('YTD expenses</p>');
    expect(dashboardClient).not.toContain('Net position</p>');
    expect(dashboardClient).toContain('Strongest income month');
    expect(dashboardClient).toContain('Highest expense month');
    expect(dashboardClient).toContain('Current month net');
    expect(dashboardClient).toContain('Biggest net movement');
  });

  it('adds source and reconciliation context to cash position', () => {
    expect(dashboardClient).toContain('Bank statement balance');
    expect(dashboardClient).toContain('Book balance');
    expect(dashboardClient).toContain('Opening balance');
    expect(dashboardClient).toContain('Upload statement');
    expect(dashboardClient).toContain('Open reconciliation');
  });

  it('caps restricted fund tracker rows and provides a full-list drilldown', () => {
    expect(dashboardClient).toContain('rows.slice(0, 10)');
    expect(dashboardClient).toContain('View all restricted funds');
    expect(dashboardClient).toContain('/funds?type=restricted');
  });

  it('keeps Gift Aid action-oriented with a zero-value empty state', () => {
    expect(dashboardClient).toContain('<GiftAidSummaryWidget key="gift-aid-summary"');
    expect(giftAidWidget).toContain('No Gift Aid claim value yet.');
    expect(giftAidWidget).toContain('Prepare claim');
  });

  it('redesigns Fund balances as a compact summary card', () => {
    expect(fundBalancesWidget).toContain('Total fund balance');
    expect(fundBalancesWidget).toContain('restrictedCount');
    expect(fundBalancesWidget).toContain('overspentCount');
    expect(fundBalancesWidget).toContain('visibleFunds');
    expect(fundBalancesWidget).toContain('full funds workspace');
  });

  it('documents the audit and implementation decisions', () => {
    expect(auditDoc).toContain('Data Sources Available');
    expect(auditDoc).toContain('Schema Gaps');
    expect(summaryDoc).toContain('Calculation Rules');
    expect(summaryDoc).toContain('Drill-Down Behaviour');
    expect(cardPurposeAuditDoc).toContain('Duplicated Information Found');
    expect(cardPurposeAuditDoc).toContain('Cards To Keep');
    expect(cardPurposeSummaryDoc).toContain('Card Responsibilities');
    expect(cardPurposeSummaryDoc).toContain('Duplicate Reduction');
  });
});
