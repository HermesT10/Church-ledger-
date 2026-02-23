import { describe, it, expect } from 'vitest';
import {
  buildTrusteeSnapshot,
  type SnapshotAssetRow,
  type SnapshotFundRow,
  type SnapshotIECategory,
  type SnapshotIETotals,
  type SnapshotAlert,
  type SnapshotForecastSummary,
} from '@/lib/reports/trusteeSnapshot';

/* ------------------------------------------------------------------ */
/*  Factory helpers                                                    */
/* ------------------------------------------------------------------ */

function makeAssetRow(
  id: string,
  name: string,
  balance: bigint,
): SnapshotAssetRow {
  return { accountId: id, accountName: name, accountCode: `AST-${id}`, balance };
}

function makeFundRow(type: string, closing: bigint): SnapshotFundRow {
  return { fundType: type, closingBalancePence: closing };
}

function makeIECategories(
  incomeMonthly: bigint,
  incomeYtd: bigint,
  expenseMonthly: bigint,
  expenseYtd: bigint,
): SnapshotIECategory[] {
  return [
    {
      categoryName: 'Income',
      totals: { monthlyActual: incomeMonthly, ytdActual: incomeYtd },
    },
    {
      categoryName: 'Expenses',
      totals: { monthlyActual: expenseMonthly, ytdActual: expenseYtd },
    },
  ];
}

function makeAlert(
  id: string,
  name: string,
  type: string,
  variance: bigint,
  pct: number | null = null,
): SnapshotAlert {
  return {
    accountId: id,
    accountCode: `EXP-${id}`,
    accountName: name,
    accountType: type,
    adverseVariancePence: variance,
    adverseVariancePct: pct,
  };
}

function makeForecast(
  baselineYE: bigint,
  trendYE: bigint,
  riskLevel: 'ON_TRACK' | 'AT_RISK',
): SnapshotForecastSummary {
  return {
    baseline: { forecastYearEndActualTotal: baselineYE },
    trend: { forecastYearEndActualTotal: trendYE },
    riskLevel,
  };
}

const DEFAULT_DATE = '2026-02-12';

/* ------------------------------------------------------------------ */
/*  1. Cash total ties to filtered asset rows                          */
/* ------------------------------------------------------------------ */

describe('buildTrusteeSnapshot - cash snapshot', () => {
  it('only includes asset rows matching "bank" or "cash" pattern and total ties', () => {
    const assetRows = [
      makeAssetRow('1', 'Bank Account 1', 500000n),
      makeAssetRow('2', 'Bank Account 2', 300000n),
      makeAssetRow('3', 'Petty Cash', 5000n),
      makeAssetRow('4', 'Equipment', 120000n),
      makeAssetRow('5', 'Property', 2000000n),
    ];

    const snapshot = buildTrusteeSnapshot({
      balanceSheetAssets: {
        rows: assetRows,
        total: assetRows.reduce((s, r) => s + r.balance, 0n),
      },
      fundRows: [],
      ieCategories: [],
      ieTotals: { monthlyActual: 0n, ytdActual: 0n },
      alerts: [],
      forecast: null,
      asOfDate: DEFAULT_DATE,
    });

    // Only Bank Account 1, Bank Account 2, Petty Cash
    expect(snapshot.cash.items).toHaveLength(3);
    expect(snapshot.cash.items.map((i) => i.accountName)).toEqual([
      'Bank Account 1',
      'Bank Account 2',
      'Petty Cash',
    ]);
    // Total = 500000 + 300000 + 5000 = 805000
    expect(snapshot.cash.total).toBe(805000n);
    // Verify total equals sum of items
    const itemSum = snapshot.cash.items.reduce((s, i) => s + i.balance, 0n);
    expect(snapshot.cash.total).toBe(itemSum);
  });

  it('returns empty cash when no bank/cash accounts exist', () => {
    const assetRows = [makeAssetRow('1', 'Equipment', 50000n)];

    const snapshot = buildTrusteeSnapshot({
      balanceSheetAssets: { rows: assetRows, total: 50000n },
      fundRows: [],
      ieCategories: [],
      ieTotals: { monthlyActual: 0n, ytdActual: 0n },
      alerts: [],
      forecast: null,
      asOfDate: DEFAULT_DATE,
    });

    expect(snapshot.cash.items).toHaveLength(0);
    expect(snapshot.cash.total).toBe(0n);
  });
});

