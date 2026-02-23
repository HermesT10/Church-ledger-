import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { listInvoiceSubmissions } from '@/lib/workflows/actions';
import { InvoicesClient } from './invoices-client';

export default async function WorkflowInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { orgId, role } = await getActiveOrg();
  const supabase = await createClient();
  const { status } = await searchParams;
  const validStatus = ['pending', 'approved', 'rejected', 'converted'].includes(status ?? '')
    ? status!
    : undefined;

  const [invoicesRes, suppliersRes, fundsRes, accountsRes] = await Promise.all([
    listInvoiceSubmissions(orgId, { status: validStatus }),
    supabase.from('suppliers').select('id, name').eq('organisation_id', orgId).order('name'),
    supabase.from('funds').select('id, name').eq('organisation_id', orgId).eq('is_active', true).order('name'),
    supabase.from('accounts').select('id, code, name').eq('organisation_id', orgId).eq('type', 'expense').eq('is_active', true).order('code'),
  ]);

  const currentStatus = validStatus ?? 'all';

  return (
    <InvoicesClient
      orgId={orgId}
      role={role}
      initialData={invoicesRes.data}
      totalCount={invoicesRes.total}
      currentStatus={currentStatus}
      suppliers={(suppliersRes.data ?? []) as { id: string; name: string }[]}
      funds={(fundsRes.data ?? []) as { id: string; name: string }[]}
      expenseAccounts={(accountsRes.data ?? []) as { id: string; code: string; name: string }[]}
    />
  );
}
