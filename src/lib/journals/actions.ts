'use server';

import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { buildReversalLines, canReverse, validateReversal } from '@/lib/journals/reversal';
import type { JournalLine } from '@/lib/journals/reversal';
import { invalidateOrgReportCache } from '@/lib/cache';
import { logAuditEvent } from '@/lib/audit';
import { assertWriteAllowed } from '@/lib/demo';
import { isDateInLockedPeriod } from '@/lib/periods/actions';
import type { JournalRow, JournalWithTotals } from './types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface LineInput {
  account_id: string;
  fund_id: string | null;
  supplier_id?: string | null;
  description: string;
  debit: string;
  credit: string;
}

function toPence(pounds: string): number {
  const n = parseFloat(pounds || '0');
  return Math.round(n * 100);
}

/* ------------------------------------------------------------------ */
/*  Validation helpers                                                 */
/* ------------------------------------------------------------------ */

function validateLines(
  lines: LineInput[],
  redirectUrl: string,
): void {
  if (lines.length < 2) {
    redirect(redirectUrl + '?error=' + encodeURIComponent('At least two journal lines are required.'));
  }

  // Check for zero-value lines
  for (let i = 0; i < lines.length; i++) {
    const d = toPence(lines[i].debit);
    const c = toPence(lines[i].credit);
    if (d === 0 && c === 0) {
      redirect(
        redirectUrl + '?error=' + encodeURIComponent(`Line ${i + 1} has no amount. Each line must have a debit or credit value.`),
      );
    }
    if (d > 0 && c > 0) {
      redirect(
        redirectUrl + '?error=' + encodeURIComponent(`Line ${i + 1} has both debit and credit. Only one side is allowed per line.`),
      );
    }
  }

  // Check required fields
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].account_id) {
      redirect(
        redirectUrl + '?error=' + encodeURIComponent(`Line ${i + 1} is missing an account.`),
      );
    }
    if (!lines[i].fund_id) {
      redirect(
        redirectUrl + '?error=' + encodeURIComponent(`Line ${i + 1} is missing a fund. Every journal line requires a fund.`),
      );
    }
  }

  // Check balance
  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of lines) {
    totalDebit += toPence(line.debit);
    totalCredit += toPence(line.credit);
  }

  if (totalDebit !== totalCredit) {
    const diff = Math.abs(totalDebit - totalCredit) / 100;
    redirect(
      redirectUrl + '?error=' + encodeURIComponent(`Journal is unbalanced. Total debits and credits must be equal (difference: £${diff.toFixed(2)}).`),
    );
  }

  if (totalDebit === 0) {
    redirect(
      redirectUrl + '?error=' + encodeURIComponent('Journal has no amounts. At least one debit and one credit are required.'),
    );
  }
}

/* ------------------------------------------------------------------ */
/*  Read operations                                                    */
/* ------------------------------------------------------------------ */

/**
 * Fetch journals with computed totals and created-by name.
 */
export async function getJournalsWithTotals(options?: {
  status?: string;
}): Promise<{ data: JournalWithTotals[]; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  let query = supabase
    .from('journals')
    .select('*')
    .eq('organisation_id', orgId)
    .order('journal_date', { ascending: false });

  if (options?.status && options.status !== 'all') {
    query = query.eq('status', options.status);
  }

  const { data: journals, error: journalsErr } = await query;

  if (journalsErr || !journals) {
    return { data: [], error: journalsErr?.message ?? 'Failed to fetch journals.' };
  }

  if (journals.length === 0) {
    return { data: [], error: null };
  }

  // Fetch all lines for these journals
  const journalIds = journals.map((j) => j.id);

  const { data: allLines } = await supabase
    .from('journal_lines')
    .select('journal_id, debit_pence, credit_pence')
    .in('journal_id', journalIds);

  // Aggregate totals per journal
  const totalsMap = new Map<string, { debit: number; credit: number; count: number }>();
  for (const line of allLines ?? []) {
    const existing = totalsMap.get(line.journal_id) ?? { debit: 0, credit: 0, count: 0 };
    existing.debit += line.debit_pence ?? 0;
    existing.credit += line.credit_pence ?? 0;
    existing.count += 1;
    totalsMap.set(line.journal_id, existing);
  }

  // Fetch creator names
  const creatorIds = [...new Set(journals.map((j) => j.created_by).filter(Boolean))];
  const nameMap = new Map<string, string>();

  if (creatorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', creatorIds);

    for (const p of profiles ?? []) {
      nameMap.set(p.id, p.full_name ?? '');
    }
  }

  const withTotals: JournalWithTotals[] = journals.map((j) => {
    const t = totalsMap.get(j.id) ?? { debit: 0, credit: 0, count: 0 };
    return {
      ...j,
      total_debit_pence: t.debit,
      total_credit_pence: t.credit,
      line_count: t.count,
      created_by_name: j.created_by ? (nameMap.get(j.created_by) ?? null) : null,
    };
  });

  return { data: withTotals, error: null };
}

