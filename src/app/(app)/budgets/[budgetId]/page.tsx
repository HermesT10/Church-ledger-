import { notFound } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { getBudgetMonthlyPlanning } from '@/lib/budgets/actions';
import { MonthlyPlanningClient } from './monthly-planning-client';
import type { BudgetRow, FundRef } from '@/lib/budgets/types';

export default async function BudgetMonthlyPage({
  params,
  searchParams,
}: {
  params: Promise<{ budgetId: string }>;
  searchParams: Promise<{ month?: string; fund?: string }>;
}) {
  const { orgId, role } = await getActiveOrg();
  const { budgetId } = await params;
  const sp = await searchParams;

  const month = parseInt(sp.month ?? String(new Date().getMonth() + 1), 10);
  const fundId = sp.fund || null;

  const supabase = await createClient();

  // Fetch budget header
  const { data: budget } = await supabase
    .from('budgets')
    .select('*')
    .eq('id', budgetId)
    .eq('organisation_id', orgId)
    .single();

  if (!budget) notFound();

  // Fetch funds for filter
  const { data: funds } = await supabase
    .from('funds')
    .select('id, name, type')
    .eq('organisation_id', orgId)
    .eq('is_active', true)
    .order('name');

  // Fetch accounts for the add-item modal
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, code, name, type')
    .eq('organisation_id', orgId)
    .in('type', ['income', 'expense'])
    .eq('is_active', true)
    .order('type')
    .order('code');

  // Fetch monthly planning data
  const { data: planningData } = await getBudgetMonthlyPlanning(budgetId, month, fundId);

  const canEdit = (role === 'admin' || role === 'treasurer') && budget.status === 'draft';

  return (
    <MonthlyPlanningClient
      budget={budget as BudgetRow}
      planningData={planningData}
      month={month}
      fundId={fundId}
      funds={(funds ?? []) as FundRef[]}
      accounts={(accounts ?? []).map((a) => ({ id: a.id, code: a.code, name: a.name, type: a.type }))}
      canEdit={canEdit}
    />
  );
}
