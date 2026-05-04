import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { JournalForm } from '../journal-form';
import { JournalCorrectionActions } from '../journal-correction-actions';
import { PageShell } from '@/components/page-shell';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

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
    { data: orgSettings },
  ] = await Promise.all([
    supabase.from('journals').select('*').eq('id', id).eq('organisation_id', orgId).single(),
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
    supabase
      .from('organisation_settings')
      .select('require_fund_on_journal_lines')
      .eq('organisation_id', orgId)
      .maybeSingle(),
  ]);

  if (!journal) notFound();

  const canEdit =
    (role === 'admin' || role === 'treasurer') && journal.status === 'draft';
  const canCorrect =
    (role === 'admin' || role === 'treasurer') &&
    journal.status === 'posted' &&
    !journal.reversed_by &&
    !journal.reversal_of;
  const canPost = (role === 'admin' || role === 'treasurer') && journal.status === 'approved';
  const isReversed = Boolean(journal.reversed_by);
  const requireFundOnJournalLines = Boolean(orgSettings?.require_fund_on_journal_lines);

  const missingFundLineCount =
    journal.status === 'posted'
      ? (lines ?? []).filter(
          (l) =>
            ((l.debit_pence ?? 0) > 0 || (l.credit_pence ?? 0) > 0) &&
            (l.fund_id === null || l.fund_id === undefined),
        ).length
      : 0;
  const showMissingFundBanner = journal.status === 'posted' && canCorrect && missingFundLineCount > 0;

  return (
    <PageShell className="max-w-5xl">
      <PageHeader
        title={canEdit ? 'Edit Journal' : 'Journal Detail'}
        subtitle={`${journal.reference ? `${journal.reference} · ` : ''}${journal.memo || 'No description'} · ${journal.journal_date}`}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={journal.status} />
            {isReversed && <StatusBadge status="reversed" />}
            {(canCorrect || canPost) && (
              <JournalCorrectionActions
                journalId={journal.id}
                status={journal.status}
                disabled={!canCorrect && !canPost}
                missingFundLineCount={missingFundLineCount}
              />
            )}
            <Button asChild variant="outline" size="sm">
              <Link href="/journals">Back to Journals</Link>
            </Button>
          </div>
        }
      />
      {showMissingFundBanner && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-100">
          <p className="font-medium flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            Missing fund on {missingFundLineCount === 1 ? 'one line' : `${missingFundLineCount} lines`}
          </p>
          <p className="mt-2 text-amber-900/90 dark:text-amber-100/90">
            Fund-based reports may be incomplete until every amount line has a fund. You cannot edit this posted journal in place — use{' '}
            <strong>Amend</strong> to open a correction draft, assign funds, then approve and post the replacement.{' '}
            <strong>Reverse</strong> only backs out amounts; it does not add fund mappings.
          </p>
        </div>
      )}
      {(journal.reversed_by || journal.reversal_of || journal.replacement_journal_id || journal.original_journal_id) && (
        <Card className="mb-4 rounded-2xl border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Correction chain</CardTitle>
            <CardDescription>
              Linked journals preserve the audit trail for reversals and amendments.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            {journal.reversal_of && (
              <p>Reversal of: <Link className="text-primary underline" href={`/journals/${journal.reversal_of}`}>{journal.reversal_of}</Link></p>
            )}
            {journal.reversed_by && (
              <p>Reversed by: <Link className="text-primary underline" href={`/journals/${journal.reversed_by}`}>{journal.reversed_by}</Link></p>
            )}
            {journal.original_journal_id && (
              <p>Original journal: <Link className="text-primary underline" href={`/journals/${journal.original_journal_id}`}>{journal.original_journal_id}</Link></p>
            )}
            {journal.replacement_journal_id && (
              <p>Correction draft: <Link className="text-primary underline" href={`/journals/${journal.replacement_journal_id}`}>{journal.replacement_journal_id}</Link></p>
            )}
          </CardContent>
        </Card>
      )}
      <JournalForm
        accounts={accounts ?? []}
        funds={funds ?? []}
        suppliers={suppliers ?? []}
        requireFundOnJournalLines={requireFundOnJournalLines}
        journal={{
          id: journal.id,
          journal_date: journal.journal_date,
          reference: journal.reference ?? null,
          memo: journal.memo,
          status: journal.status,
          attachment_url: journal.attachment_url ?? null,
        }}
        lines={lines ?? []}
        canEdit={canEdit}
      />
    </PageShell>
  );
}
