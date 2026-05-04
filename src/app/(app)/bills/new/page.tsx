import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { getInvoiceFormOptions } from '@/lib/invoices/actions';
import { NewInvoiceClient } from './new-invoice-client';

export default async function NewBillPage() {
  const { role } = await getActiveOrg();

  if (role !== 'admin' && role !== 'treasurer') {
    redirect('/bills');
  }

  const options = await getInvoiceFormOptions();

  return (
    <PageShell className="max-w-6xl space-y-6">
      <PageHeader
        title="New Invoice"
        subtitle="Create a supplier bill to pay, or an invoice owed to the church."
        actions={
          <ButtonBack />
        }
      />
      <NewInvoiceClient options={options} />
    </PageShell>
  );
}

function ButtonBack() {
  return (
    <Link href="/bills" className="text-sm text-muted-foreground hover:underline">
      Back to Invoices
    </Link>
  );
}
