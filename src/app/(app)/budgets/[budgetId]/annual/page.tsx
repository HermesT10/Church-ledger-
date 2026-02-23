import { notFound } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { getBudgetAnnualView, getBudgetFundSummary } from '@/lib/budgets/actions';
import { AnnualViewClient } from './annual-view-client';
import type { BudgetRow, FundRef } from '@/lib/budgets/types';

export default async function BudgetAnnualPage({
  params,
  searchParams,
}: {
  params: Promise<{ budgetId: string }>;
  searchParams: Promise<{ fund?: string }>;
}) {
  const { orgId } = await getActiveOrg();
  const { budgetId } = await params;
  const sp = await searchParams;
  const fundId = sp.fund || null;

  const supabase = await createClient();

  const { data: budget } = await supabase
    .from('budgets')
    .select('*')
    .eq('id', budgetId)
    .eq('organisation_id', orgId)
    .single();

  if (!budget) notFound();

  const { data: funds } = await supabase
    .from('funds')
    .select('id, name, type')
    .eq('organisation_id', orgId)
    .eq('is_active', true)
    .order('name');

  const [{ data: annualData }, { data: fundSummaries }] = await Promise.all([
    getBudgetAnnualView(budgetId, fundId),
    getBudgetFundSummary(budgetId),
  ]);

  return (
    <AnnualViewClient
      budget={budget as BudgetRow}
      annualData={annualData}
      fundSummaries={fundSummaries}
      fundId={fundId}
      funds={(funds ?? []) as FundRef[]}
    />
  );
}
