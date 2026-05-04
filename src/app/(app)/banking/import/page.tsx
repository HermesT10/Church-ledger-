import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { ImportForm } from '../[bankAccountId]/import/import-form';

export default async function BankingImportPage() {
  const { orgId, role } = await getActiveOrg();
  if (role !== 'admin' && role !== 'treasurer') {
    redirect('/banking');
  }

  const supabase = await createClient();
  const { data: accounts } = await supabase
    .from('bank_accounts')
    .select('id, name')
    .eq('organisation_id', orgId)
    .eq('is_active', true)
    .order('name');

  return (
    <div className="max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Upload Statement</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload a CSV or XLSX bank statement, review the rows, and import clean transactions.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/banking">Back to Banking</Link>
        </Button>
      </div>

      <ImportForm accounts={accounts ?? []} />
    </div>
  );
}
