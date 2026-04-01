import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { listBankAccounts } from '@/lib/banking/bankAccounts';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
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
    <PageShell className="max-w-6xl">
      <div>
        <Link href="/payment-runs" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to Payment Runs
        </Link>
      </div>
      <PageHeader
        title="New Payment Run"
        subtitle="Build a batch payment from posted bills, then review and post when ready."
      />
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
    </PageShell>
  );
}
