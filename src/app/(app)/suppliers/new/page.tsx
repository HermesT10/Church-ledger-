import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { SupplierEditForm } from '../supplier-edit-form';

export default async function NewSupplierPage() {
  const { orgId, role } = await getActiveOrg();

  if (role !== 'admin' && role !== 'treasurer') {
    redirect('/suppliers');
  }

  const supabase = await createClient();

  const [{ data: accounts }, { data: funds }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, name, type')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .in('type', ['expense'])
      .order('name'),
    supabase
      .from('funds')
      .select('id, name')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('name'),
  ]);

  return (
    <PageShell className="max-w-4xl">
      <div>
        <Link href="/suppliers" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to Suppliers
        </Link>
      </div>
      <PageHeader
        title="New Supplier"
        subtitle="Add a new supplier to your directory and set default coding for future bills."
      />
      <Suspense>
        <SupplierEditForm
          accounts={accounts ?? []}
          funds={funds ?? []}
          mode="create"
        />
      </Suspense>
    </PageShell>
  );
}
