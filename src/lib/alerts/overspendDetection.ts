import { MONTH_KEYS } from '@/lib/budgets/budgetMath';
import type { BvaRow, MonthCell } from '@/lib/reports/budgetVsActual';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface OverspendAlert {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  adverseVariancePence: bigint;
  adverseVariancePct: number | null;
  budgetPence: bigint;
  actualPence: bigint;
}

/* ------------------------------------------------------------------ */
/*  Pure detection (no server-only imports; safe for Vitest)            */
/* ------------------------------------------------------------------ */

/**
 * Detect accounts with adverse variance exceeding configured thresholds.
 *
 * Adverse variance:
 *  - Expense: actual > budget (overspending)
 *  - Income:  actual < budget (underperforming)
 *
 * An alert triggers if adverseVariancePence > thresholdAmountPence
 * OR adverseVariancePct > thresholdPercent / 100.
 *
 * Results are sorted by adverseVariancePence descending (most severe first).
 */
export function detectOverspendAlerts(params: {
  rows: BvaRow[];
  period: 'MTD' | 'YTD';
  monthIndex?: number;
  thresholdAmountPence: bigint;
  thresholdPercent: number;
}): OverspendAlert[] {
  const { rows, period, monthIndex, thresholdAmountPence, thresholdPercent } = params;

  const alerts: OverspendAlert[] = [];
  const pctThreshold = thresholdPercent / 100;

  for (const row of rows) {
    let cell: MonthCell;
    if (period === 'MTD') {
      if (!monthIndex || monthIndex < 1 || monthIndex > 12) continue;
      cell = row.months[MONTH_KEYS[monthIndex - 1]];
    } else {
      cell = row.ytd;
    }

    let adversePence: bigint;

    if (row.accountType === 'expense') {
      adversePence = cell.actual - cell.budget;
    } else if (row.accountType === 'income') {
      adversePence = cell.budget - cell.actual;
    } else {
      continue;
    }

    if (adversePence <= 0n) continue;

    const adversePct =
      cell.budget !== 0n ? Number(adversePence) / Number(cell.budget) : null;

    const exceedsAmount = adversePence > thresholdAmountPence;
    const exceedsPercent = adversePct !== null && adversePct > pctThreshold;

    if (!exceedsAmount && !exceedsPercent) continue;

    alerts.push({
      accountId: row.accountId,
      accountCode: row.accountCode,
      accountName: row.accountName,
      accountType: row.accountType,
      adverseVariancePence: adversePence,
      adverseVariancePct: adversePct,
      budgetPence: cell.budget,
      actualPence: cell.actual,
    });
  }

  alerts.sort((a, b) => {
    if (b.adverseVariancePence > a.adverseVariancePence) return 1;
    if (b.adverseVariancePence < a.adverseVariancePence) return -1;
    return 0;
  });

  return alerts;
}
