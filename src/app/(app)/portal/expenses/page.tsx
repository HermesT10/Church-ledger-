import { requireCurrentPortalPage } from '@/lib/portal/current-user';
import {
  listPortalExpenseFormOptions,
  listPortalExpenseSubmissions,
} from '@/lib/portal/expense-submissions';
import { PortalExpensesClient } from './portal-expenses-client';

export default async function PortalExpensesPage() {
  const context = await requireCurrentPortalPage('expenses');
  const [submissions, options] = await Promise.all([
    listPortalExpenseSubmissions(),
    listPortalExpenseFormOptions(),
  ]);

  return (
    <PortalExpensesClient
      initialSubmissions={submissions.data}
      options={options.data}
      canSubmit={context.permissions.actions.submit}
    />
  );
}
