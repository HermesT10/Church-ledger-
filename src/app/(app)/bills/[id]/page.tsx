import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { BillForm } from '../bill-form';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';

export default async function BillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId, role } = await getActiveOrg();
  const supabase = await createClient();

  // Fetch bill, lines, and dropdown data in parallel
  const [
    { data: bill },
    { data: lines },
    { data: suppliers },
    { data: accounts },
    { data: funds },
  ] = await Promise.all([
    supabase
      .from('bills')
      .select('*, suppliers(id, name)')
      .eq('id', id)
      .single(),
    supabase
      .from('bill_lines')
      .select('*')
      .eq('bill_id', id)
      .order('id'),
    supabase
      .from('suppliers')
      .select('id, name')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('accounts')
      .select('id, code, name')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .eq('available_in_invoices', true)
      .in('type', ['expense'])
      .order('code'),
    supabase
      .from('funds')
      .select('id, name')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('name'),
  ]);

  if (!bill) notFound();

  const canEdit =
    (role === 'admin' || role === 'treasurer') &&
    (bill.status === 'draft' || bill.status === 'approved');

  return (
    <PageShell className="max-w-5xl">
      <PageHeader
        title={
          bill.status === 'draft' && canEdit
            ? 'Edit Invoice'
            : `Invoice ${bill.bill_number || id.slice(0, 8)}`
        }
        subtitle={`${(bill.suppliers as { name: string } | null)?.name ?? 'Unknown supplier'} · ${bill.bill_date}`}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={bill.status} />
            <Button asChild variant="outline" size="sm">
              <Link href="/bills">Back to Invoices</Link>
            </Button>
          </div>
        }
      />
      <BillForm
        accounts={accounts ?? []}
        funds={funds ?? []}
        suppliers={suppliers ?? []}
        bill={{
          id,
          supplier_id: bill.supplier_id,
          bill_number: bill.bill_number,
          bill_date: bill.bill_date,
          due_date: bill.due_date,
          status: bill.status,
          total_pence: Number(bill.total_pence),
          journal_id: bill.journal_id,
          attachment_url: bill.attachment_url ?? null,
        }}
        lines={
          (lines ?? []).map((l) => ({
            id: l.id,
            account_id: l.account_id,
            fund_id: l.fund_id,
            description: l.description,
            amount_pence: Number(l.amount_pence),
          }))
        }
        canEdit={canEdit}
      />
    </PageShell>
  );
}