/* ------------------------------------------------------------------ */
/*  Create Journal                                                     */
/* ------------------------------------------------------------------ */

export async function createJournal(formData: FormData) {
  await assertWriteAllowed();
  const { orgId, user } = await getActiveOrg();
  const journalDate = formData.get('journal_date') as string;
  const reference = (formData.get('reference') as string)?.trim() || null;
  const memo = (formData.get('memo') as string)?.trim() || null;
  const linesJson = formData.get('lines') as string;

  if (!journalDate) {
    redirect('/journals/new?error=' + encodeURIComponent('Date is required.'));
  }

  // Period lock check
  const locked = await isDateInLockedPeriod(journalDate);
  if (locked) {
    redirect('/journals/new?error=' + encodeURIComponent('Cannot post to a locked financial period.'));
  }

  let lines: LineInput[];
  try {
    lines = JSON.parse(linesJson || '[]');
  } catch {
    redirect('/journals/new?error=' + encodeURIComponent('Invalid line data.'));
  }

  validateLines(lines, '/journals/new');

  const supabase = await createClient();

  const { data: journal, error: journalErr } = await supabase
    .from('journals')
    .insert({
      organisation_id: orgId,
      journal_date: journalDate,
      reference,
      memo,
      source_type: 'manual',
      created_by: user.id,
    })
    .select('id')
    .single();

  if (journalErr || !journal) {
    redirect('/journals/new?error=' + encodeURIComponent(journalErr?.message ?? 'Failed to create journal.'));
  }

  const rows = lines.map((line) => ({
    journal_id: journal.id,
    organisation_id: orgId,
    account_id: line.account_id,
    fund_id: line.fund_id || null,
    supplier_id: line.supplier_id || null,
    description: line.description?.trim() || null,
    debit_pence: toPence(line.debit),
    credit_pence: toPence(line.credit),
  }));

  const { error: linesErr } = await supabase.from('journal_lines').insert(rows);

  if (linesErr) {
    await supabase.from('journals').delete().eq('id', journal.id);
    redirect('/journals/new?error=' + encodeURIComponent(linesErr.message));
  }

  redirect('/journals');
}

/* ------------------------------------------------------------------ */
/*  Update Journal (draft only)                                        */
/* ------------------------------------------------------------------ */

export async function updateJournal(formData: FormData) {
  await assertWriteAllowed();
  const { orgId } = await getActiveOrg();
  const id = formData.get('id') as string;
  const journalDate = formData.get('journal_date') as string;
  const reference = (formData.get('reference') as string)?.trim() || null;
  const memo = (formData.get('memo') as string)?.trim() || null;
  const linesJson = formData.get('lines') as string;

  if (!id || !journalDate) {
    redirect(`/journals/${id ?? ''}?error=` + encodeURIComponent('Journal ID and date are required.'));
  }

  // Period lock check
  const locked = await isDateInLockedPeriod(journalDate);
  if (locked) {
    redirect(`/journals/${id}?error=` + encodeURIComponent('Cannot post to a locked financial period.'));
  }

  let lines: LineInput[];
  try {
    lines = JSON.parse(linesJson || '[]');
  } catch {
    redirect(`/journals/${id}?error=` + encodeURIComponent('Invalid line data.'));
  }

  validateLines(lines, `/journals/${id}`);

  const supabase = await createClient();

  const { error: journalErr } = await supabase
    .from('journals')
    .update({ journal_date: journalDate, reference, memo })
    .eq('id', id);

  if (journalErr) {
    redirect(`/journals/${id}?error=` + encodeURIComponent(journalErr.message));
  }

  const { error: delErr } = await supabase
    .from('journal_lines')
    .delete()
    .eq('journal_id', id);

  if (delErr) {
    redirect(`/journals/${id}?error=` + encodeURIComponent(delErr.message));
  }

  const rows = lines.map((line) => ({
    journal_id: id,
    organisation_id: orgId,
    account_id: line.account_id,
    fund_id: line.fund_id || null,
    supplier_id: line.supplier_id || null,
    description: line.description?.trim() || null,
    debit_pence: toPence(line.debit),
    credit_pence: toPence(line.credit),
  }));

  const { error: insErr } = await supabase.from('journal_lines').insert(rows);

  if (insErr) {
    redirect(`/journals/${id}?error=` + encodeURIComponent(insErr.message));
  }

  redirect('/journals');
}

