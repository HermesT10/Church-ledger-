import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { ImportForm } from './import-form';

export default async function ImportPage({
  params,
}: {
  params: Promise<{ bankAccountId: string }>;
}) {
  const { orgId, role } = await getActiveOrg();
  const { bankAccountId } = await params;

  // Only treasurer or admin can import
  if (role !== 'admin' && role !== 'treasurer') {
    redirect('/banking');
  }

  // Fetch bank account to display name (exclude archived)
  const supabase = await createClient();
  const { data: bankAccount } = await supabase
    .from('bank_accounts')
    .select('id, name')
    .eq('id', bankAccountId)
    .eq('organisation_id', orgId)
    .eq('status', 'active')
    .single();

  if (!bankAccount) notFound();

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Import CSV</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Import transactions into <strong>{bankAccount.name}</strong>
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/banking">Back to Banking</Link>
        </Button>
      </div>

      <ImportForm
        orgId={orgId}
        bankAccountId={bankAccountId}
        bankAccountName={bankAccount.name}
      />
    </div>
  );
}
