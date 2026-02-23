import { notFound } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { SpendDetailClient } from './spend-detail-client';

export default async function SpendDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { orgId, role } = await getActiveOrg();
  const { id } = await params;
  const canEdit = role === 'admin' || role === 'treasurer';
  const isAdmin = role === 'admin';

  const supabase = await createClient();

  const { data: spend, error } = await supabase
    .from('cash_spends')
    .select('id, spend_date, paid_to, spent_by, description, receipt_url, fund_id, expense_account_id, amount_pence, status, posted_transaction_id, created_at, funds(name), accounts:expense_account_id(name)')
    .eq('id', id)
    .eq('organisation_id', orgId)
    .single();

  if (error || !spend) notFound();

  const fund = spend.funds as unknown as { name: string } | null;
  const account = spend.accounts as unknown as { name: string } | null;

  return (
    <SpendDetailClient
      spend={{
        id: spend.id,
        spend_date: spend.spend_date,
        paid_to: spend.paid_to,
        spent_by: spend.spent_by,
        description: spend.description,
        receipt_url: spend.receipt_url,
        fund_name: fund?.name ?? 'Unknown',
        expense_account_name: account?.name ?? 'Unknown',
        amount_pence: Number(spend.amount_pence),
        status: spend.status as 'draft' | 'posted',
        posted_transaction_id: spend.posted_transaction_id,
      }}
      canEdit={canEdit}
      isAdmin={isAdmin}
    />
  );
}
