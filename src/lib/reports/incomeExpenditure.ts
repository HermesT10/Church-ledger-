import { MONTH_KEYS } from '@/lib/budgets/budgetMath';
import type { ActualsMap } from '@/lib/reports/actuals';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface IEAccountRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  monthlyActual: bigint; // 0n if no month specified
  ytdActual: bigint;
}

export interface IECategory {
  categoryName: string; // 'Income' or 'Expenses'
  rows: IEAccountRow[];
  totals: { monthlyActual: bigint; ytdActual: bigint };
}

export interface IEReport {
  categories: IECategory[];
  totals: { monthlyActual: bigint; ytdActual: bigint }; // net: income - expenses
}

/** Minimal account shape required by the report builder. */
export interface IEAccountRef {
  id: string;
  code: string;
  name: string;
  type: string;
}

/* ------------------------------------------------------------------ */
/*  buildIncomeExpenditureReport                                       */
/* ------------------------------------------------------------------ */

/**
 * Build an Income & Expenditure report from actuals data.
 *
 * @param accounts    Income + expense accounts, ideally sorted by code.
 * @param actualsMap  Output of `aggregateActuals` (or `getActualsByMonth`).
 * @param month       Optional 1..12. If provided, includes a monthly column
 *                    and YTD sums m01..m{month}. If omitted, YTD sums all 12.
 * @param upToMonth   Optional 1..12. Overrides the YTD upper bound.
 *                    Defaults to `month` if provided, or 12 otherwise.
 */
export function buildIncomeExpenditureReport(params: {
  accounts: IEAccountRef[];
  actualsMap: ActualsMap;
  month?: number;
  upToMonth?: number;
}): IEReport {
  const { accounts, actualsMap, month } = params;
  const upToMonth = params.upToMonth ?? month ?? 12;

  const incomeAccounts = accounts.filter((a) => a.type === 'income');
  const expenseAccounts = accounts.filter((a) => a.type === 'expense');

  const incomeCategory = buildCategory('Income', incomeAccounts, actualsMap, month, upToMonth);
  const expenseCategory = buildCategory('Expenses', expenseAccounts, actualsMap, month, upToMonth);

  // Net totals: income - expenses
  const totals = {
    monthlyActual: incomeCategory.totals.monthlyActual - expenseCategory.totals.monthlyActual,
    ytdActual: incomeCategory.totals.ytdActual - expenseCategory.totals.ytdActual,
  };

  return {
    categories: [incomeCategory, expenseCategory],
    totals,
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildCategory(
  categoryName: string,
  accounts: IEAccountRef[],
  actualsMap: ActualsMap,
  month: number | undefined,
  upToMonth: number,
): IECategory {
  const rows: IEAccountRow[] = accounts.map((account) => {
    const actuals = actualsMap[account.id];

    // Monthly actual (single month)
    const monthlyActual =
      month !== undefined && actuals
        ? actuals[MONTH_KEYS[month - 1]]
        : 0n;

    // YTD actual (sum m01..m{upToMonth})
    let ytdActual = 0n;
    if (actuals) {
      for (let i = 0; i < upToMonth; i++) {
        ytdActual += actuals[MONTH_KEYS[i]];
      }
    }

    return {
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      monthlyActual,
      ytdActual,
    };
  });

  // Category totals
  let totalMonthly = 0n;
  let totalYtd = 0n;
  for (const row of rows) {
    totalMonthly += row.monthlyActual;
    totalYtd += row.ytdActual;
  }

  return {
    categoryName,
    rows,
    totals: { monthlyActual: totalMonthly, ytdActual: totalYtd },
  };
}
