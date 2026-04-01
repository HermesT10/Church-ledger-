import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { getSupplier } from '@/lib/suppliers/actions';
import { SupplierEditForm } from '../../supplier-edit-form';

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { orgId, role } = await getActiveOrg();

  if (role !== 'admin' && role !== 'treasurer') {
    redirect(`/suppliers/${id}`);
  }

  const { data: supplier } = await getSupplier(id);
  if (!supplier) notFound();

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
        <Link href={`/suppliers/${id}`} className="text-sm text-muted-foreground hover:underline">
          &larr; Back to {supplier.name}
        </Link>
      </div>
      <PageHeader
        title="Edit Supplier"
        subtitle="Update supplier details, defaults, and billing preferences."
      />
      <Suspense>
        <SupplierEditForm
          accounts={accounts ?? []}
          funds={funds ?? []}
          supplier={supplier}
          mode="edit"
        />
      </Suspense>
    </PageShell>
  );
}
