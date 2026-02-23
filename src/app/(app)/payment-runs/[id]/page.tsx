import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { getPaymentRun } from '@/lib/bills/actions';
import { listBankAccounts } from '@/lib/banking/bankAccounts';
import { PaymentRunDetailClient } from './payment-run-detail-client';

export default async function PaymentRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId, role } = await getActiveOrg();

  const [{ run, items, error }, { data: bankAccounts }] = await Promise.all([
    getPaymentRun(id),
    listBankAccounts(orgId),
  ]);

  if (error || !run) notFound();

  const canEdit = role === 'admin' || role === 'treasurer';

  // Enrich items for the client
  const enrichedItems = (items ?? []).map((item) => {
    const bill = item.bills as {
      id: string;
      bill_number: string | null;
      bill_date: string;
      total_pence: number;
      status: string;
      suppliers: { name: string } | null;
    } | null;

    return {
      id: item.id,
      bill_id: item.bill_id,
      amount_pence: Number(item.amount_pence),
      bill_number: bill?.bill_number ?? null,
      bill_date: bill?.bill_date ?? '',
      bill_status: bill?.status ?? '',
      supplier_name: bill?.suppliers?.name ?? 'Unknown',
    };
  });

  return (
    <div className="p-6 max-w-5xl space-y-6">
      <div>
        <Link
          href="/payment-runs"
          className="text-sm text-muted-foreground hover:underline"
        >
          &larr; Back to Payment Runs
        </Link>
        <h1 className="text-2xl font-bold mt-2">
          Payment Run {id.slice(0, 8)}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {run.status === 'draft'
            ? 'Review invoices and post this payment run.'
            : 'This payment run has been posted.'}
        </p>
      </div>
      <PaymentRunDetailClient
        run={{
          id: run.id,
          run_date: run.run_date,
          status: run.status,
          total_pence: Number(run.total_pence),
          journal_id: run.journal_id,
        }}
        items={enrichedItems}
        bankAccounts={(bankAccounts ?? []).map((a) => ({
          id: a.id,
          name: a.name,
        }))}
        canEdit={canEdit}
      />
    </div>
  );
}
