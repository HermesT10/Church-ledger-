'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentPortalAccess } from '@/lib/portal/current-user';
import { enforcePortalPermissionForContext } from '@/lib/portal-permissions';
import { getRegisterData, getRegisterDrillDown } from '@/lib/registers/actions';
import type {
  RegisterData,
  RegisterDrillDownData,
  RegisterGroupBy,
  RegisterMonthCell,
  RegisterRow,
  RegisterType,
} from '@/lib/registers/types';

export interface PortalRegisterResult {
  register: RegisterData | null;
  permittedFunds: { id: string; name: string; type: string }[];
  scopeLabel: string;
  canSubmitExpenses: boolean;
}

function emptyCell(month: number): RegisterMonthCell {
  return {
    month,
    actualPence: 0,
    budgetPence: 0,
    variancePence: 0,
    comparisonActualPence: null,
    comparisonVariancePence: null,
    unreconciledCount: 0,
  };
}

function recalculateRegister(data: RegisterData, rows: RegisterRow[], fundId: string | null): RegisterData {
  const monthlyTotals = Array.from({ length: 12 }, (_, index) => {
    const actualPence = rows.reduce((sum, row) => sum + row.months[index].actualPence, 0);
    const budgetPence = rows.reduce((sum, row) => sum + row.months[index].budgetPence, 0);
    return {
      ...emptyCell(index + 1),
      actualPence,
      budgetPence,
      variancePence: actualPence - budgetPence,
      comparisonActualPence: data.comparisonYear
        ? rows.reduce((sum, row) => sum + (row.months[index].comparisonActualPence ?? 0), 0)
        : null,
    };
  });

  return {
    ...data,
    fundId,
    rows,
    monthlyTotals,
    totals: {
      actualPence: monthlyTotals.reduce((sum, month) => sum + month.actualPence, 0),
      budgetPence: monthlyTotals.reduce((sum, month) => sum + month.budgetPence, 0),
      variancePence: monthlyTotals.reduce((sum, month) => sum + month.variancePence, 0),
      comparisonActualPence: data.comparisonYear
        ? monthlyTotals.reduce((sum, month) => sum + (month.comparisonActualPence ?? 0), 0)
        : null,
    },
  };
}

async function assignedFunds(workspaceId: string, userId: string, requireSubmit = false) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('user_fund_assignments')
    .select('fund_id, funds(id, name, type)')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .eq(requireSubmit ? 'can_submit_against' : 'can_view', true);
  return (data ?? []).map((row) => {
    const fund = Array.isArray(row.funds) ? row.funds[0] : row.funds;
    return fund ? { id: fund.id, name: fund.name, type: fund.type } : null;
  }).filter((fund): fund is { id: string; name: string; type: string } => Boolean(fund));
}

