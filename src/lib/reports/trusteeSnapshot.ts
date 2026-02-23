/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TrusteeCashItem {
  accountId: string;
  accountName: string;
  balance: bigint;
}

export interface TrusteeCash {
  items: TrusteeCashItem[];
  total: bigint;
}

export interface TrusteeFunds {
  restrictedTotal: bigint;
  unrestrictedTotal: bigint;
  designatedTotal: bigint;
}

export interface TrusteeIEPeriod {
  income: bigint;
  expense: bigint;
  surplus: bigint;
}

export interface TrusteeIE {
  mtd: TrusteeIEPeriod;
  ytd: TrusteeIEPeriod;
}

export interface TrusteeVariance {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  adverseVariancePence: bigint;
  adverseVariancePct: number | null;
}

export interface TrusteeForecast {
  baselineYE: bigint;
  trendYE: bigint;
  riskLevel: 'ON_TRACK' | 'AT_RISK';
}

export interface TrusteeSnapshot {
  asOfDate: string;
  cash: TrusteeCash;
  funds: TrusteeFunds;
  incomeExpenditure: TrusteeIE;
  topVariances: TrusteeVariance[];
  forecast: TrusteeForecast;
}

/* ------------------------------------------------------------------ */
/*  Input shapes (match serialized report outputs)                     */
/* ------------------------------------------------------------------ */

export interface SnapshotAssetRow {
  accountId: string;
  accountName: string;
  accountCode: string;
  balance: bigint;
}

export interface SnapshotFundRow {
  fundType: string;
  closingBalancePence: bigint;
}

export interface SnapshotIECategory {
  categoryName: string;
  totals: { monthlyActual: bigint; ytdActual: bigint };
}

export interface SnapshotIETotals {
  monthlyActual: bigint;
  ytdActual: bigint;
}

export interface SnapshotAlert {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  adverseVariancePence: bigint;
  adverseVariancePct: number | null;
}

export interface SnapshotForecastSummary {
  baseline: { forecastYearEndActualTotal: bigint };
  trend: { forecastYearEndActualTotal: bigint };
  riskLevel: 'ON_TRACK' | 'AT_RISK';
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const BANK_CASH_PATTERN = /bank|cash/i;

function isBankOrCash(accountName: string): boolean {
  return BANK_CASH_PATTERN.test(accountName);
}

/* ------------------------------------------------------------------ */
/*  buildTrusteeSnapshot                                               */
/* ------------------------------------------------------------------ */

export function buildTrusteeSnapshot(params: {
  balanceSheetAssets: { rows: SnapshotAssetRow[]; total: bigint };
  fundRows: SnapshotFundRow[];
  ieCategories: SnapshotIECategory[];
  ieTotals: SnapshotIETotals;
  alerts: SnapshotAlert[];
  forecast: SnapshotForecastSummary | null;
  asOfDate: string;
}): TrusteeSnapshot {
  const {
    balanceSheetAssets,
    fundRows,
    ieCategories,
    ieTotals,
    alerts,
    forecast,
    asOfDate,
  } = params;

  /* ---- Cash snapshot ---- */
  const cashItems: TrusteeCashItem[] = [];
  let cashTotal = 0n;
  for (const row of balanceSheetAssets.rows) {
    if (isBankOrCash(row.accountName)) {
      cashItems.push({
        accountId: row.accountId,
        accountName: row.accountName,
        balance: row.balance,
      });
      cashTotal += row.balance;
    }
  }

  /* ---- Fund balances ---- */
  let restrictedTotal = 0n;
  let unrestrictedTotal = 0n;
  let designatedTotal = 0n;
  for (const fr of fundRows) {
    switch (fr.fundType) {
      case 'restricted':
        restrictedTotal += fr.closingBalancePence;
        break;
      case 'designated':
        designatedTotal += fr.closingBalancePence;
        break;
      default: // 'unrestricted' or anything else
        unrestrictedTotal += fr.closingBalancePence;
        break;
    }
  }

  /* ---- Income & Expenditure ---- */
  const incomeCategory = ieCategories.find(
    (c) => c.categoryName.toLowerCase() === 'income',
  );
  const expenseCategory = ieCategories.find(
    (c) => c.categoryName.toLowerCase() === 'expenses',
  );

  const ie: TrusteeIE = {
    mtd: {
      income: incomeCategory?.totals.monthlyActual ?? 0n,
      expense: expenseCategory?.totals.monthlyActual ?? 0n,
      surplus: ieTotals.monthlyActual,
    },
    ytd: {
      income: incomeCategory?.totals.ytdActual ?? 0n,
      expense: expenseCategory?.totals.ytdActual ?? 0n,
      surplus: ieTotals.ytdActual,
    },
  };

  /* ---- Top variances ---- */
  const topVariances: TrusteeVariance[] = alerts.map((a) => ({
    accountId: a.accountId,
    accountCode: a.accountCode,
    accountName: a.accountName,
    accountType: a.accountType,
    adverseVariancePence: a.adverseVariancePence,
    adverseVariancePct: a.adverseVariancePct,
  }));

  /* ---- Forecast ---- */
  const forecastSection: TrusteeForecast = forecast
    ? {
        baselineYE: forecast.baseline.forecastYearEndActualTotal,
        trendYE: forecast.trend.forecastYearEndActualTotal,
        riskLevel: forecast.riskLevel,
      }
    : {
        baselineYE: 0n,
        trendYE: 0n,
        riskLevel: 'ON_TRACK',
      };

  return {
    asOfDate,
    cash: { items: cashItems, total: cashTotal },
    funds: { restrictedTotal, unrestrictedTotal, designatedTotal },
    incomeExpenditure: ie,
    topVariances,
    forecast: forecastSection,
  };
}
