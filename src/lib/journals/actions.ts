'use server';

import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { canReverse } from '@/lib/journals/reversal';
import { executePostedJournalReversal } from '@/lib/journals/execute-posted-reversal';
import { invalidateOrgReportCache } from '@/lib/cache';
import { logAuditEvent } from '@/lib/audit';
import { getAppEnv } from '@/lib/env';
import { assertWriteAllowed } from '@/lib/demo';
import { logServerFailure } from '@/lib/monitoring';
import { isDateInLockedPeriod } from '@/lib/periods/actions';
import type { JournalWithTotals } from './types';
import { getRequireFundOnJournalLines } from '@/lib/journals/require-fund-setting';

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

interface JournalDependencyPreview {
  total: number;
  counts: Record<string, number>;
  canDelete: boolean;
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
  options: { requireFundOnLines: boolean },
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
    if (options.requireFundOnLines && !lines[i].fund_id) {
      redirect(
        redirectUrl + '?error=' + encodeURIComponent(`Line ${i + 1} is missing a fund. Your organisation requires a fund on every journal line.`),
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

async function redirectIfJournalLinesViolateFundPolicy(
  orgId: string,
  journalId: string,
  redirectUrl: string,
): Promise<void> {
  const requireFundOnLines = await getRequireFundOnJournalLines(orgId);
  if (!requireFundOnLines) return;

  const supabase = await createClient();
  const { data: jl, error } = await supabase
    .from('journal_lines')
    .select('fund_id, debit_pence, credit_pence')
    .eq('journal_id', journalId);

  if (error) {
    redirect(redirectUrl + '?error=' + encodeURIComponent(error.message));
  }

  for (let i = 0; i < (jl?.length ?? 0); i++) {
    const row = jl![i];
    const hasAmt = (row.debit_pence ?? 0) > 0 || (row.credit_pence ?? 0) > 0;
    if (hasAmt && !row.fund_id) {
      redirect(
        redirectUrl +
          '?error=' +
          encodeURIComponent(
            `Line ${i + 1} is missing a fund. Your organisation requires a fund on every journal line. Assign funds before continuing.`,
          ),
      );
    }
  }
}

async function logJournalApprovalEvent(params: {
  orgId: string;
  journalId: string;
  action: 'approved' | 'posted' | 'rejected';
  performedBy: string;
  notes?: string;
}) {
  const supabase = await createClient();
  await supabase.from('approval_events').insert({
    organisation_id: params.orgId,
    entity_type: 'journal',
    entity_id: params.journalId,
    action: params.action,
    performed_by: params.performedBy,
    notes: params.notes ?? null,
  });
}

function normalizeDependencyPreview(payload: unknown): JournalDependencyPreview {
  const raw = (payload ?? {}) as Partial<JournalDependencyPreview>;
  const counts = raw.counts && typeof raw.counts === 'object' && !Array.isArray(raw.counts)
    ? Object.fromEntries(
        Object.entries(raw.counts as Record<string, unknown>).map(([key, value]) => [
          key,
          Number(value ?? 0),
        ]),
      )
    : {};
  return {
    total: Number(raw.total ?? 0),
    counts,
    canDelete: Boolean(raw.canDelete),
  };
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

export async function updateJournalAttachment(
  journalId: string,
  attachmentUrl: string | null,
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { role } = await getActiveOrg();

  try {
    assertCanPerform(role, 'update', 'journals');
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: journal } = await supabase
    .from('journals')
    .select('status')
    .eq('id', journalId)
    .single();

  if (!journal) return { success: false, error: 'Journal not found.' };
  if (journal.status === 'posted') {
    return { success: false, error: 'Cannot change evidence on a posted journal.' };
  }

  const { error } = await admin
    .from('journals')
    .update({ attachment_url: attachmentUrl })
    .eq('id', journalId);

  return { success: !error, error: error?.message ?? null };
}

/* ------------------------------------------------------------------ */
/*  Create Journal                                                     */
/* ------------------------------------------------------------------ */

export async function createJournal(formData: FormData) {
  await assertWriteAllowed();
  const { orgId, user, role } = await getActiveOrg();
  const journalDate = formData.get('journal_date') as string;
  const reference = (formData.get('reference') as string)?.trim() || null;
  const memo = (formData.get('memo') as string)?.trim() || null;
  const attachmentUrl = (formData.get('attachment_url') as string)?.trim() || null;
  const linesJson = formData.get('lines') as string;

  try {
    assertCanPerform(role, 'create', 'journals');
  } catch (e) {
    redirect('/journals/new?error=' + encodeURIComponent(e instanceof PermissionError ? e.message : 'Permission denied.'));
  }

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

  const requireFundOnLines = await getRequireFundOnJournalLines(orgId);
  validateLines(lines, '/journals/new', { requireFundOnLines });

  const supabase = await createClient();

  const { data: journal, error: journalErr } = await supabase
    .from('journals')
    .insert({
      organisation_id: orgId,
      journal_date: journalDate,
      reference,
      memo,
      attachment_url: attachmentUrl,
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

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'draft_journal_created',
    entityType: 'journal',
    entityId: journal.id,
    metadata: { journalDate, lineCount: lines.length },
  });

  redirect('/journals');
}

/* ------------------------------------------------------------------ */
/*  Update Journal (draft only)                                        */
/* ------------------------------------------------------------------ */

export async function updateJournal(formData: FormData) {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  const id = formData.get('id') as string;
  const journalDate = formData.get('journal_date') as string;
  const reference = (formData.get('reference') as string)?.trim() || null;
  const memo = (formData.get('memo') as string)?.trim() || null;
  const attachmentUrl = (formData.get('attachment_url') as string)?.trim() || null;
  const linesJson = formData.get('lines') as string;

  try {
    assertCanPerform(role, 'update', 'journals');
  } catch (e) {
    redirect(`/journals/${id ?? ''}?error=` + encodeURIComponent(e instanceof PermissionError ? e.message : 'Permission denied.'));
  }

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

  const requireFundOnLines = await getRequireFundOnJournalLines(orgId);
  validateLines(lines, `/journals/${id}`, { requireFundOnLines });

  const supabase = await createClient();

  const { data: existingJournal } = await supabase
    .from('journals')
    .select('id, organisation_id, journal_date, status')
    .eq('id', id)
    .eq('organisation_id', orgId)
    .single();

  if (!existingJournal) {
    redirect(`/journals/${id}?error=` + encodeURIComponent('Journal not found.'));
  }

  if (existingJournal.status !== 'draft') {
    redirect(
      `/journals/${id}?error=` +
        encodeURIComponent('Posted journal lines cannot be edited directly. Use Amend Journal to create a correction.'),
    );
  }

  const existingLocked = await isDateInLockedPeriod(existingJournal.journal_date);
  if (existingLocked) {
    redirect(`/journals/${id}?error=` + encodeURIComponent('Cannot edit a journal in a locked financial period.'));
  }

  const { error: journalErr } = await supabase
    .from('journals')
    .update({ journal_date: journalDate, reference, memo, attachment_url: attachmentUrl })
    .eq('id', id)
    .eq('organisation_id', orgId)
    .eq('status', 'draft');

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

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'draft_journal_edited',
    entityType: 'journal',
    entityId: id,
    metadata: {
      journalDate,
      previousDate: existingJournal.journal_date,
      lineCount: lines.length,
    },
  });

  redirect('/journals');
}

/* ------------------------------------------------------------------ */
/*  Approve Journal                                                    */
/* ------------------------------------------------------------------ */

export async function approveJournal(formData: FormData) {
  await assertWriteAllowed();
  const { orgId, user, role } = await getActiveOrg();
  const id = formData.get('id') as string;

  if (!id) redirect('/journals');

  try {
    assertCanPerform(role, 'approve', 'journals');
  } catch (e) {
    redirect(`/journals/${id}?error=` + encodeURIComponent(e instanceof PermissionError ? e.message : 'Permission denied.'));
  }

  const supabase = await createClient();

  const { data: journal } = await supabase
    .from('journals')
    .select('journal_date, status')
    .eq('id', id)
    .single();

  if (!journal) {
    redirect(`/journals/${id}?error=` + encodeURIComponent('Journal not found.'));
  }

  if (journal.status !== 'draft') {
    redirect(`/journals/${id}?error=` + encodeURIComponent('Only draft journals can be approved.'));
  }

  const locked = await isDateInLockedPeriod(journal.journal_date);
  if (locked) {
    redirect(`/journals/${id}?error=` + encodeURIComponent('Cannot approve: journal date falls in a locked financial period.'));
  }

  const admin = createAdminClient();
  const { data: dependencyPayload, error: dependencyErr } = await admin.rpc(
    'get_journal_delete_dependency_preview',
    { target_journal_id: id },
  );

  if (dependencyErr) {
    redirect(`/journals/${id}?error=` + encodeURIComponent(dependencyErr.message));
  }

  const dependencyPreview = normalizeDependencyPreview(dependencyPayload);
  if (!dependencyPreview.canDelete) {
    redirect(
      `/journals/${id}?error=` +
        encodeURIComponent('This journal has linked reconciliation or source records and cannot be deleted. Void or correct it instead.'),
    );
  }

  await redirectIfJournalLinesViolateFundPolicy(orgId, id, `/journals/${id}`);

  const { error } = await supabase
    .from('journals')
    .update({
      status: 'approved',
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    await logServerFailure({
      area: 'journals',
      event: 'approve_journal_failed',
      error,
      metadata: { journalId: id, orgId, userId: user.id },
    });
    redirect(`/journals/${id}?error=` + encodeURIComponent(error.message));
  }

  await logJournalApprovalEvent({
    orgId,
    journalId: id,
    action: 'approved',
    performedBy: user.id,
  });

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'approve_journal',
    entityType: 'journal',
    entityId: id,
  });

  redirect(`/journals/${id}`);
}

/* ------------------------------------------------------------------ */
/*  Post Journal                                                       */
/* ------------------------------------------------------------------ */

export async function postJournal(formData: FormData) {
  await assertWriteAllowed();
  const { orgId, user, role } = await getActiveOrg();
  const id = formData.get('id') as string;

  if (!id) redirect('/journals');

  try {
    assertCanPerform(role, 'post', 'journals');
  } catch (e) {
    redirect(`/journals/${id}?error=` + encodeURIComponent(e instanceof PermissionError ? e.message : 'Permission denied.'));
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: journal } = await supabase
    .from('journals')
    .select('journal_date, status')
    .eq('id', id)
    .single();

  if (!journal) {
    redirect(`/journals/${id}?error=` + encodeURIComponent('Journal not found.'));
  }

  if (journal.status !== 'approved') {
    redirect(`/journals/${id}?error=` + encodeURIComponent('Only approved journals can be posted.'));
  }

  const locked = await isDateInLockedPeriod(journal.journal_date);
  if (locked) {
    redirect(`/journals/${id}?error=` + encodeURIComponent('Cannot post to a locked financial period.'));
  }

  await redirectIfJournalLinesViolateFundPolicy(orgId, id, `/journals/${id}`);

  const { error } = await admin
    .from('journals')
    .update({ status: 'posted', posted_at: new Date().toISOString(), posted_by: user.id })
    .eq('id', id);

  if (error) {
    await logServerFailure({
      area: 'journals',
      event: 'post_journal_failed',
      error,
      metadata: { journalId: id, orgId, userId: user.id },
    });
    redirect(`/journals/${id}?error=` + encodeURIComponent(error.message));
  }

  invalidateOrgReportCache(orgId);

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'post_journal',
    entityType: 'journal',
    entityId: id,
    metadata: { environment: getAppEnv() },
  });

  await logJournalApprovalEvent({
    orgId,
    journalId: id,
    action: 'posted',
    performedBy: user.id,
  });

  redirect(`/journals/${id}`);
}

