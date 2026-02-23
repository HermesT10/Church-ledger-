import { MONTH_KEYS, type MonthKey } from '@/lib/budgets/budgetMath';
import type { AccountRef, BudgetGridLine } from '@/lib/budgets/types';
import type { ActualsMap } from '@/lib/reports/actuals';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface MonthCell {
  budget: bigint;
  actual: bigint;
  variance: bigint;           // actual - budget
  variancePct: number | null; // variance / budget (null if budget === 0n)
}

export interface BvaRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  months: Record<MonthKey, MonthCell>;
  ytd: MonthCell;
  annual: MonthCell;
}

export interface BvaTotals {
  months: Record<MonthKey, MonthCell>;
  ytd: MonthCell;
  annual: MonthCell;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeCell(budget: bigint, actual: bigint): MonthCell {
  const variance = actual - budget;
  const variancePct = budget !== 0n ? Number(variance) / Number(budget) : null;
  return { budget, actual, variance, variancePct };
}

function sumCells(cells: MonthCell[]): MonthCell {
  let totalBudget = 0n;
  let totalActual = 0n;
  for (const c of cells) {
    totalBudget += c.budget;
    totalActual += c.actual;
  }
  return makeCell(totalBudget, totalActual);
}

/* ------------------------------------------------------------------ */
/*  buildBudgetVsActual                                                */
/* ------------------------------------------------------------------ */

/**
 * Merge budget data and actuals into a per-account, per-month
 * variance report.
 *
 * All monetary values are in pence (bigint).
 */
export function buildBudgetVsActual(params: {
  accounts: AccountRef[];
  budgetLines: BudgetGridLine[];
  actualsByAccountMonth: ActualsMap;
}): BvaRow[] {
  const { accounts, budgetLines, actualsByAccountMonth } = params;

  // Index budget lines by account_id
  const budgetByAccount: Record<string, BudgetGridLine> = {};
  for (const bl of budgetLines) {
    budgetByAccount[bl.account_id] = bl;
  }

  const rows: BvaRow[] = [];

  for (const account of accounts) {
    const bl = budgetByAccount[account.id];
    const actuals = actualsByAccountMonth[account.id];

    // Build 12 month cells
    const months = {} as Record<MonthKey, MonthCell>;
    const monthCells: MonthCell[] = [];

    for (const key of MONTH_KEYS) {
      const budgetPence = bl ? BigInt(bl[key]) : 0n;
      const actualPence = actuals ? actuals[key] : 0n;
      const cell = makeCell(budgetPence, actualPence);
      months[key] = cell;
      monthCells.push(cell);
    }

    // YTD and annual (same for a full-year view)
    const ytd = sumCells(monthCells);
    const annual = sumCells(monthCells);

    rows.push({
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      accountType: account.type,
      months,
      ytd,
      annual,
    });
  }

  return rows;
}

/* ------------------------------------------------------------------ */
/*  computeBvaTotals                                                   */
/* ------------------------------------------------------------------ */

/**
 * Compute totals across all BVA rows — one total per month column,
 * plus ytd and annual totals.
 */
export function computeBvaTotals(rows: BvaRow[]): BvaTotals {
  const months = {} as Record<MonthKey, MonthCell>;

  for (const key of MONTH_KEYS) {
    const cells = rows.map((r) => r.months[key]);
    months[key] = sumCells(cells);
  }

  const ytd = sumCells(rows.map((r) => r.ytd));
  const annual = sumCells(rows.map((r) => r.annual));

  return { months, ytd, annual };
}