async function assignedAccountIds(workspaceId: string, userId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('user_category_assignments')
    .select('category_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .eq('can_view', true);
  return new Set((data ?? []).map((row) => row.category_id as string));
}

async function assignedBudgetScope(workspaceId: string, userId: string) {
  const admin = createAdminClient();
  const { data: assignments } = await admin
    .from('user_budget_assignments')
    .select('budget_id, budget_category_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .eq('can_view', true);

  const budgetIds = [...new Set((assignments ?? []).map((row) => row.budget_id as string).filter(Boolean))];
  if (budgetIds.length === 0) return { accountIds: new Set<string>(), fundIds: new Set<string>() };
  const { data: lines } = await admin
    .from('budget_lines')
    .select('account_id, fund_id')
    .in('budget_id', budgetIds);
  return {
    accountIds: new Set((lines ?? []).map((line) => line.account_id as string).filter(Boolean)),
    fundIds: new Set((lines ?? []).map((line) => line.fund_id as string).filter(Boolean)),
  };
}

async function ownExpenseRegister(year: number): Promise<RegisterData> {
  const access = await getCurrentPortalAccess();
  const admin = createAdminClient();
  const { data } = await admin
    .from('portal_expense_submissions')
    .select('id, expense_date, detail, amount_pence, status')
    .eq('workspace_id', access.orgId)
    .eq('submitted_by', access.user.id)
    .not('status', 'in', '(rejected,voided)')
    .gte('expense_date', `${year}-01-01`)
    .lte('expense_date', `${year}-12-31`);

  const months = Array.from({ length: 12 }, (_, index) => emptyCell(index + 1));
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const month = Number(String(row.expense_date).slice(5, 7)) - 1;
    if (month >= 0 && month < 12) {
      months[month].actualPence += Number(row.amount_pence ?? 0);
      months[month].variancePence = months[month].actualPence;
    }
  }
  const total = months.reduce((sum, month) => sum + month.actualPence, 0);
  const row: RegisterRow = {
    categoryId: 'own-submitted-expenses',
    name: 'Own submitted expenses',
    groupName: 'Portal submissions',
    displayOrder: 1,
    isUncategorized: false,
    months,
    totalActualPence: total,
    totalBudgetPence: 0,
    totalVariancePence: total,
    comparisonTotalActualPence: null,
    reviewCount: 0,
    sourceType: 'category',
    sourceId: null,
  };

  return {
    registerType: 'expense',
    year,
    comparisonYear: null,
    fundId: null,
    funds: [],
    rows: [row],
    monthlyTotals: months,
    totals: {
      actualPence: total,
      budgetPence: 0,
      variancePence: total,
      comparisonActualPence: null,
    },
    insights: ['Showing only expenses submitted from your portal account.'],
    unmappedAccountCount: 0,
    groupBy: 'category',
    reviewItems: [],
  };
}

export async function listPortalRegisterData(params: {
  registerType: RegisterType;
  year: number;
  fundId?: string | null;
}): Promise<{ data: PortalRegisterResult; error: string | null }> {
  const access = await getCurrentPortalAccess();
  const page = params.registerType === 'income' ? 'income_register' : 'expense_register';
  try {
    await enforcePortalPermissionForContext(access, page, 'view');
  } catch (error) {
    return {
      data: { register: null, permittedFunds: [], scopeLabel: 'No access', canSubmitExpenses: false },
      error: error instanceof Error ? error.message : 'Permission denied.',
    };
  }

  const permittedFunds = await assignedFunds(access.orgId, access.user.id);
  const canSubmitExpenses = Boolean(access.permissions.pages.expenses && access.permissions.actions.submit);
  if (params.registerType === 'expense' && access.permissions.scopes.own_records && !access.permissions.scopes.all_workspace && !access.permissions.scopes.assigned_budgets && !access.permissions.scopes.assigned_funds) {
    return {
      data: {
        register: await ownExpenseRegister(params.year),
        permittedFunds,
        scopeLabel: 'Own submitted expenses',
        canSubmitExpenses,
      },
      error: null,
    };
  }

  let fundId = params.fundId ?? null;
  let groupBy: RegisterGroupBy = 'category';
  let scopeLabel = 'All workspace';
  let filterAccountIds: Set<string> | null = null;

  if (!access.permissions.scopes.all_workspace) {
    if (access.permissions.scopes.assigned_funds) {
      if (!fundId) fundId = permittedFunds[0]?.id ?? null;
      if (fundId && !permittedFunds.some((fund) => fund.id === fundId)) {
        fundId = permittedFunds[0]?.id ?? null;
      }
      scopeLabel = 'Assigned funds only';
    }
    if (access.permissions.scopes.assigned_categories) {
      filterAccountIds = await assignedAccountIds(access.orgId, access.user.id);
      groupBy = 'account';
      scopeLabel = 'Assigned categories only';
    }
    if (params.registerType === 'expense' && access.permissions.scopes.assigned_budgets) {
      const budgetScope = await assignedBudgetScope(access.orgId, access.user.id);
      filterAccountIds = budgetScope.accountIds;
      if (!fundId && budgetScope.fundIds.size > 0) fundId = [...budgetScope.fundIds][0];
      groupBy = 'account';
      scopeLabel = 'Assigned budgets only';
    }
  }

  const register = await getRegisterData({
    registerType: params.registerType,
    year: params.year,
    comparisonYear: params.year - 1,
    fundId,
    groupBy,
  });
  if (register.error || !register.data) {
    return { data: { register: null, permittedFunds, scopeLabel, canSubmitExpenses }, error: register.error };
  }

  const rows = filterAccountIds
    ? register.data.rows.filter((row) => row.sourceId && filterAccountIds.has(row.sourceId))
    : register.data.rows;

  return {
    data: {
      register: recalculateRegister(register.data, rows, fundId),
      permittedFunds: access.permissions.scopes.all_workspace ? register.data.funds : permittedFunds,
      scopeLabel,
      canSubmitExpenses,
    },
    error: null,
  };
}

export async function getPortalRegisterDrillDown(params: {
  registerType: RegisterType;
  year: number;
  month: number;
  categoryId: string;
  fundId?: string | null;
  groupBy?: RegisterGroupBy;
}): Promise<{ data: RegisterDrillDownData | null; error: string | null }> {
  const access = await getCurrentPortalAccess();
  const page = params.registerType === 'income' ? 'income_register' : 'expense_register';
  try {
    await enforcePortalPermissionForContext(access, page, 'view');
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Permission denied.' };
  }
  return getRegisterDrillDown(params);
}
