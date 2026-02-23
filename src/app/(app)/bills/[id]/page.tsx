import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { BillForm } from '../bill-form';

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
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <Link
          href="/bills"
          className="text-sm text-muted-foreground hover:underline"
        >
          &larr; Back to Invoices
        </Link>
        <h1 className="text-2xl font-bold mt-2">
          {bill.status === 'draft' && canEdit
            ? 'Edit Invoice'
            : `Invoice ${bill.bill_number || id.slice(0, 8)}`}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {(bill.suppliers as { name: string } | null)?.name ?? 'Unknown supplier'}{' '}
          — {bill.bill_date}
        </p>
      </div>
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
    </div>
  );
}
