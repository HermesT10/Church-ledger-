import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
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
    <div className="mx-auto max-w-3xl px-6 py-6 space-y-6">
      <div>
        <Link
          href={`/suppliers/${id}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          &larr; Back to {supplier.name}
        </Link>
        <h1 className="text-2xl font-bold mt-2">Edit Supplier</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Update supplier details and default settings.
        </p>
      </div>
      <Suspense>
        <SupplierEditForm
          accounts={accounts ?? []}
          funds={funds ?? []}
          supplier={supplier}
          mode="edit"
        />
      </Suspense>
    </div>
  );
}