/* ------------------------------------------------------------------ */
/*  2. Fund balances group correctly                                   */
/* ------------------------------------------------------------------ */

describe('buildTrusteeSnapshot - fund balances', () => {
  it('groups closing balances by fund type', () => {
    const fundRows = [
      makeFundRow('restricted', 100000n),
      makeFundRow('restricted', 50000n),
      makeFundRow('unrestricted', 200000n),
      makeFundRow('designated', 30000n),
      makeFundRow('unrestricted', 75000n),
      makeFundRow('designated', 20000n),
    ];

    const snapshot = buildTrusteeSnapshot({
      balanceSheetAssets: { rows: [], total: 0n },
      fundRows,
      ieCategories: [],
      ieTotals: { monthlyActual: 0n, ytdActual: 0n },
      alerts: [],
      forecast: null,
      asOfDate: DEFAULT_DATE,
    });

    expect(snapshot.funds.restrictedTotal).toBe(150000n);
    expect(snapshot.funds.unrestrictedTotal).toBe(275000n);
    expect(snapshot.funds.designatedTotal).toBe(50000n);
  });
});

/* ------------------------------------------------------------------ */
/*  3. I&E extracts MTD and YTD correctly                              */
/* ------------------------------------------------------------------ */

describe('buildTrusteeSnapshot - income & expenditure', () => {
  it('extracts MTD and YTD income, expense, surplus', () => {
    const categories = makeIECategories(
      3000n,   // income monthly
      25000n,  // income YTD
      2000n,   // expense monthly
      18000n,  // expense YTD
    );
    const ieTotals: SnapshotIETotals = {
      monthlyActual: 1000n, // surplus monthly (income - expense)
      ytdActual: 7000n,     // surplus YTD
    };

    const snapshot = buildTrusteeSnapshot({
      balanceSheetAssets: { rows: [], total: 0n },
      fundRows: [],
      ieCategories: categories,
      ieTotals,
      alerts: [],
      forecast: null,
      asOfDate: DEFAULT_DATE,
    });

    expect(snapshot.incomeExpenditure.mtd.income).toBe(3000n);
    expect(snapshot.incomeExpenditure.mtd.expense).toBe(2000n);
    expect(snapshot.incomeExpenditure.mtd.surplus).toBe(1000n);
    expect(snapshot.incomeExpenditure.ytd.income).toBe(25000n);
    expect(snapshot.incomeExpenditure.ytd.expense).toBe(18000n);
    expect(snapshot.incomeExpenditure.ytd.surplus).toBe(7000n);
  });

  it('handles missing I&E categories gracefully', () => {
    const snapshot = buildTrusteeSnapshot({
      balanceSheetAssets: { rows: [], total: 0n },
      fundRows: [],
      ieCategories: [],
      ieTotals: { monthlyActual: 0n, ytdActual: 0n },
      alerts: [],
      forecast: null,
      asOfDate: DEFAULT_DATE,
    });

    expect(snapshot.incomeExpenditure.mtd.income).toBe(0n);
    expect(snapshot.incomeExpenditure.ytd.expense).toBe(0n);
  });
});

/* ------------------------------------------------------------------ */
/*  4. Variances pass through                                          */
/* ------------------------------------------------------------------ */

describe('buildTrusteeSnapshot - variances', () => {
  it('forwards alerts array unchanged', () => {
    const alerts = [
      makeAlert('a1', 'Utilities', 'expense', 5000n, 0.25),
      makeAlert('a2', 'Donations', 'income', 3000n, -0.15),
    ];

    const snapshot = buildTrusteeSnapshot({
      balanceSheetAssets: { rows: [], total: 0n },
      fundRows: [],
      ieCategories: [],
      ieTotals: { monthlyActual: 0n, ytdActual: 0n },
      alerts,
      forecast: null,
      asOfDate: DEFAULT_DATE,
    });

    expect(snapshot.topVariances).toHaveLength(2);
    expect(snapshot.topVariances[0].accountName).toBe('Utilities');
    expect(snapshot.topVariances[0].adverseVariancePence).toBe(5000n);
    expect(snapshot.topVariances[0].adverseVariancePct).toBe(0.25);
    expect(snapshot.topVariances[1].accountName).toBe('Donations');
  });
});