/* ------------------------------------------------------------------ */
/*  Delete Journal (draft only)                                        */
/* ------------------------------------------------------------------ */

export async function deleteJournal(formData: FormData) {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  const id = formData.get('id') as string;

  if (!id) redirect('/journals');

  try {
    assertCanPerform(role, 'delete', 'journals');
  } catch (e) {
    redirect(`/journals/${id}?error=` + encodeURIComponent(e instanceof PermissionError ? e.message : 'Permission denied.'));
  }

  const supabase = await createClient();
  const { data: journal } = await supabase
    .from('journals')
    .select('id, status, journal_date, posted_at')
    .eq('id', id)
    .eq('organisation_id', orgId)
    .single();

  if (!journal) {
    redirect('/journals?error=' + encodeURIComponent('Journal not found.'));
  }

  if (journal.status !== 'draft') {
    redirect(
      `/journals/${id}?error=` +
        encodeURIComponent('Posted or approved journals cannot be deleted. Create a reversal instead.'),
    );
  }

  const locked = await isDateInLockedPeriod(journal.journal_date);
  if (locked) {
    redirect(
      `/journals/${id}?error=` +
        encodeURIComponent('Cannot delete a journal in a locked financial period.'),
    );
  }

  const admin = createAdminClient();
  const { data: dependencyPayload, error: dependencyErr } = await admin.rpc(
    'get_journal_delete_dependency_preview',
    { target_journal_id: id },
  );

  if (dependencyErr) {
    redirect(`/journals/${id}?error=` + encodeURIComponent(dependencyErr.message));
  }

  const dependencyPreview = normalizeDependencyPreview(dependencyPayload);
  if (!dependencyPreview.canDelete) {
    redirect(
      `/journals/${id}?error=` +
        encodeURIComponent('This journal has linked reconciliation or source records and cannot be deleted. Void or correct it instead.'),
    );
  }

  const { error } = await supabase
    .from('journals')
    .delete()
    .eq('id', id)
    .eq('organisation_id', orgId)
    .eq('status', 'draft');

  if (error) {
    redirect(`/journals/${id}?error=` + encodeURIComponent(error.message));
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'journal_delete',
    entityType: 'journal',
    entityId: id,
    metadata: { dependencies: dependencyPreview.counts },
  });

  redirect('/journals');
}

