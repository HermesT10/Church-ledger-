import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { listBankAccounts } from '@/lib/banking/bankAccounts';
import { NewPaymentRunClient } from './new-payment-run-client';

export default async function NewPaymentRunPage() {
  const { orgId, role } = await getActiveOrg();

  // Only treasurer or admin can create payment runs
  if (role !== 'admin' && role !== 'treasurer') {
    redirect('/payment-runs');
  }

  const supabase = await createClient();

  // Fetch posted (unpaid) bills and active bank accounts in parallel
  const [{ data: bills }, { data: bankAccounts }] = await Promise.all([
    supabase
      .from('bills')
      .select('id, bill_number, bill_date, total_pence, status, suppliers(name)')
      .eq('organisation_id', orgId)
      .eq('status', 'posted')
      .order('bill_date', { ascending: false }),
    listBankAccounts(orgId),
  ]);

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div>
        <Link
          href="/payment-runs"
          className="text-sm text-muted-foreground hover:underline"
        >
          &larr; Back to Payment Runs
        </Link>
        <h1 className="text-2xl font-bold mt-2">New Payment Run</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select posted bills to include in a batch payment.
        </p>
      </div>
      <NewPaymentRunClient
        orgId={orgId}
        bills={
          (bills ?? []).map((b) => ({
            id: b.id,
            bill_number: b.bill_number,
            bill_date: b.bill_date,
            total_pence: Number(b.total_pence),
            supplier_name: (() => {
              const s = b.suppliers as
                | { name: string }
                | { name: string }[]
                | null;
              if (Array.isArray(s)) return s[0]?.name ?? 'Unknown';
              return s?.name ?? 'Unknown';
            })(),
          }))
        }
        bankAccounts={
          (bankAccounts ?? []).map((a) => ({
            id: a.id,
            name: a.name,
          }))
        }
      />
    </div>
  );
}
