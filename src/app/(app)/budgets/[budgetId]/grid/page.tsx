import { notFound } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { getBudgetGrid } from '@/lib/budgets/actions';
import { BudgetGridEditor } from '../budget-grid-editor';

export default async function BudgetGridPage({
  params,
}: {
  params: Promise<{ budgetId: string }>;
}) {
  const { role } = await getActiveOrg();
  const { budgetId } = await params;

  const { data: grid, error } = await getBudgetGrid(budgetId);

  if (!grid || error) notFound();

  const canEdit = (role === 'admin' || role === 'treasurer') && grid.budget.status === 'draft';

  return <BudgetGridEditor grid={grid} canEdit={canEdit} />;
}
