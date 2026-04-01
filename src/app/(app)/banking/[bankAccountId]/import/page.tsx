import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
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
    <PageShell className="max-w-5xl">
      <div className="app-toolbar">
        <div className="flex-1">
          <PageHeader
            title="Import CSV"
            subtitle={`Import transactions into ${bankAccount.name} and map columns before posting.`}
          />
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
    </PageShell>
  );
}
