import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { getBudgetGrid } from '@/lib/budgets/actions';
import { getActualsByMonth } from '@/lib/reports/actuals';
import { buildBudgetVsActual } from '@/lib/reports/budgetVsActual';
import { detectOverspendAlerts, type OverspendAlert } from './overspendDetection';

export { detectOverspendAlerts, type OverspendAlert } from './overspendDetection';

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

  await getActiveOrg();

  const supabase = await createClient();

  const { data: settings } = await supabase
    .from('organisation_settings')
    .select('overspend_amount_pence, overspend_percent')
    .eq('organisation_id', organisationId)
    .single();

  const thresholdAmountPence = settings
    ? BigInt(settings.overspend_amount_pence)
    : DEFAULT_AMOUNT_PENCE;
  const thresholdPercent = settings ? settings.overspend_percent : DEFAULT_PERCENT;

  const { data: grid, error: gridErr } = await getBudgetGrid(budgetId);
  if (gridErr || !grid) {
    return { data: [], error: gridErr ?? 'Budget not found.' };
  }

  const budgetLines = fundId
    ? grid.lines.filter((l) => l.fund_id === fundId)
    : grid.lines.filter((l) => l.fund_id === null);

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

  const bvaRows = buildBudgetVsActual({
    accounts: grid.accounts,
    budgetLines,
    actualsByAccountMonth: actualsMap,
  });

  const alerts = detectOverspendAlerts({
    rows: bvaRows,
    period,
    monthIndex,
    thresholdAmountPence,
    thresholdPercent,
  });

  return { data: alerts, error: null };
}