/* ------------------------------------------------------------------ */
/*  Reverse Journal                                                    */
/* ------------------------------------------------------------------ */

export async function reverseJournal(
  journalId: string,
  reason?: string,
  reversalDate?: string,
): Promise<{ reversalId?: string; error?: string }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'create', 'journals');
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const admin = createAdminClient();

  if (!reason?.trim()) {
    return { error: 'A reversal reason is required.' };
  }

  if (!reversalDate) {
    return { error: 'A reversal date is required.' };
  }

  const exec = await executePostedJournalReversal({
    admin,
    orgId,
    userId: user.id,
    journalId,
    reason: reason.trim(),
    reversalDate,
  });

  if ('error' in exec) {
    return { error: exec.error };
  }

  invalidateOrgReportCache(orgId);

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'reverse_journal',
    entityType: 'journal',
    entityId: journalId,
    metadata: { reversalId: exec.reversalId, reason: reason.trim(), reversalDate },
  });

  return { reversalId: exec.reversalId };
}

export async function amendJournal(
  journalId: string,
  reason: string,
  reversalDate: string,
): Promise<{ replacementId?: string; reversalId?: string; error?: string }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'create', 'journals');
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  if (!reason.trim()) {
    return { error: 'An amendment reason is required.' };
  }

  const admin = createAdminClient();
  const { data: original, error: originalErr } = await admin
    .from('journals')
    .select('id, organisation_id, journal_date, reference, memo, status, reversed_by, reversal_of')
    .eq('id', journalId)
    .eq('organisation_id', orgId)
    .single();

  if (originalErr || !original) {
    return { error: 'Journal not found.' };
  }

  const reverseCheck = canReverse({
    status: original.status as string,
    reversed_by: original.reversed_by as string | null,
    reversal_of: original.reversal_of as string | null,
  });
  if (!reverseCheck.allowed) {
    return { error: reverseCheck.reason };
  }

  const { data: originalLines, error: linesErr } = await admin
    .from('journal_lines')
    .select('account_id, fund_id, supplier_id, description, debit_pence, credit_pence')
    .eq('journal_id', journalId)
    .order('created_at');

  if (linesErr || !originalLines || originalLines.length === 0) {
    return { error: linesErr?.message ?? 'Could not fetch original journal lines.' };
  }

  const reversal = await reverseJournal(journalId, reason, reversalDate);
  if (reversal.error || !reversal.reversalId) {
    return { error: reversal.error ?? 'Could not create reversal journal.' };
  }

  const { data: replacement, error: replacementErr } = await admin
    .from('journals')
    .insert({
      organisation_id: orgId,
      journal_date: reversalDate,
      reference: original.reference ? `COR-${original.reference}` : null,
      memo: `Correction of: ${original.memo ?? journalId.slice(0, 8)}`,
      status: 'draft',
      created_by: user.id,
      original_journal_id: journalId,
      reversal_journal_id: reversal.reversalId,
      amendment_reason: reason.trim(),
      amended_by: user.id,
      amended_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (replacementErr || !replacement) {
    return {
      reversalId: reversal.reversalId,
      error: replacementErr?.message ?? 'Reversal created but correction draft could not be created.',
    };
  }

  const replacementLines = originalLines.map((line) => ({
    journal_id: replacement.id,
    organisation_id: orgId,
    account_id: line.account_id,
    fund_id: line.fund_id,
    supplier_id: line.supplier_id ?? null,
    description: line.description,
    debit_pence: line.debit_pence,
    credit_pence: line.credit_pence,
  }));

  const { error: replacementLinesErr } = await admin.from('journal_lines').insert(replacementLines);
  if (replacementLinesErr) {
    await admin.from('journals').delete().eq('id', replacement.id);
    return {
      reversalId: reversal.reversalId,
      error: replacementLinesErr.message,
    };
  }

  await admin
    .from('journals')
    .update({
      replacement_journal_id: replacement.id,
      amended_by: user.id,
      amended_at: new Date().toISOString(),
      amendment_reason: reason.trim(),
    })
    .eq('id', journalId);

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'journal_amended',
    entityType: 'journal',
    entityId: journalId,
    metadata: {
      reversalId: reversal.reversalId,
      replacementId: replacement.id,
      reason: reason.trim(),
      reversalDate,
    },
  });

  invalidateOrgReportCache(orgId);
  return { replacementId: replacement.id, reversalId: reversal.reversalId };
}
