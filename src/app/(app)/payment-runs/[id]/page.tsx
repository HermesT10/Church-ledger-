import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { getPaymentRun } from '@/lib/bills/actions';
import { listBankAccounts } from '@/lib/banking/bankAccounts';
import { PaymentRunDetailClient } from './payment-run-detail-client';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';

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
    <PageShell className="max-w-6xl">
      <PageHeader
        title={`Payment Run ${id.slice(0, 8)}`}
        subtitle={
          run.status === 'draft'
            ? 'Review invoices and approve this payment run.'
            : run.status === 'approved'
              ? 'This payment run is approved and ready to post.'
              : 'This payment run has been posted.'
        }
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={run.status} />
            <Button asChild variant="outline" size="sm">
              <Link href="/payment-runs">Back to Payment Runs</Link>
            </Button>
          </div>
        }
      />
      <PaymentRunDetailClient
        run={{
          id: run.id,
          run_date: run.run_date,
          status: run.status,
          total_pence: Number(run.total_pence),
          journal_id: run.journal_id,
          attachment_url: run.attachment_url ?? null,
        }}
        items={enrichedItems}
        bankAccounts={(bankAccounts ?? []).map((a) => ({
          id: a.id,
          name: a.name,
        }))}
        canEdit={canEdit}
      />
    </PageShell>
  );
}
