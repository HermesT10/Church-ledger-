import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { BillForm } from '../bill-form';

export default async function NewBillPage({
  searchParams,
}: {
  searchParams: Promise<{ supplier?: string; error?: string }>;
}) {
  const { orgId, role } = await getActiveOrg();
  const params = await searchParams;

  if (role !== 'admin' && role !== 'treasurer') {
    redirect('/bills');
  }

  const supabase = await createClient();

  const [{ data: suppliers }, { data: accounts }, { data: funds }] =
    await Promise.all([
      supabase
        .from('suppliers')
        .select('id, name, default_account_id, default_fund_id')
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

  // Build a map of supplier defaults
  const supplierDefaultsMap: Record<string, { default_account_id: string | null; default_fund_id: string | null }> = {};
  for (const s of suppliers ?? []) {
    supplierDefaultsMap[s.id] = {
      default_account_id: s.default_account_id ?? null,
      default_fund_id: s.default_fund_id ?? null,
    };
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <Link
          href="/bills"
          className="text-sm text-muted-foreground hover:underline"
        >
          &larr; Back to Invoices
        </Link>
        <h1 className="text-2xl font-bold mt-2">New Invoice</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create a new supplier invoice with line items.
        </p>
      </div>
      <BillForm
        accounts={accounts ?? []}
        funds={funds ?? []}
        suppliers={(suppliers ?? []).map((s) => ({ id: s.id, name: s.name }))}
        supplierDefaultsMap={supplierDefaultsMap}
        preselectedSupplierId={params.supplier}
        canEdit={true}
      />
    </div>
  );
}
