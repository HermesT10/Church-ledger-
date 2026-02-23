import Link from 'next/link';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { JournalForm } from '../journal-form';

export default async function NewJournalPage() {
  const { orgId, role } = await getActiveOrg();

  if (role !== 'admin' && role !== 'treasurer') {
    redirect('/journals');
  }

  const supabase = await createClient();

  const [{ data: accounts }, { data: funds }, { data: suppliers }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, code, name')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('code'),
    supabase
      .from('funds')
      .select('id, name')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('suppliers')
      .select('id, name')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('name'),
  ]);

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <Link href="/journals" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to Journals
        </Link>
        <h1 className="text-2xl font-bold mt-2">New Journal</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create a new double-entry journal entry. All lines must balance (total debits = total credits).
        </p>
      </div>
      <JournalForm
        accounts={accounts ?? []}
        funds={funds ?? []}
        suppliers={suppliers ?? []}
        canEdit={true}
      />
    </div>
  );
}
