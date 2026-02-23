import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { MONTH_KEYS } from '@/lib/budgets/budgetMath';
import { getBudgetGrid } from '@/lib/budgets/actions';
import { getActualsByMonth } from '@/lib/reports/actuals';
import { buildBudgetVsActual, type BvaRow, type MonthCell } from '@/lib/reports/budgetVsActual';

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
/*  Pure detection function (testable without Supabase)                */
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
    // Pick the cell based on period
    let cell: MonthCell;
    if (period === 'MTD') {
      if (!monthIndex || monthIndex < 1 || monthIndex > 12) continue;
      cell = row.months[MONTH_KEYS[monthIndex - 1]];
    } else {
      cell = row.ytd;
    }

    // Compute adverse variance based on account type
    let adversePence: bigint;

    if (row.accountType === 'expense') {
      // Adverse when actual > budget (overspending)
      adversePence = cell.actual - cell.budget;
    } else if (row.accountType === 'income') {
      // Adverse when actual < budget (underperforming)
      adversePence = cell.budget - cell.actual;
    } else {
      continue; // skip non P&L accounts
    }

    // Only consider adverse (positive) variances
    if (adversePence <= 0n) continue;

    // Compute adverse variance percentage
    const adversePct = cell.budget !== 0n
      ? Number(adversePence) / Number(cell.budget)
      : null;

    // Check thresholds (OR logic)
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

  // Sort by adverseVariancePence descending (most severe first)
  alerts.sort((a, b) => {
    if (b.adverseVariancePence > a.adverseVariancePence) return 1;
    if (b.adverseVariancePence < a.adverseVariancePence) return -1;
    return 0;
  });

  return alerts;
}

/* ------------------------------------------------------------------ */
/*  Server action                                                      */
/* ------------------------------------------------------------------ */

const DEFAULT_AMOUNT_PENCE = 5000n;
const DEFAULT_PERCENT = 20;

export async function getOverspendAlerts(params: {
  organisationId: string;
  year: number;
  budgetId: string;
  fundId?: string | null;
  period: 'MTD' | 'YTD';
  monthIndex?: number;
}): Promise<{ data: OverspendAlert[]; error: string | null }> {
  'use server';
  const { organisationId, year, budgetId, fundId, period, monthIndex } = params;

  // 1. Auth check
  await getActiveOrg();

  const supabase = await createClient();

  // 2. Load organisation settings (use defaults if no row)
  const { data: settings } = await supabase
    .from('organisation_settings')
    .select('overspend_amount_pence, overspend_percent')
    .eq('organisation_id', organisationId)
    .single();

  const thresholdAmountPence = settings
    ? BigInt(settings.overspend_amount_pence)
    : DEFAULT_AMOUNT_PENCE;
  const thresholdPercent = settings
    ? settings.overspend_percent
    : DEFAULT_PERCENT;

  // 3. Load budget grid
  const { data: grid, error: gridErr } = await getBudgetGrid(budgetId);
  if (gridErr || !grid) {
    return { data: [], error: gridErr ?? 'Budget not found.' };
  }

  // Filter budget lines by fund
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

  if (actualsErr) {
    return { data: [], error: actualsErr };
  }

  // 5. Build BvA rows
  const bvaRows = buildBudgetVsActual({
    accounts: grid.accounts,
    budgetLines,
    actualsByAccountMonth: actualsMap,
  });

  // 6. Detect alerts
  const alerts = detectOverspendAlerts({
    rows: bvaRows,
    period,
    monthIndex,
    thresholdAmountPence,
    thresholdPercent,
  });

  return { data: alerts, error: null };
}
