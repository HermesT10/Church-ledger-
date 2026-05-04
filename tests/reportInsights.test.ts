import { describe, expect, it } from 'vitest';
import {
  buildDateScope,
  buildFundFilterLabel,
  formatCurrencyFromPence,
} from '@/lib/reports/framework';
import {
  buildBalanceSheetInsights,
  buildBudgetInsights,
  buildCashPositionInsights,
  buildFundInsights,
  buildIncomeStatementInsights,
  buildLeadershipInsights,
} from '@/lib/reports/insights';
import type {
  BvaReportData,
  SBSReport,
  SCashPositionReport,
  SFMReport,
  SIEReport,
  STrusteeSnapshot,
} from '@/lib/reports/types';

describe('report framework helpers', () => {
  it('formats compact and standard currency correctly', () => {
    expect(formatCurrencyFromPence(12345)).toBe('£123.45');
    expect(formatCurrencyFromPence(-123450000, { compact: true })).toBe('-£1.2m');
  });

  it('builds readable date scopes and fund labels', () => {
    expect(buildDateScope({ asOfDate: '2026-03-31' })).toBe('As of 2026-03-31');
    expect(buildDateScope({ year: 2026, month: 3 })).toBe('March 2026');
    expect(
      buildFundFilterLabel('fund-1', [{ id: 'fund-1', name: 'General Fund' }]),
    ).toBe('General Fund');
    expect(buildFundFilterLabel(null, [])).toBe('All funds');
  });
});

describe('report insight builders', () => {
  it('flags an out-of-balance balance sheet as critical', () => {
    const report: SBSReport = {
      asOfDate: '2026-03-31',
      sections: {
        assets: { rows: [], total: 1000 },
        liabilities: { rows: [], total: 200 },
        equity: { rows: [], total: 700 },
      },
      netAssets: 800,
      check: {
        balances: false,
        difference: 100,
      },
    };

    expect(buildBalanceSheetInsights(report)[0].tone).toBe('critical');
  });

  it('flags overspent restricted funds', () => {
    const report: SFMReport = {
      period: {
        year: 2026,
        startDate: '2026-01-01',
        endDate: '2026-03-31',
      },
      funds: [
        {
          fundId: 'f1',
          fundName: 'Youth Fund',
          fundType: 'restricted',
          openingBalancePence: 1000,
          incomePence: 0,
          expenditurePence: 5000,
          netMovementPence: -5000,
          closingBalancePence: -4000,
        },
      ],
      totals: {
        openingBalancePence: 1000,
        incomePence: 0,
        expenditurePence: 5000,
        netMovementPence: -5000,
        closingBalancePence: -4000,
      },
    };

    expect(buildFundInsights(report)[0].tone).toBe('critical');
  });

  it('identifies negative cash differences as critical', () => {
    const report: SCashPositionReport = {
      asOfDate: '2026-03-31',
      rows: [
        {
          bankAccountId: 'ba1',
          bankAccountName: 'Main Account',
          bankStatementBalancePence: 10000,
          glBalancePence: 9000,
          differencePence: 1000,
        },
      ],
      totalStatementPence: 10000,
      totalGLPence: 9000,
      totalDifferencePence: 1000,
    };

    expect(buildCashPositionInsights(report)[0].tone).toBe('critical');
  });

  it('builds budget insight using adverse rows', () => {
    const data: BvaReportData = {
      rows: [
        {
          accountId: 'a1',
          accountCode: '4000',
          accountName: 'Utilities',
          accountType: 'expense',
          months: {
            jan: { budget: 100, actual: 150, variance: 50, variancePct: 0.5 },
            feb: { budget: 0, actual: 0, variance: 0, variancePct: null },
            mar: { budget: 0, actual: 0, variance: 0, variancePct: null },
            apr: { budget: 0, actual: 0, variance: 0, variancePct: null },
            may: { budget: 0, actual: 0, variance: 0, variancePct: null },
            jun: { budget: 0, actual: 0, variance: 0, variancePct: null },
            jul: { budget: 0, actual: 0, variance: 0, variancePct: null },
            aug: { budget: 0, actual: 0, variance: 0, variancePct: null },
            sep: { budget: 0, actual: 0, variance: 0, variancePct: null },
            oct: { budget: 0, actual: 0, variance: 0, variancePct: null },
            nov: { budget: 0, actual: 0, variance: 0, variancePct: null },
            dec: { budget: 0, actual: 0, variance: 0, variancePct: null },
          },
          ytd: { budget: 100, actual: 150, variance: 50, variancePct: 0.5 },
          annual: { budget: 100, actual: 150, variance: 50, variancePct: 0.5 },
        },
      ],
      totals: {
        months: {
          jan: { budget: 100, actual: 150, variance: 50, variancePct: 0.5 },
          feb: { budget: 0, actual: 0, variance: 0, variancePct: null },
          mar: { budget: 0, actual: 0, variance: 0, variancePct: null },
          apr: { budget: 0, actual: 0, variance: 0, variancePct: null },
          may: { budget: 0, actual: 0, variance: 0, variancePct: null },
          jun: { budget: 0, actual: 0, variance: 0, variancePct: null },
          jul: { budget: 0, actual: 0, variance: 0, variancePct: null },
          aug: { budget: 0, actual: 0, variance: 0, variancePct: null },
          sep: { budget: 0, actual: 0, variance: 0, variancePct: null },
          oct: { budget: 0, actual: 0, variance: 0, variancePct: null },
          nov: { budget: 0, actual: 0, variance: 0, variancePct: null },
          dec: { budget: 0, actual: 0, variance: 0, variancePct: null },
        },
        ytd: { budget: 100, actual: 150, variance: 50, variancePct: 0.5 },
        annual: { budget: 100, actual: 150, variance: 50, variancePct: 0.5 },
      },
      budgets: [],
      funds: [],
    };

    const insights = buildBudgetInsights(data, 'YTD');
    expect(insights[0].tone).toBe('caution');
    expect(insights[0].body).toContain('1 account');
  });

  it('summarises leadership risk when forecast is at risk', () => {
    const snapshot: STrusteeSnapshot = {
      asOfDate: '2026-03-31',
      cash: { items: [], total: 250000 },
      funds: {
        restrictedTotal: -1000,
        unrestrictedTotal: 10000,
        designatedTotal: 3000,
      },
      incomeExpenditure: {
        mtd: { income: 1000, expense: 1200, surplus: -200 },
        ytd: { income: 5000, expense: 7000, surplus: -2000 },
      },
      topVariances: [],
      forecast: {
        baselineYE: 1000,
        trendYE: -5000,
        riskLevel: 'AT_RISK',
      },
    };

    expect(buildLeadershipInsights(snapshot)[0].tone).toBe('critical');
  });

  it('produces positive income statement insight for surplus months', () => {
    const report: SIEReport = {
      categories: [],
      totals: {
        monthlyActual: 2000,
        ytdActual: 4000,
      },
    };

    expect(buildIncomeStatementInsights(report)[0].tone).toBe('positive');
  });
});