/* ------------------------------------------------------------------ */
/*  Approve Journal                                                    */
/* ------------------------------------------------------------------ */

export async function approveJournal(formData: FormData) {
  await assertWriteAllowed();
  await getActiveOrg();
  const id = formData.get('id') as string;

  if (!id) redirect('/journals');

  const supabase = await createClient();

  const { error } = await supabase
    .from('journals')
    .update({ status: 'approved' })
    .eq('id', id);

  if (error) {
    redirect(`/journals/${id}?error=` + encodeURIComponent(error.message));
  }

  redirect(`/journals/${id}`);
}

/* ------------------------------------------------------------------ */
/*  Post Journal                                                       */
/* ------------------------------------------------------------------ */

export async function postJournal(formData: FormData) {
  await assertWriteAllowed();
  const { orgId, user } = await getActiveOrg();
  const id = formData.get('id') as string;

  if (!id) redirect('/journals');

  const supabase = await createClient();

  const { error } = await supabase
    .from('journals')
    .update({ status: 'posted' })
    .eq('id', id);

  if (error) {
    redirect(`/journals/${id}?error=` + encodeURIComponent(error.message));
  }

  invalidateOrgReportCache(orgId);

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'post_journal',
    entityType: 'journal',
    entityId: id,
  });

  redirect(`/journals/${id}`);
}

/* ------------------------------------------------------------------ */
/*  Delete Journal (draft only)                                        */
/* ------------------------------------------------------------------ */

export async function deleteJournal(formData: FormData) {
  await assertWriteAllowed();
  await getActiveOrg();
  const id = formData.get('id') as string;

  if (!id) redirect('/journals');

  const supabase = await createClient();

  const { error } = await supabase
    .from('journals')
    .delete()
    .eq('id', id);

  if (error) {
    redirect(`/journals/${id}?error=` + encodeURIComponent(error.message));
  }

  redirect('/journals');
}

/* ------------------------------------------------------------------ */
/*  Reverse Journal                                                    */
/* ------------------------------------------------------------------ */

export async function reverseJournal(
  journalId: string,
): Promise<{ reversalId?: string; error?: string }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'create', 'journals');
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const admin = createAdminClient();

  const { data: journal, error: journalErr } = await admin
    .from('journals')
    .select('id, organisation_id, journal_date, memo, status, reversal_of, reversed_by')
    .eq('id', journalId)
    .eq('organisation_id', orgId)
    .single();

  if (journalErr || !journal) {
    return { error: 'Journal not found.' };
  }

  const reverseCheck = canReverse({
    status: journal.status as string,
    reversed_by: journal.reversed_by as string | null,
    reversal_of: journal.reversal_of as string | null,
  });
  if (!reverseCheck.allowed) {
    return { error: reverseCheck.reason };
  }

  const { data: originalLines, error: linesErr } = await admin
    .from('journal_lines')
    .select('account_id, fund_id, description, debit_pence, credit_pence')
    .eq('journal_id', journalId);

  if (linesErr || !originalLines || originalLines.length === 0) {
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

  const reversalMemo = `Reversal of: ${journal.memo ?? journalId.slice(0, 8)}`;
  const { data: reversalJournal, error: createErr } = await admin
    .from('journals')
    .insert({
      organisation_id: orgId,
      journal_date: new Date().toISOString().split('T')[0],
      memo: reversalMemo,
      status: 'draft',
      created_by: user.id,
      reversal_of: journalId,
    })
    .select('id')
    .single();

  if (createErr || !reversalJournal) {
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
    return { error: insertErr.message };
  }

  const { error: postErr } = await admin
    .from('journals')
    .update({ status: 'posted' })
    .eq('id', reversalJournal.id);

  if (postErr) {
    await admin.from('journal_lines').delete().eq('journal_id', reversalJournal.id);
    await admin.from('journals').delete().eq('id', reversalJournal.id);
    return { error: postErr.message };
  }

  const { error: updateErr } = await admin
    .from('journals')
    .update({ reversed_by: reversalJournal.id })
    .eq('id', journalId);

  if (updateErr) {
    return { error: `Reversal created but failed to link: ${updateErr.message}` };
  }

  invalidateOrgReportCache(orgId);

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'reverse_journal',
    entityType: 'journal',
    entityId: journalId,
    metadata: { reversalId: reversalJournal.id },
  });

  return { reversalId: reversalJournal.id };
}
