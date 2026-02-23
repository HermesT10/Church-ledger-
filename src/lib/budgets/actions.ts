'use server';

import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { invalidateOrgReportCache } from '@/lib/cache';
import { logAuditEvent } from '@/lib/audit';
import { assertWriteAllowed } from '@/lib/demo';
import { MONTH_KEYS, monthKeyFromIndex, type MonthKey } from '@/lib/budgets/budgetMath';
import {
  getVarianceStatus,
  type BudgetRow,
  type BudgetGridLine,
  type AccountRef,
  type FundRef,
  type BudgetGrid,
  type GridUpdate,
  type MonthlyPlanningData,
  type MonthlyPlanningRow,
  type MonthlyPlanningSection,
  type AnnualViewData,
  type AnnualAccountRow,
  type BudgetFundSummary,
  type DrillDownTransaction,
} from './types';

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function lineKey(accountId: string, fundId: string | null): string {
  return `${accountId}::${fundId ?? 'null'}`;
}

function emptyMonths(): Record<MonthKey, number> {
  const obj: Record<string, number> = {};
  for (const k of MONTH_KEYS) obj[k] = 0;
  return obj as Record<MonthKey, number>;
}

function pickMonths(line: BudgetGridLine): Record<MonthKey, number> {
  const obj: Record<string, number> = {};
  for (const k of MONTH_KEYS) obj[k] = line[k] ?? 0;
  return obj as Record<MonthKey, number>;
}

/* ================================================================== */
/*  LIST BUDGETS                                                       */
/* ================================================================== */

export async function listBudgets(orgId: string, year?: number) {
  const supabase = await createClient();

  let query = supabase
    .from('budgets')
    .select('*')
    .eq('organisation_id', orgId)
    .order('year', { ascending: false })
    .order('created_at', { ascending: false });

  if (year !== undefined) query = query.eq('year', year);

  const { data, error } = await query;
  return { data: (data ?? []) as BudgetRow[], error: error?.message ?? null };
}

/* ================================================================== */
/*  CREATE BUDGET                                                      */
/* ================================================================== */