/* ------------------------------------------------------------------ */
/*  5. Forecast extracts correctly                                     */
/* ------------------------------------------------------------------ */

describe('buildTrusteeSnapshot - forecast', () => {
  it('extracts baselineYE, trendYE, riskLevel from forecast summary', () => {
    const forecast = makeForecast(1200000n, 1150000n, 'AT_RISK');

    const snapshot = buildTrusteeSnapshot({
      balanceSheetAssets: { rows: [], total: 0n },
      fundRows: [],
      ieCategories: [],
      ieTotals: { monthlyActual: 0n, ytdActual: 0n },
      alerts: [],
      forecast,
      asOfDate: DEFAULT_DATE,
    });

    expect(snapshot.forecast.baselineYE).toBe(1200000n);
    expect(snapshot.forecast.trendYE).toBe(1150000n);
    expect(snapshot.forecast.riskLevel).toBe('AT_RISK');
  });
});

/* ------------------------------------------------------------------ */
/*  6. Null forecast handled                                           */
/* ------------------------------------------------------------------ */

describe('buildTrusteeSnapshot - null forecast', () => {
  it('defaults to zero and ON_TRACK when forecast is null', () => {
    const snapshot = buildTrusteeSnapshot({
      balanceSheetAssets: { rows: [], total: 0n },
      fundRows: [],
      ieCategories: [],
      ieTotals: { monthlyActual: 0n, ytdActual: 0n },
      alerts: [],
      forecast: null,
      asOfDate: DEFAULT_DATE,
    });

    expect(snapshot.forecast.baselineYE).toBe(0n);
    expect(snapshot.forecast.trendYE).toBe(0n);
    expect(snapshot.forecast.riskLevel).toBe('ON_TRACK');
  });
});

/* ------------------------------------------------------------------ */
/*  7. Snapshot changes when source data changes                       */
/* ------------------------------------------------------------------ */

describe('buildTrusteeSnapshot - reactivity to source changes', () => {
  it('cash total changes when asset balances change', () => {
    const baseAssets = [makeAssetRow('1', 'Bank Account 1', 500000n)];

    const snap1 = buildTrusteeSnapshot({
      balanceSheetAssets: { rows: baseAssets, total: 500000n },
      fundRows: [],
      ieCategories: [],
      ieTotals: { monthlyActual: 0n, ytdActual: 0n },
      alerts: [],
      forecast: null,
      asOfDate: DEFAULT_DATE,
    });

    expect(snap1.cash.total).toBe(500000n);

    // Change the bank balance
    const updatedAssets = [makeAssetRow('1', 'Bank Account 1', 750000n)];

    const snap2 = buildTrusteeSnapshot({
      balanceSheetAssets: { rows: updatedAssets, total: 750000n },
      fundRows: [],
      ieCategories: [],
      ieTotals: { monthlyActual: 0n, ytdActual: 0n },
      alerts: [],
      forecast: null,
      asOfDate: DEFAULT_DATE,
    });

    expect(snap2.cash.total).toBe(750000n);
    expect(snap2.cash.total).not.toBe(snap1.cash.total);
  });

  it('fund totals change when fund rows change', () => {
    const snap1 = buildTrusteeSnapshot({
      balanceSheetAssets: { rows: [], total: 0n },
      fundRows: [makeFundRow('restricted', 100000n)],
      ieCategories: [],
      ieTotals: { monthlyActual: 0n, ytdActual: 0n },
      alerts: [],
      forecast: null,
      asOfDate: DEFAULT_DATE,
    });

    const snap2 = buildTrusteeSnapshot({
      balanceSheetAssets: { rows: [], total: 0n },
      fundRows: [
        makeFundRow('restricted', 100000n),
        makeFundRow('restricted', 50000n),
      ],
      ieCategories: [],
      ieTotals: { monthlyActual: 0n, ytdActual: 0n },
      alerts: [],
      forecast: null,
      asOfDate: DEFAULT_DATE,
    });

    expect(snap1.funds.restrictedTotal).toBe(100000n);
    expect(snap2.funds.restrictedTotal).toBe(150000n);
    expect(snap2.funds.restrictedTotal).not.toBe(snap1.funds.restrictedTotal);
  });
});
