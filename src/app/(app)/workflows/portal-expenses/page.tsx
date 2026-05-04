import { getActiveOrg } from '@/lib/org';
import { assertCanPerform } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { listPortalExpenseSubmissions } from '@/lib/portal/expense-submissions';
import { PortalExpensesAdminClient } from './portal-expenses-admin-client';

export default async function PortalExpenseSubmissionsAdminPage() {
  const { orgId, role } = await getActiveOrg();
  assertCanPerform(role, 'approve', 'workflows');
  const supabase = await createClient();

  const [submissions, bankLines] = await Promise.all([
    listPortalExpenseSubmissions({ admin: true }),
    supabase
      .from('bank_lines')
      .select('id, txn_date, description, amount_pence')
      .eq('workspace_id', orgId)
      .order('txn_date', { ascending: false })
      .limit(75),
  ]);

  return (
    <PortalExpensesAdminClient
      initialSubmissions={submissions.data}
      bankLines={(bankLines.data ?? []).map((line) => ({
        id: line.id,
        date: line.txn_date,
        description: line.description ?? null,
        amountPence: Number(line.amount_pence ?? 0),
      }))}
    />
  );
}