export async function createBudget(
  orgId: string,
  year: number,
  name?: string,
  copyFromYear?: number,
  pctIncrease?: number,
) {
  await assertWriteAllowed();
  const { user, role } = await getActiveOrg();

  try { assertCanPerform(role, 'create', 'budgets'); }
  catch (e) { return { data: null, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { data: null, error: 'Year must be an integer between 2000 and 2100.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('budgets')
    .insert({
      organisation_id: orgId,
      year,
      name: name?.trim() || 'Annual Budget',
      version_number: 1,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };

  const budget = data as BudgetRow;

  // Copy from previous year if requested
  if (copyFromYear) {
    const { data: sourceBudgets } = await supabase
      .from('budgets')
      .select('id')
      .eq('organisation_id', orgId)
      .eq('year', copyFromYear)
      .in('status', ['approved', 'draft'])
      .order('version_number', { ascending: false })
      .limit(1);

    const sourceBudgetId = sourceBudgets?.[0]?.id;

    if (sourceBudgetId) {
      const { data: sourceLines } = await supabase
        .from('budget_lines')
        .select('*')
        .eq('budget_id', sourceBudgetId);

      if (sourceLines && sourceLines.length > 0) {
        const multiplier = pctIncrease ? (1 + pctIncrease / 100) : 1;

        const newLines = sourceLines.map((sl) => {
          const months: Record<string, number> = {};
          for (const k of MONTH_KEYS) {
            months[k] = Math.round(Number(sl[k]) * multiplier);
          }
          return {
            budget_id: budget.id,
            organisation_id: orgId,
            account_id: sl.account_id,
            fund_id: sl.fund_id,
            ...months,
          };
        });

        await supabase.from('budget_lines').insert(newLines);
      }
    }
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'create_budget',
    entityType: 'budget',
    entityId: budget.id,
    metadata: { year, copyFromYear, pctIncrease },
  });

  return { data: budget, error: null };
}

/* ================================================================== */
/*  APPROVE BUDGET                                                     */
/* ================================================================== */

export async function approveBudget(budgetId: string): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try { assertCanPerform(role, 'update', 'budgets'); }
  catch (e) { return { error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();

  const { data: budget } = await supabase
    .from('budgets')
    .select('id, organisation_id, status')
    .eq('id', budgetId)
    .single();

  if (!budget || budget.organisation_id !== orgId) return { error: 'Budget not found.' };
  if (budget.status !== 'draft') return { error: 'Only draft budgets can be approved.' };

  const { error } = await supabase
    .from('budgets')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: user.id,
    })
    .eq('id', budgetId);

  if (error) return { error: error.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'approve_budget',
    entityType: 'budget',
    entityId: budgetId,
  });

  invalidateOrgReportCache(orgId);
  return { error: null };
}

/* ================================================================== */
/*  ARCHIVE BUDGET                                                     */
/* ================================================================== */

export async function archiveBudget(budgetId: string): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try { assertCanPerform(role, 'update', 'budgets'); }
  catch (e) { return { error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();

  const { error } = await supabase
    .from('budgets')
    .update({ status: 'archived' })
    .eq('id', budgetId)
    .eq('organisation_id', orgId);

  if (error) return { error: error.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'archive_budget',
    entityType: 'budget',
    entityId: budgetId,
  });

  return { error: null };
}

/* ================================================================== */
/*  CREATE NEW VERSION (from approved budget)                          */
/* ================================================================== */

export async function createNewVersion(budgetId: string): Promise<{ data: BudgetRow | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try { assertCanPerform(role, 'create', 'budgets'); }
  catch (e) { return { data: null, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();

  const { data: source } = await supabase
    .from('budgets')
    .select('*')
    .eq('id', budgetId)
    .eq('organisation_id', orgId)
    .single();

  if (!source) return { data: null, error: 'Budget not found.' };
  if (source.status !== 'approved') return { data: null, error: 'Can only create new version from an approved budget.' };

  // Create new draft with incremented version
  const { data: newBudget, error: createErr } = await supabase
    .from('budgets')
    .insert({
      organisation_id: orgId,
      year: source.year,
      name: source.name,
      version_number: (source.version_number ?? 1) + 1,
      created_by: user.id,
    })
    .select()
    .single();

  if (createErr || !newBudget) return { data: null, error: createErr?.message ?? 'Failed to create new version.' };

  // Copy budget lines
  const { data: sourceLines } = await supabase
    .from('budget_lines')
    .select('*')
    .eq('budget_id', budgetId);

  if (sourceLines && sourceLines.length > 0) {
    const newLines = sourceLines.map((sl) => {
      const months: Record<string, number> = {};
      for (const k of MONTH_KEYS) months[k] = Number(sl[k]);
      return {
        budget_id: newBudget.id,
        organisation_id: orgId,
        account_id: sl.account_id,
        fund_id: sl.fund_id,
        ...months,
      };
    });
    await supabase.from('budget_lines').insert(newLines);
  }

  // Archive the old version
  await supabase.from('budgets').update({ status: 'archived' }).eq('id', budgetId);

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'create_budget_version',
    entityType: 'budget',
    entityId: newBudget.id,
    metadata: { sourceId: budgetId, version: newBudget.version_number },
  });

  return { data: newBudget as BudgetRow, error: null };
}

/* ================================================================== */
/*  GET BUDGET GRID (existing, updated)                                */
/* ================================================================== */

export async function getBudgetGrid(budgetId: string) {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const { data: budget, error: budgetErr } = await supabase
    .from('budgets')
    .select('*')
    .eq('id', budgetId)
    .single();

  if (budgetErr || !budget) return { data: null, error: budgetErr?.message ?? 'Budget not found.' };
  if (budget.organisation_id !== orgId) return { data: null, error: 'Budget does not belong to your organisation.' };

  const { data: lines } = await supabase.from('budget_lines').select('*').eq('budget_id', budgetId);

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, code, name, type')
    .eq('organisation_id', orgId)
    .in('type', ['income', 'expense'])
    .eq('is_active', true)
    .order('type')
    .order('code');

  const { data: funds } = await supabase
    .from('funds')
    .select('id, name, type')
    .eq('organisation_id', orgId)
    .eq('is_active', true)
    .order('name');

  const typedLines = (lines ?? []) as BudgetGridLine[];
  const index: Record<string, BudgetGridLine> = {};
  for (const line of typedLines) index[lineKey(line.account_id, line.fund_id)] = line;

  return {
    data: {
      budget: budget as BudgetRow,
      accounts: (accounts ?? []) as AccountRef[],
      funds: (funds ?? []) as FundRef[],
      lines: typedLines,
      lineIndex: index,
    } as BudgetGrid,
    error: null,
  };
}

/* ================================================================== */
/*  SAVE BUDGET GRID                                                   */
/* ================================================================== */

export async function saveBudgetGrid(budgetId: string, updates: GridUpdate[]) {
  await assertWriteAllowed();
  const { role } = await getActiveOrg();

  try { assertCanPerform(role, 'update', 'budgets'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  if (!updates.length) return { success: true, error: null };

  const supabase = await createClient();

  // Check budget is draft
  const { data: budget } = await supabase
    .from('budgets')
    .select('id, organisation_id, status')
    .eq('id', budgetId)
    .single();

  if (!budget) return { success: false, error: 'Budget not found.' };
  if (budget.status !== 'draft') return { success: false, error: 'Only draft budgets can be edited.' };

  const orgId = budget.organisation_id as string;

  const { data: existingLines } = await supabase.from('budget_lines').select('*').eq('budget_id', budgetId);

  const existingMap: Record<string, BudgetGridLine> = {};
  for (const line of (existingLines ?? []) as BudgetGridLine[]) {
    existingMap[lineKey(line.account_id, line.fund_id)] = line;
  }

  const grouped: Record<string, GridUpdate[]> = {};
  for (const u of updates) {
    monthKeyFromIndex(u.monthIndex);
    const key = lineKey(u.accountId, u.fundId);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(u);
  }

  const upsertRows: Record<string, unknown>[] = [];
  for (const [key, groupUpdates] of Object.entries(grouped)) {
    const existing = existingMap[key];
    const months: Record<string, number> = existing
      ? { ...emptyMonths(), ...pickMonths(existing) }
      : emptyMonths();

    for (const u of groupUpdates) {
      months[monthKeyFromIndex(u.monthIndex)] = u.amountPence;
    }

    const sample = groupUpdates[0];
    upsertRows.push({
      budget_id: budgetId,
      organisation_id: orgId,
      account_id: sample.accountId,
      fund_id: sample.fundId ?? null,
      ...months,
    });
  }

  const BATCH_SIZE = 200;
  const errors: string[] = [];
  for (let i = 0; i < upsertRows.length; i += BATCH_SIZE) {
    const batch = upsertRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('budget_lines').upsert(batch, { onConflict: 'budget_id,account_id,fund_id' });
    if (error) errors.push(error.message);
  }

  if (errors.length) return { success: false, error: errors.join('; ') };

  invalidateOrgReportCache(orgId);
  return { success: true, error: null };
}

/* ================================================================== */
/*  ADD BUDGET ITEM                                                    */
/* ================================================================== */

export async function addBudgetItem(params: {
  budgetId: string;
  accountId: string;
  fundId: string | null;
  monthlyAmountPence: number;
}): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role } = await getActiveOrg();

  try { assertCanPerform(role, 'update', 'budgets'); }
  catch (e) { return { error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();

  const { data: budget } = await supabase
    .from('budgets')
    .select('id, organisation_id, status')
    .eq('id', params.budgetId)
    .single();

  if (!budget || budget.organisation_id !== orgId) return { error: 'Budget not found.' };
  if (budget.status !== 'draft') return { error: 'Only draft budgets can be edited.' };

  // Spread evenly across 12 months
  const months: Record<string, number> = {};
  for (const k of MONTH_KEYS) months[k] = params.monthlyAmountPence;

  const { error } = await supabase
    .from('budget_lines')
    .upsert({
      budget_id: params.budgetId,
      organisation_id: orgId,
      account_id: params.accountId,
      fund_id: params.fundId ?? null,
      ...months,
    }, { onConflict: 'budget_id,account_id,fund_id' });

  if (error) return { error: error.message };

  invalidateOrgReportCache(orgId);
  return { error: null };
}

/* ================================================================== */
/*  DELETE BUDGET ITEM                                                 */
/* ================================================================== */

export async function deleteBudgetItem(params: {
  budgetId: string;
  accountId: string;
  fundId: string | null;
}): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role } = await getActiveOrg();

  try { assertCanPerform(role, 'delete', 'budgets'); }
  catch (e) { return { error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();

  const { data: budget } = await supabase
    .from('budgets')
    .select('id, organisation_id, status')
    .eq('id', params.budgetId)
    .single();

  if (!budget || budget.organisation_id !== orgId) return { error: 'Budget not found.' };
  if (budget.status !== 'draft') return { error: 'Only draft budgets can be edited.' };

  let query = supabase
    .from('budget_lines')
    .delete()
    .eq('budget_id', params.budgetId)
    .eq('account_id', params.accountId);

  if (params.fundId) {
    query = query.eq('fund_id', params.fundId);
  } else {
    query = query.is('fund_id', null);
  }

  const { error } = await query;
  if (error) return { error: error.message };

  return { error: null };
}

/* ================================================================== */
/*  GET MONTHLY PLANNING DATA                                          */
/* ================================================================== */

export async function getBudgetMonthlyPlanning(
  budgetId: string,
  month: number,
  fundId?: string | null,
): Promise<{ data: MonthlyPlanningData | null; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  // 1. Fetch budget
  const { data: budget } = await supabase
    .from('budgets')
    .select('id, organisation_id, year')
    .eq('id', budgetId)
    .single();

  if (!budget || budget.organisation_id !== orgId) return { data: null, error: 'Budget not found.' };

  const monthKey = monthKeyFromIndex(month);

  // 2. Fetch budget lines
  let linesQuery = supabase.from('budget_lines').select('*').eq('budget_id', budgetId);
  if (fundId) linesQuery = linesQuery.eq('fund_id', fundId);

  const { data: lines } = await linesQuery;
  const typedLines = (lines ?? []) as BudgetGridLine[];

  // Index planned by account_id
  const plannedByAccount: Record<string, number> = {};
  for (const line of typedLines) {
    const val = Number(line[monthKey as keyof BudgetGridLine] ?? 0);
    const key = line.account_id;
    plannedByAccount[key] = (plannedByAccount[key] ?? 0) + val;
  }

  // 3. Fetch actuals from RPC
  const { data: actuals } = await supabase.rpc('get_budget_actuals', {
    p_org_id: orgId,
    p_year: budget.year,
    p_fund_id: fundId ?? null,
  });

  const actualByAccountMonth: Record<string, number> = {};
  const accountTypes: Record<string, string> = {};
  for (const row of actuals ?? []) {
    if (Number(row.month) === month) {
      actualByAccountMonth[row.account_id] = (actualByAccountMonth[row.account_id] ?? 0) + Number(row.net_pence);
    }
    accountTypes[row.account_id] = row.account_type;
  }

  // 4. Fetch accounts
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, code, name, type')
    .eq('organisation_id', orgId)
    .in('type', ['income', 'expense'])
    .eq('is_active', true)
    .order('code');

  // Collect all account IDs that have either planned or actual
  const relevantAccountIds = new Set<string>([
    ...Object.keys(plannedByAccount),
    ...Object.keys(actualByAccountMonth),
  ]);

  const accountMap: Record<string, AccountRef> = {};
  for (const a of accounts ?? []) accountMap[a.id] = a as AccountRef;

  // 5. Build rows
  const incomeRows: MonthlyPlanningRow[] = [];
  const expenseRows: MonthlyPlanningRow[] = [];

  for (const accountId of relevantAccountIds) {
    const account = accountMap[accountId];
    if (!account) continue;

    const planned = plannedByAccount[accountId] ?? 0;
    const actual = actualByAccountMonth[accountId] ?? 0;
    const accountType = account.type as 'income' | 'expense';

    let variance: number;
    if (accountType === 'income') {
      variance = actual - planned;
    } else {
      variance = planned - actual;
    }

    const row: MonthlyPlanningRow = {
      accountId,
      accountCode: account.code,
      accountName: account.name,
      accountType,
      fundId: fundId ?? null,
      plannedPence: planned,
      actualPence: actual,
      variancePence: variance,
      status: getVarianceStatus(accountType, planned, actual),
    };

    if (accountType === 'income') incomeRows.push(row);
    else expenseRows.push(row);
  }

  incomeRows.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  expenseRows.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  const totalIncomePlanned = incomeRows.reduce((s, r) => s + r.plannedPence, 0);
  const totalIncomeActual = incomeRows.reduce((s, r) => s + r.actualPence, 0);
  const totalIncomeVariance = incomeRows.reduce((s, r) => s + r.variancePence, 0);

  const totalExpensePlanned = expenseRows.reduce((s, r) => s + r.plannedPence, 0);
  const totalExpenseActual = expenseRows.reduce((s, r) => s + r.actualPence, 0);
  const totalExpenseVariance = expenseRows.reduce((s, r) => s + r.variancePence, 0);

  return {
    data: {
      income: {
        label: 'Income',
        type: 'income',
        rows: incomeRows,
        totalPlanned: totalIncomePlanned,
        totalActual: totalIncomeActual,
        totalVariance: totalIncomeVariance,
      },
      expense: {
        label: 'Expenses',
        type: 'expense',
        rows: expenseRows,
        totalPlanned: totalExpensePlanned,
        totalActual: totalExpenseActual,
        totalVariance: totalExpenseVariance,
      },
      netPlanned: totalIncomePlanned - totalExpensePlanned,
      netActual: totalIncomeActual - totalExpenseActual,
      netVariance: (totalIncomeActual - totalExpenseActual) - (totalIncomePlanned - totalExpensePlanned),
    },
    error: null,
  };
}

/* ================================================================== */
/*  GET ANNUAL VIEW DATA                                               */
/* ================================================================== */

export async function getBudgetAnnualView(
  budgetId: string,
  fundId?: string | null,
): Promise<{ data: AnnualViewData | null; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const { data: budget } = await supabase
    .from('budgets')
    .select('id, organisation_id, year')
    .eq('id', budgetId)
    .single();

  if (!budget || budget.organisation_id !== orgId) return { data: null, error: 'Budget not found.' };

  // Budget lines
  let linesQuery = supabase.from('budget_lines').select('*').eq('budget_id', budgetId);
  if (fundId) linesQuery = linesQuery.eq('fund_id', fundId);
  const { data: lines } = await linesQuery;

  const annualPlannedByAccount: Record<string, number> = {};
  for (const line of (lines ?? []) as BudgetGridLine[]) {
    let total = 0;
    for (const k of MONTH_KEYS) total += Number(line[k] ?? 0);
    annualPlannedByAccount[line.account_id] = (annualPlannedByAccount[line.account_id] ?? 0) + total;
  }

  // Actuals from RPC
  const { data: actuals } = await supabase.rpc('get_budget_actuals', {
    p_org_id: orgId,
    p_year: budget.year,
    p_fund_id: fundId ?? null,
  });

  const ytdActualByAccount: Record<string, number> = {};
  const accountTypes: Record<string, string> = {};
  for (const row of actuals ?? []) {
    ytdActualByAccount[row.account_id] = (ytdActualByAccount[row.account_id] ?? 0) + Number(row.net_pence);
    accountTypes[row.account_id] = row.account_type;
  }

  // How many months elapsed
  const now = new Date();
  const currentYear = now.getFullYear();
  const monthsElapsed = budget.year === currentYear
    ? now.getMonth() + 1
    : budget.year < currentYear ? 12 : 0;

  // Accounts
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, code, name, type')
    .eq('organisation_id', orgId)
    .in('type', ['income', 'expense'])
    .eq('is_active', true)
    .order('code');

  const accountMap: Record<string, AccountRef> = {};
  for (const a of accounts ?? []) accountMap[a.id] = a as AccountRef;

  const relevantIds = new Set([...Object.keys(annualPlannedByAccount), ...Object.keys(ytdActualByAccount)]);

  const incomeRows: AnnualAccountRow[] = [];
  const expenseRows: AnnualAccountRow[] = [];

  for (const accountId of relevantIds) {
    const account = accountMap[accountId];
    if (!account) continue;
    const accountType = account.type as 'income' | 'expense';
    const planned = annualPlannedByAccount[accountId] ?? 0;
    const ytdActual = ytdActualByAccount[accountId] ?? 0;

    const forecast = monthsElapsed > 0
      ? Math.round((ytdActual / monthsElapsed) * 12)
      : planned;

    let variance: number;
    if (accountType === 'income') {
      variance = forecast - planned;
    } else {
      variance = planned - forecast;
    }

    const row: AnnualAccountRow = {
      accountId,
      accountCode: account.code,
      accountName: account.name,
      accountType,
      annualPlannedPence: planned,
      ytdActualPence: ytdActual,
      forecastPence: forecast,
      variancePence: variance,
      status: getVarianceStatus(accountType, planned, forecast),
    };

    if (accountType === 'income') incomeRows.push(row);
    else expenseRows.push(row);
  }

  incomeRows.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  expenseRows.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  const tip = incomeRows.reduce((s, r) => s + r.annualPlannedPence, 0);
  const tia = incomeRows.reduce((s, r) => s + r.ytdActualPence, 0);
  const tif = incomeRows.reduce((s, r) => s + r.forecastPence, 0);
  const tep = expenseRows.reduce((s, r) => s + r.annualPlannedPence, 0);
  const tea = expenseRows.reduce((s, r) => s + r.ytdActualPence, 0);
  const tef = expenseRows.reduce((s, r) => s + r.forecastPence, 0);

  return {
    data: {
      incomeRows,
      expenseRows,
      totalIncomePlanned: tip,
      totalIncomeActual: tia,
      totalIncomeForecast: tif,
      totalExpensePlanned: tep,
      totalExpenseActual: tea,
      totalExpenseForecast: tef,
      netPlanned: tip - tep,
      netActual: tia - tea,
      netForecast: tif - tef,
    },
    error: null,
  };
}

/* ================================================================== */
/*  GET FUND SUMMARY                                                   */
/* ================================================================== */

export async function getBudgetFundSummary(
  budgetId: string,
): Promise<{ data: BudgetFundSummary[]; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const { data: budget } = await supabase
    .from('budgets')
    .select('id, organisation_id, year')
    .eq('id', budgetId)
    .single();

  if (!budget || budget.organisation_id !== orgId) return { data: [], error: 'Budget not found.' };

  // Get budget lines grouped by fund_id
  const { data: lines } = await supabase
    .from('budget_lines')
    .select('fund_id, account_id, m01_pence, m02_pence, m03_pence, m04_pence, m05_pence, m06_pence, m07_pence, m08_pence, m09_pence, m10_pence, m11_pence, m12_pence')
    .eq('budget_id', budgetId);

  // Get account types
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, type')
    .eq('organisation_id', orgId)
    .in('type', ['income', 'expense']);

  const accountTypeMap: Record<string, string> = {};
  for (const a of accounts ?? []) accountTypeMap[a.id] = a.type;

  // Aggregate planned by fund
  const plannedByFund: Record<string, { income: number; expense: number }> = {};
  for (const line of (lines ?? [])) {
    const fid = line.fund_id ?? '__general__';
    if (!plannedByFund[fid]) plannedByFund[fid] = { income: 0, expense: 0 };
    let total = 0;
    for (const k of MONTH_KEYS) total += Number((line as Record<string, unknown>)[k] ?? 0);
    const at = accountTypeMap[line.account_id];
    if (at === 'income') plannedByFund[fid].income += total;
    else if (at === 'expense') plannedByFund[fid].expense += total;
  }

  // Get actuals by fund
  const { data: fundActuals } = await supabase.rpc('get_budget_fund_summary', {
    p_org_id: orgId,
    p_year: budget.year,
  });

  const now = new Date();
  const monthsElapsed = budget.year === now.getFullYear()
    ? now.getMonth() + 1
    : budget.year < now.getFullYear() ? 12 : 0;

  const summaries: BudgetFundSummary[] = [];

  for (const row of fundActuals ?? []) {
    const fid = row.fund_id;
    const planned = plannedByFund[fid] ?? { income: 0, expense: 0 };
    const actualIncome = Number(row.income_pence);
    const actualExpense = Number(row.expense_pence);

    const forecastIncome = monthsElapsed > 0 ? Math.round((actualIncome / monthsElapsed) * 12) : planned.income;
    const forecastExpense = monthsElapsed > 0 ? Math.round((actualExpense / monthsElapsed) * 12) : planned.expense;
    const projectedBalance = forecastIncome - forecastExpense;

    summaries.push({
      fundId: fid,
      fundName: row.fund_name,
      fundType: row.fund_type,
      plannedIncomePence: planned.income,
      plannedExpensePence: planned.expense,
      actualIncomePence: actualIncome,
      actualExpensePence: actualExpense,
      forecastIncomePence: forecastIncome,
      forecastExpensePence: forecastExpense,
      projectedBalancePence: projectedBalance,
      restrictedOverspendRisk: row.fund_type === 'restricted' && projectedBalance < 0,
    });
  }

  return { data: summaries, error: null };
}

/* ================================================================== */
/*  DRILL-DOWN                                                         */
/* ================================================================== */

export async function getBudgetDrillDown(params: {
  budgetId: string;
  accountId: string;
  fundId?: string | null;
  month?: number;
  page?: number;
  pageSize?: number;
}): Promise<{ data: DrillDownTransaction[]; total: number; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const { data: budget } = await supabase
    .from('budgets')
    .select('id, organisation_id, year')
    .eq('id', params.budgetId)
    .single();

  if (!budget || budget.organisation_id !== orgId) return { data: [], total: 0, error: 'Budget not found.' };

  const limit = params.pageSize ?? 50;
  const offset = ((params.page ?? 1) - 1) * limit;

  const { data } = await supabase.rpc('get_budget_drill_down', {
    p_org_id: orgId,
    p_year: budget.year,
    p_account_id: params.accountId,
    p_fund_id: params.fundId ?? null,
    p_month: params.month ?? null,
    p_limit: limit,
    p_offset: offset,
  });

  const rows: DrillDownTransaction[] = (data ?? []).map((r: Record<string, unknown>) => ({
    journalId: r.journal_id as string,
    journalDate: r.journal_date as string,
    memo: r.memo as string | null,
    description: r.description as string | null,
    debitPence: Number(r.debit_pence),
    creditPence: Number(r.credit_pence),
    fundId: r.fund_id as string | null,
  }));

  return { data: rows, total: rows.length, error: null };
}
