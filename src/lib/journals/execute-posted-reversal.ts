import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildReversalLines,
  canReverse,
  validateReversal,
  type JournalLine,
} from '@/lib/journals/reversal';
import { logServerFailure } from '@/lib/monitoring';
import { isDateInLockedPeriod } from '@/lib/periods/actions';

/**
 * Creates and posts a reversal journal and links it to the original.
 * Caller must enforce permissions; used by {@link reverseJournal} and bank unreconcile.
 */
export async function executePostedJournalReversal(params: {
  admin: SupabaseClient;
  orgId: string;
  userId: string;
  journalId: string;
  reason: string;
  reversalDate: string;
}): Promise<{ reversalId: string } | { error: string }> {
  const { admin, orgId, userId, journalId, reason, reversalDate } = params;
  const trimmedReason = reason.trim();

  if (!trimmedReason) {
    return { error: 'A reversal reason is required.' };
  }

  const { data: journal, error: journalErr } = await admin
    .from('journals')
    .select('id, organisation_id, journal_date, memo, reference, status, reversal_of, reversed_by')
    .eq('id', journalId)
    .eq('organisation_id', orgId)
    .single();

  if (journalErr || !journal) {
    await logServerFailure({
      area: 'journals',
      event: 'reverse_journal_load_failed',
      error: journalErr ?? new Error('Journal not found.'),
      metadata: { journalId, orgId, userId },
      capture: Boolean(journalErr),
    });
    return { error: 'Journal not found.' };
  }

  const reverseCheck = canReverse({
    status: journal.status as string,
    reversed_by: journal.reversed_by as string | null,
    reversal_of: journal.reversal_of as string | null,
  });
  if (!reverseCheck.allowed) {
    return { error: reverseCheck.reason ?? 'Cannot reverse this journal.' };
  }

  const { data: originalLines, error: linesErr } = await admin
    .from('journal_lines')
    .select('account_id, fund_id, description, debit_pence, credit_pence')
    .eq('journal_id', journalId);

  if (linesErr || !originalLines || originalLines.length === 0) {
    await logServerFailure({
      area: 'journals',
      event: 'reverse_journal_lines_failed',
      error: linesErr ?? new Error('Could not fetch journal lines.'),
      metadata: { journalId, orgId, userId },
      capture: Boolean(linesErr),
    });
    return { error: 'Could not fetch journal lines.' };
  }

  const typedLines: JournalLine[] = originalLines.map((l) => ({
    account_id: l.account_id as string,
    fund_id: (l.fund_id as string) ?? null,
    description: (l.description as string) ?? null,
    debit_pence: l.debit_pence as number,
    credit_pence: l.credit_pence as number,
  }));

  const reversalLines = buildReversalLines(typedLines);
  const validation = validateReversal(typedLines, reversalLines);
  if (!validation.valid) {
    return { error: `Reversal validation failed: ${validation.errors.join('; ')}` };
  }

  const reversalLocked = await isDateInLockedPeriod(reversalDate);
  if (reversalLocked) {
    return { error: 'Cannot create a reversal in a locked financial period.' };
  }

  const { data: reversalJournal, error: createErr } = await admin
    .from('journals')
    .insert({
      organisation_id: orgId,
      journal_date: reversalDate,
      reference: journal.reference ? `REV-${journal.reference}` : null,
      memo: `Reversal of: ${journal.memo ?? journalId.slice(0, 8)}`,
      status: 'draft',
      created_by: userId,
      reversal_of: journalId,
      reversal_of_journal_id: journalId,
      reversal_reason: trimmedReason,
    })
    .select('id')
    .single();

  if (createErr || !reversalJournal) {
    await logServerFailure({
      area: 'journals',
      event: 'reverse_journal_create_failed',
      error: createErr ?? new Error('Failed to create reversal journal.'),
      metadata: { journalId, orgId, userId },
      capture: Boolean(createErr),
    });
    return { error: createErr?.message ?? 'Failed to create reversal journal.' };
  }

  const lineRows = reversalLines.map((line) => ({
    journal_id: reversalJournal.id,
    organisation_id: orgId,
    account_id: line.account_id,
    fund_id: line.fund_id,
    description: line.description,
    debit_pence: line.debit_pence,
    credit_pence: line.credit_pence,
  }));

  const { error: insertErr } = await admin.from('journal_lines').insert(lineRows);
  if (insertErr) {
    await admin.from('journals').delete().eq('id', reversalJournal.id);
    await logServerFailure({
      area: 'journals',
      event: 'reverse_journal_insert_failed',
      error: insertErr,
      metadata: { journalId, reversalId: reversalJournal.id, orgId, userId },
    });
    return { error: insertErr.message };
  }

  const { error: postErr } = await admin
    .from('journals')
    .update({ status: 'posted', posted_by: userId })
    .eq('id', reversalJournal.id);

  if (postErr) {
    await admin.from('journal_lines').delete().eq('journal_id', reversalJournal.id);
    await admin.from('journals').delete().eq('id', reversalJournal.id);
    await logServerFailure({
      area: 'journals',
      event: 'reverse_journal_post_failed',
      error: postErr,
      metadata: { journalId, reversalId: reversalJournal.id, orgId, userId },
    });
    return { error: postErr.message };
  }

  const { error: updateErr } = await admin
    .from('journals')
    .update({
      reversed_by: reversalJournal.id,
      corrected_by_journal_id: reversalJournal.id,
      reversal_journal_id: reversalJournal.id,
      reversed_at: new Date().toISOString(),
      reversed_by_user_id: userId,
      amendment_reason: trimmedReason,
    })
    .eq('id', journalId);

  if (updateErr) {
    await logServerFailure({
      area: 'journals',
      event: 'reverse_journal_link_failed',
      error: updateErr,
      metadata: { journalId, reversalId: reversalJournal.id, orgId, userId },
    });
    return { error: `Reversal created but failed to link: ${updateErr.message}` };
  }

  return { reversalId: reversalJournal.id };
}
