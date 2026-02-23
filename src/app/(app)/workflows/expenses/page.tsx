import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { listExpenseRequests } from '@/lib/workflows/actions';
import { ExpensesClient } from './expenses-client';

export default async function WorkflowExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { orgId, role } = await getActiveOrg();
  const supabase = await createClient();
  const params = await searchParams;
  const status =
    params.status && params.status !== 'all' ? params.status : undefined;

  const [expensesRes, fundsRes, accountsRes] = await Promise.all([
    listExpenseRequests(orgId, { status }),
    supabase
      .from('funds')
      .select('id, name')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('accounts')
      .select('id, code, name')
      .eq('organisation_id', orgId)
      .eq('type', 'expense')
      .eq('is_active', true)
      .order('code'),
  ]);

  const currentStatus = params.status ?? 'all';

  return (
    <ExpensesClient
      orgId={orgId}
      role={role}
      currentStatus={currentStatus}
      initialData={expensesRes.data}
      totalCount={expensesRes.total}
      funds={(fundsRes.data ?? []) as { id: string; name: string }[]}
      expenseAccounts={
        (accountsRes.data ?? []) as { id: string; code: string; name: string }[]
      }
    />
  );
}
