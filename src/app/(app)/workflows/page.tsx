import { getActiveOrg } from '@/lib/org';
import { getApprovalCounts, listInvoiceSubmissions, listExpenseRequests } from '@/lib/workflows/actions';
import { listConversations } from '@/lib/workflows/messages';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { ApprovalOverviewClient } from './approval-overview-client';

export default async function WorkflowsPage() {
  const { orgId, role } = await getActiveOrg();

  const [counts, invoicesRes, expensesRes, conversationsRes] = await Promise.all([
    getApprovalCounts(orgId),
    listInvoiceSubmissions(orgId, { status: 'pending', pageSize: 5 }),
    listExpenseRequests(orgId, { status: 'pending', pageSize: 5 }),
    listConversations(orgId),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Workflows"
        subtitle="Approvals, invoice submissions, expense requests, and team conversations."
      />

      <ApprovalOverviewClient
        role={role}
        counts={counts}
        recentInvoices={invoicesRes.data}
        recentExpenses={expensesRes.data}
        conversations={conversationsRes.data}
      />
    </PageShell>
  );
}
