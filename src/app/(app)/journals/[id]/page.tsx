import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { JournalForm } from '../journal-form';

export default async function JournalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { orgId, role } = await getActiveOrg();
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: journal },
    { data: lines },
    { data: accounts },
    { data: funds },
    { data: suppliers },
  ] = await Promise.all([
    supabase.from('journals').select('*').eq('id', id).single(),
    supabase
      .from('journal_lines')
      .select('*')
      .eq('journal_id', id)
      .order('created_at'),
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

  if (!journal) notFound();

  const canEdit =
    (role === 'admin' || role === 'treasurer') && journal.status === 'draft';

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <Link href="/journals" className="text-sm text-muted-foreground hover:underline">
          &larr; Back to Journals
        </Link>
        <h1 className="text-2xl font-bold mt-2">
          {canEdit ? 'Edit Journal' : `Journal (${journal.status})`}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {journal.reference && (
            <span className="font-mono mr-2">{journal.reference}</span>
          )}
          {journal.memo || 'No description'} &mdash; {journal.journal_date}
        </p>
      </div>
      <JournalForm
        accounts={accounts ?? []}
        funds={funds ?? []}
        suppliers={suppliers ?? []}
        journal={{
          id: journal.id,
          journal_date: journal.journal_date,
          reference: journal.reference ?? null,
          memo: journal.memo,
          status: journal.status,
        }}
        lines={lines ?? []}
        canEdit={canEdit}
      />
    </div>
  );
}
