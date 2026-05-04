'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createHash } from 'node:crypto';
import { assertWriteAllowed } from '@/lib/demo';
import { logAuditEvent } from '@/lib/audit';
import { getActiveOrg } from '@/lib/org';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { FINANCIAL_EVIDENCE_BUCKET, buildEvidenceAccessPath } from '@/lib/evidence/config';
import { logServerFailure } from '@/lib/monitoring';
import { enforcePortalPermissionForContext } from '@/lib/portal-permissions';
import { buildMatchSuggestion } from './matching';
import { postManualTransactionToLedger } from './posting';
import {
  defaultRequiresBankMatch,
  manualTransactionSchema,
  transitionSchema,
  updateManualTransactionSchema,
  validateFundRequirements,
  validateLineTotals,
} from './validation';
import { assertTransition, isEditableStatus, nextStatusAfterApproval } from './lifecycle';
import { scoreDuplicateCandidate, sortDuplicateCandidates } from './duplicates';
import type {
  DuplicateCandidate,
  ManualTransactionInput,
  ManualTransactionLineRow,
  ManualTransactionRow,
  MatchSuggestion,
  TransactionAttachmentRow,
  TransactionListRow,
  TransactionMatchRow,
  TransactionStatus,
  TransactionSummary,
} from './types';

type ActionResult<T = null> = { data: T | null; error: string | null; warning?: DuplicateCandidate[] };
type ProfileLookupRow = { id: string; full_name: string | null };
type TransactionLineLookupRow = {
  manual_transaction_id: string;
  funds?: { name: string | null } | { name: string | null }[] | null;
  accounts?: { code: string | null; name: string | null } | { code: string | null; name: string | null }[] | null;
};

function penceFromPounds(value: FormDataEntryValue | null): number {
  const raw = String(value ?? '0').replace(/[£,]/g, '');
  return Math.round((Number.parseFloat(raw || '0') || 0) * 100);
}

function clean(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function permissionError(error: unknown): string {
  return error instanceof PermissionError ? error.message : 'Permission denied.';
}

function slugifyFileName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function logTransactionEvent(params: {
  orgId: string;
  transactionId: string;
  action: string;
  performedBy: string;
  notes?: string | null;
}) {
  const supabase = await createClient();
  await supabase.from('approval_events').insert({
    organisation_id: params.orgId,
    entity_type: 'manual_transaction',
    entity_id: params.transactionId,
    action: params.action,
    performed_by: params.performedBy,
    notes: params.notes ?? null,
  });
}

async function assertTransactionPermission(action: 'read' | 'create' | 'update' | 'delete' | 'approve' | 'post') {
  const ctx = await getActiveOrg();
  assertCanPerform(ctx.role, action, 'transactions');
  await enforcePortalPermissionForContext(
    ctx,
    'expenses',
    action === 'read' ? 'view' : action === 'create' ? 'create' : action === 'approve' || action === 'post' ? 'approve' : action === 'delete' ? 'delete_own' : 'edit_own',
  );
  return ctx;
}

function parseInputFromForm(formData: FormData): ManualTransactionInput {
  const rawLines = String(formData.get('lines') ?? '[]');
  const lines = JSON.parse(rawLines).map((line: Record<string, unknown>) => ({
    fund_id: line.fund_id ? String(line.fund_id) : null,
    account_id: String(line.account_id ?? ''),
    income_stream_id: line.income_stream_id ? String(line.income_stream_id) : null,
    description: line.description ? String(line.description) : null,
    amount_pence: typeof line.amount_pence === 'number'
      ? line.amount_pence
      : penceFromPounds(String(line.amount ?? '0')),
    direction: line.direction === 'in' ? 'in' : 'out',
  }));

  const type = String(formData.get('type') ?? 'expense') as ManualTransactionInput['type'];
  return {
    type,
    transaction_date: String(formData.get('transaction_date') ?? ''),
    amount_pence: penceFromPounds(formData.get('amount')),
    description: String(formData.get('description') ?? '').trim(),
    payee_payer_name: clean(formData.get('payee_payer_name')),
    reference: clean(formData.get('reference')),
    payment_method: clean(formData.get('payment_method')),
    expected_bank_account_id: clean(formData.get('expected_bank_account_id')),
    requires_bank_match: formData.get('requires_bank_match') == null
      ? defaultRequiresBankMatch(type)
      : formData.get('requires_bank_match') === 'on' || formData.get('requires_bank_match') === 'true',
    duplicate_override_reason: clean(formData.get('duplicate_override_reason')),
    lines,
  };
}

async function validateInput(input: ManualTransactionInput): Promise<{ ok: true; value: ManualTransactionInput } | { ok: false; error: string }> {
  const parsed = manualTransactionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid transaction.' };

  const totalError = validateLineTotals(parsed.data);
  if (totalError) return { ok: false, error: totalError };

  const fundError = validateFundRequirements(parsed.data);
  if (fundError) return { ok: false, error: fundError };

  return {
    ok: true,
    value: {
      ...parsed.data,
      requires_bank_match: parsed.data.requires_bank_match ?? defaultRequiresBankMatch(parsed.data.type),
    },
  };
}

async function findDuplicateCandidates(orgId: string, input: ManualTransactionInput): Promise<DuplicateCandidate[]> {
  const supabase = await createClient();
  const date = new Date(input.transaction_date + 'T00:00:00Z');
  const from = new Date(date.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = new Date(date.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data } = await supabase
    .from('manual_transactions')
    .select('*')
    .eq('organisation_id', orgId)
    .eq('type', input.type)
    .gte('transaction_date', from)
    .lte('transaction_date', to)
    .neq('status', 'voided')
    .limit(30);

  return sortDuplicateCandidates(
    ((data ?? []) as ManualTransactionRow[])
      .map((row) => scoreDuplicateCandidate(input, row))
      .filter((row): row is DuplicateCandidate => row != null),
  );
}

async function replaceTransactionLines(
  txId: string,
  orgId: string,
  input: ManualTransactionInput,
): Promise<string | null> {
  const supabase = await createClient();

  const { error: deleteErr } = await supabase
    .from('manual_transaction_lines')
    .delete()
    .eq('manual_transaction_id', txId)
    .eq('organisation_id', orgId);

  if (deleteErr) return deleteErr.message;

  const rows = input.lines.map((line, index) => ({
    organisation_id: orgId,
    manual_transaction_id: txId,
    fund_id: line.fund_id ?? null,
    account_id: line.account_id,
    income_stream_id: line.income_stream_id ?? null,
    description: line.description ?? null,
    amount_pence: line.amount_pence,
    direction: line.direction,
    line_order: index + 1,
  }));

  const { error } = await supabase.from('manual_transaction_lines').insert(rows);
  return error?.message ?? null;
}

export async function createManualTransaction(input: ManualTransactionInput): Promise<ActionResult<{ id: string }>> {
  await assertWriteAllowed();
  let ctx;
  try {
    ctx = await assertTransactionPermission('create');
  } catch (error) {
    return { data: null, error: permissionError(error) };
  }

  const valid = await validateInput(input);
  if (!valid.ok) return { data: null, error: valid.error };

  const duplicates = await findDuplicateCandidates(ctx.orgId, valid.value);
  if (duplicates.length > 0 && !valid.value.duplicate_override_reason) {
    return { data: null, error: null, warning: duplicates };
  }

  const supabase = await createClient();
  const { data: tx, error } = await supabase
    .from('manual_transactions')
    .insert({
      organisation_id: ctx.orgId,
      type: valid.value.type,
      transaction_date: valid.value.transaction_date,
      amount_pence: valid.value.amount_pence,
      description: valid.value.description,
      payee_payer_name: valid.value.payee_payer_name ?? null,
      reference: valid.value.reference ?? null,
      payment_method: valid.value.payment_method ?? null,
      expected_bank_account_id: valid.value.expected_bank_account_id ?? null,
      status: 'draft',
      approval_status: null,
      requires_bank_match: valid.value.requires_bank_match ?? defaultRequiresBankMatch(valid.value.type),
      duplicate_override_reason: valid.value.duplicate_override_reason ?? null,
      created_by: ctx.user.id,
    })
    .select('id')
    .single();

  if (error || !tx) return { data: null, error: error?.message ?? 'Failed to create transaction.' };

  const lineError = await replaceTransactionLines(tx.id, ctx.orgId, valid.value);
  if (lineError) {
    await supabase.from('manual_transactions').delete().eq('id', tx.id);
    return { data: null, error: lineError };
  }

  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'manual_transaction_create',
    entityType: 'manual_transaction',
    entityId: tx.id,
  });

  revalidatePath('/transactions');
  return { data: { id: tx.id }, error: null };
}

export async function updateManualTransaction(input: ManualTransactionInput & { id: string }): Promise<ActionResult<{ id: string }>> {
  await assertWriteAllowed();
  let ctx;
  try {
    ctx = await assertTransactionPermission('update');
  } catch (error) {
    return { data: null, error: permissionError(error) };
  }

  const parsed = updateManualTransactionSchema.safeParse(input);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? 'Invalid transaction.' };

  const valid = await validateInput(parsed.data);
  if (!valid.ok) return { data: null, error: valid.error };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('manual_transactions')
    .select('status, posted_journal_id')
    .eq('id', input.id)
    .eq('organisation_id', ctx.orgId)
    .maybeSingle();

  if (!existing) return { data: null, error: 'Transaction not found.' };
  if (existing.posted_journal_id || !isEditableStatus(existing.status as TransactionStatus)) {
    return { data: null, error: 'Only draft, submitted, or rejected transactions can be edited.' };
  }

  const { error } = await supabase
    .from('manual_transactions')
    .update({
      type: valid.value.type,
      transaction_date: valid.value.transaction_date,
      amount_pence: valid.value.amount_pence,
      description: valid.value.description,
      payee_payer_name: valid.value.payee_payer_name ?? null,
      reference: valid.value.reference ?? null,
      payment_method: valid.value.payment_method ?? null,
      expected_bank_account_id: valid.value.expected_bank_account_id ?? null,
      requires_bank_match: valid.value.requires_bank_match ?? defaultRequiresBankMatch(valid.value.type),
      duplicate_override_reason: valid.value.duplicate_override_reason ?? null,
      status: existing.status === 'rejected' ? 'draft' : existing.status,
    })
    .eq('id', input.id)
    .eq('organisation_id', ctx.orgId);

  if (error) return { data: null, error: error.message };

  const lineError = await replaceTransactionLines(input.id, ctx.orgId, valid.value);
  if (lineError) return { data: null, error: lineError };

  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'manual_transaction_update',
    entityType: 'manual_transaction',
    entityId: input.id,
  });

  revalidatePath('/transactions');
  revalidatePath(`/transactions/${input.id}`);
  return { data: { id: input.id }, error: null };
}

export async function createManualTransactionAction(formData: FormData) {
  let input: ManualTransactionInput;
  try {
    input = parseInputFromForm(formData);
  } catch {
    redirect('/transactions/new?error=' + encodeURIComponent('Invalid line data.'));
  }

  const result = await createManualTransaction(input);
  if (result.warning?.length) {
    const warning = encodeURIComponent(result.warning.map((d) => `${d.description} (${d.reasons.join(', ')})`).join('; '));
    redirect('/transactions/new?duplicate=' + warning);
  }
  if (result.error || !result.data) redirect('/transactions/new?error=' + encodeURIComponent(result.error ?? 'Failed to create transaction.'));
  redirect(`/transactions/${result.data.id}`);
}

export async function updateManualTransactionAction(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  let input: ManualTransactionInput;
  try {
    input = parseInputFromForm(formData);
  } catch {
    redirect(`/transactions/${id}?error=` + encodeURIComponent('Invalid line data.'));
  }
  const result = await updateManualTransaction({ ...input, id });
  if (result.error || !result.data) redirect(`/transactions/${id}?error=` + encodeURIComponent(result.error ?? 'Failed to update transaction.'));
  redirect(`/transactions/${id}`);
}

async function transitionTransaction(
  id: string,
  toStatus: TransactionStatus,
  options?: { reason?: string | null },
): Promise<ActionResult<{ id: string }>> {
  await assertWriteAllowed();
  const action = toStatus === 'approved' ? 'approve' : toStatus === 'posted' ? 'post' : 'update';
  let ctx;
  try {
    ctx = await assertTransactionPermission(action);
  } catch (error) {
    return { data: null, error: permissionError(error) };
  }

  const supabase = await createClient();
  const { data: tx } = await supabase
    .from('manual_transactions')
    .select('*')
    .eq('id', id)
    .eq('organisation_id', ctx.orgId)
    .maybeSingle();

  if (!tx) return { data: null, error: 'Transaction not found.' };
  const transaction = tx as ManualTransactionRow;
  const transitionError = assertTransition(transaction.status, toStatus);
  if (transitionError) return { data: null, error: transitionError };

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: toStatus };
  if (toStatus === 'submitted') patch.approval_status = 'pending';
  if (toStatus === 'approved') {
    patch.approval_status = 'approved';
    patch.approved_by = ctx.user.id;
    patch.approved_at = now;
    patch.status = nextStatusAfterApproval(transaction.type, transaction.requires_bank_match);
  }
  if (toStatus === 'rejected') {
    patch.approval_status = 'rejected';
  }
  if (toStatus === 'voided') {
    patch.voided_at = now;
    patch.void_reason = options?.reason ?? null;
  }

  const { error } = await supabase
    .from('manual_transactions')
    .update(patch)
    .eq('id', id)
    .eq('organisation_id', ctx.orgId);

  if (error) return { data: null, error: error.message };

  await logTransactionEvent({
    orgId: ctx.orgId,
    transactionId: id,
    action: toStatus,
    performedBy: ctx.user.id,
    notes: options?.reason,
  });

  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: `manual_transaction_${toStatus}`,
    entityType: 'manual_transaction',
    entityId: id,
    metadata: options?.reason ? { reason: options.reason } : undefined,
  });

  revalidatePath('/transactions');
  revalidatePath(`/transactions/${id}`);
  return { data: { id }, error: null };
}

export async function submitTransactionAction(formData: FormData) {
  const parsed = transitionSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) redirect('/transactions');
  const result = await transitionTransaction(parsed.data.id, 'submitted');
  if (result.error) redirect(`/transactions/${parsed.data.id}?error=` + encodeURIComponent(result.error));
  redirect(`/transactions/${parsed.data.id}`);
}

export async function approveTransactionAction(formData: FormData) {
  const parsed = transitionSchema.safeParse({ id: formData.get('id') });
  if (!parsed.success) redirect('/transactions');
  const result = await transitionTransaction(parsed.data.id, 'approved');
  if (result.error) redirect(`/transactions/${parsed.data.id}?error=` + encodeURIComponent(result.error));
  redirect(`/transactions/${parsed.data.id}`);
}

export async function rejectTransactionAction(formData: FormData) {
  const parsed = transitionSchema.safeParse({ id: formData.get('id'), reason: formData.get('reason') ?? undefined });
  if (!parsed.success) redirect('/transactions');
  const result = await transitionTransaction(parsed.data.id, 'rejected', { reason: parsed.data.reason });
  if (result.error) redirect(`/transactions/${parsed.data.id}?error=` + encodeURIComponent(result.error));
  redirect(`/transactions/${parsed.data.id}`);
}

export async function voidTransactionAction(formData: FormData) {
  const parsed = transitionSchema.safeParse({ id: formData.get('id'), reason: formData.get('reason') ?? undefined });
  if (!parsed.success) redirect('/transactions');
  const result = await transitionTransaction(parsed.data.id, 'voided', { reason: parsed.data.reason });
  if (result.error) redirect(`/transactions/${parsed.data.id}?error=` + encodeURIComponent(result.error));
  redirect('/transactions');
}

export async function postTransactionAction(formData: FormData) {
  await assertWriteAllowed();
  const id = String(formData.get('id') ?? '');
  let ctx;
  try {
    ctx = await assertTransactionPermission('post');
  } catch (error) {
    redirect(`/transactions/${id}?error=` + encodeURIComponent(permissionError(error)));
  }

  const result = await postManualTransactionToLedger({ transactionId: id, orgId: ctx.orgId, userId: ctx.user.id });
  if (result.error) redirect(`/transactions/${id}?error=` + encodeURIComponent(result.error));

  await logTransactionEvent({
    orgId: ctx.orgId,
    transactionId: id,
    action: 'posted',
    performedBy: ctx.user.id,
  });

  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'manual_transaction_post',
    entityType: 'manual_transaction',
    entityId: id,
    metadata: { journalId: result.journalId },
  });

  redirect(`/transactions/${id}`);
}

export async function getTransactionList(options?: {
  status?: string;
  type?: string;
  page?: number;
  pageSize?: number;
  missingReceipt?: boolean;
}): Promise<{ data: { rows: TransactionListRow[]; total: number; summary: TransactionSummary }; error: string | null }> {
  const ctx = await getActiveOrg();
  const { orgId } = ctx;
  await enforcePortalPermissionForContext(ctx, 'expenses', 'view');
  const supabase = await createClient();
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, options?.pageSize ?? 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('manual_transactions')
    .select('*', { count: 'exact' })
    .eq('organisation_id', orgId)
    .order('transaction_date', { ascending: false })
    .range(from, to);

  if (options?.status && options.status !== 'all') query = query.eq('status', options.status);
  if (options?.type && options.type !== 'all') query = query.eq('type', options.type);

  const { data: txs, error, count } = await query;
  if (error) return { data: { rows: [], total: 0, summary: await getTransactionSummary(orgId) }, error: error.message };

  const ids = (txs ?? []).map((tx) => tx.id as string);
  const [linesRes, attachmentRes, matchRes, profileRes] = await Promise.all([
    ids.length ? supabase.from('manual_transaction_lines').select('manual_transaction_id, fund_id, account_id, funds(name), accounts(code,name)').in('manual_transaction_id', ids) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from('transaction_attachments').select('manual_transaction_id').in('manual_transaction_id', ids) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from('transaction_matches').select('manual_transaction_id').in('manual_transaction_id', ids) : Promise.resolve({ data: [] }),
    txs?.length ? supabase.from('profiles').select('id, full_name').in('id', [...new Set((txs ?? []).map((tx) => tx.created_by).filter(Boolean) as string[])]) : Promise.resolve({ data: [] }),
  ]);

  const profileMap = new Map((profileRes.data ?? []).map((profile) => {
    const typedProfile = profile as ProfileLookupRow;
    return [typedProfile.id, typedProfile.full_name];
  }));
  const lineMap = new Map<string, { funds: Set<string>; accounts: Set<string>; count: number }>();
  for (const rawLine of linesRes.data ?? []) {
    const line = rawLine as TransactionLineLookupRow;
    const id = line.manual_transaction_id;
    const entry = lineMap.get(id) ?? { funds: new Set<string>(), accounts: new Set<string>(), count: 0 };
    const fund = Array.isArray(line.funds) ? line.funds[0] : line.funds;
    const account = Array.isArray(line.accounts) ? line.accounts[0] : line.accounts;
    if (fund?.name) entry.funds.add(fund.name);
    if (account?.name) entry.accounts.add(`${account.code} ${account.name}`);
    entry.count += 1;
    lineMap.set(id, entry);
  }

  const attachmentCounts = new Map<string, number>();
  for (const row of attachmentRes.data ?? []) attachmentCounts.set(row.manual_transaction_id, (attachmentCounts.get(row.manual_transaction_id) ?? 0) + 1);
  const matchCounts = new Map<string, number>();
  for (const row of matchRes.data ?? []) matchCounts.set(row.manual_transaction_id, (matchCounts.get(row.manual_transaction_id) ?? 0) + 1);

  const rows = ((txs ?? []) as ManualTransactionRow[])
    .map((tx) => {
      const lines = lineMap.get(tx.id) ?? { funds: new Set<string>(), accounts: new Set<string>(), count: 0 };
      return {
        ...tx,
        created_by_name: tx.created_by ? profileMap.get(tx.created_by) ?? null : null,
        line_count: lines.count,
        attachment_count: attachmentCounts.get(tx.id) ?? 0,
        match_count: matchCounts.get(tx.id) ?? 0,
        fund_names: [...lines.funds],
        account_names: [...lines.accounts],
      };
    })
    .filter((row) => !options?.missingReceipt || row.attachment_count === 0);

  return { data: { rows, total: count ?? rows.length, summary: await getTransactionSummary(orgId) }, error: null };
}

async function getTransactionSummary(orgId: string): Promise<TransactionSummary> {
  const supabase = await createClient();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  const start = monthStart.toISOString().slice(0, 10);

  const [{ data: txs }, { data: attachments }] = await Promise.all([
    supabase.from('manual_transactions').select('id,status,type').eq('organisation_id', orgId),
    supabase.from('transaction_attachments').select('manual_transaction_id').eq('organisation_id', orgId),
  ]);

  const attachmentIds = new Set((attachments ?? []).map((row) => row.manual_transaction_id));
  const all = (txs ?? []) as Pick<ManualTransactionRow, 'id' | 'status' | 'type'>[];
  const missingReceipts = all.filter((tx) => tx.type === 'expense' && !attachmentIds.has(tx.id)).length;

  const { count: possibleDuplicates } = await supabase
    .from('manual_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', orgId)
    .not('duplicate_override_reason', 'is', null);

  const { count: reconciledThisMonth } = await supabase
    .from('manual_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', orgId)
    .in('status', ['reconciled', 'posted'])
    .gte('transaction_date', start);

  return {
    awaitingBankMatch: all.filter((tx) => tx.status === 'awaiting_bank_match').length,
    drafts: all.filter((tx) => tx.status === 'draft').length,
    reconciledThisMonth: reconciledThisMonth ?? 0,
    missingReceipts,
    possibleDuplicates: possibleDuplicates ?? 0,
  };
}

export async function getTransactionDetail(id: string): Promise<{
  data: {
    transaction: ManualTransactionRow;
    lines: ManualTransactionLineRow[];
    attachments: TransactionAttachmentRow[];
    matches: TransactionMatchRow[];
    audit: { action: string; user_id: string | null; metadata: unknown; created_at: string }[];
  } | null;
  error: string | null;
}> {
  const ctx = await getActiveOrg();
  const { orgId } = ctx;
  await enforcePortalPermissionForContext(ctx, 'expenses', 'view');
  const supabase = await createClient();
  const { data: transaction, error } = await supabase
    .from('manual_transactions')
    .select('*')
    .eq('id', id)
    .eq('organisation_id', orgId)
    .maybeSingle();

  if (error || !transaction) return { data: null, error: error?.message ?? 'Transaction not found.' };

  const [lines, attachments, matches, audit] = await Promise.all([
    supabase.from('manual_transaction_lines').select('*').eq('manual_transaction_id', id).eq('organisation_id', orgId).order('line_order'),
    supabase.from('transaction_attachments').select('*').eq('manual_transaction_id', id).eq('organisation_id', orgId).order('uploaded_at', { ascending: false }),
    supabase.from('transaction_matches').select('*').eq('manual_transaction_id', id).eq('organisation_id', orgId).order('created_at', { ascending: false }),
    supabase.from('audit_log').select('action,user_id,metadata,created_at').eq('organisation_id', orgId).eq('entity_type', 'manual_transaction').eq('entity_id', id).order('created_at', { ascending: false }),
  ]);

  return {
    data: {
      transaction: transaction as ManualTransactionRow,
      lines: (lines.data ?? []) as ManualTransactionLineRow[],
      attachments: (attachments.data ?? []) as TransactionAttachmentRow[],
      matches: (matches.data ?? []) as TransactionMatchRow[],
      audit: (audit.data ?? []) as { action: string; user_id: string | null; metadata: unknown; created_at: string }[],
    },
    error: null,
  };
}

export async function suggestBankMatchesForManualTransaction(id: string): Promise<{ data: MatchSuggestion[]; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();
  const { data: tx } = await supabase.from('manual_transactions').select('*').eq('id', id).eq('organisation_id', orgId).maybeSingle();
  if (!tx) return { data: [], error: 'Transaction not found.' };

  const transaction = tx as ManualTransactionRow;
  const date = new Date(transaction.transaction_date + 'T00:00:00Z');
  const from = new Date(date.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = new Date(date.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let query = supabase
    .from('bank_lines')
    .select('id, txn_date, description, reference, amount_pence, bank_account_id, allocated, reconciled')
    .eq('organisation_id', orgId)
    .eq('allocated', false)
    .eq('reconciled', false)
    .gte('txn_date', from)
    .lte('txn_date', to)
    .limit(50);

  if (transaction.expected_bank_account_id) query = query.eq('bank_account_id', transaction.expected_bank_account_id);

  const { data: bankLines, error } = await query;
  if (error) return { data: [], error: error.message };

  const suggestions = (bankLines ?? [])
    .map((line) => buildMatchSuggestion(transaction, {
      id: line.id,
      txn_date: line.txn_date,
      description: line.description,
      reference: line.reference,
      amount_pence: Number(line.amount_pence),
      bank_account_id: line.bank_account_id,
    }))
    .filter((suggestion) => suggestion.confidence_score >= 0.35)
    .sort((a, b) => b.confidence_score - a.confidence_score);

  return { data: suggestions, error: null };
}

export async function suggestManualMatchesForBankLine(bankLineId: string): Promise<{ data: MatchSuggestion[]; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();
  const { data: bankLine } = await supabase
    .from('bank_lines')
    .select('id, txn_date, description, reference, amount_pence, bank_account_id, allocated, reconciled')
    .eq('id', bankLineId)
    .eq('organisation_id', orgId)
    .maybeSingle();

  if (!bankLine) return { data: [], error: 'Bank line not found.' };
  if (bankLine.allocated || bankLine.reconciled) return { data: [], error: null };

  const date = new Date(bankLine.txn_date + 'T00:00:00Z');
  const from = new Date(date.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = new Date(date.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: txs, error } = await supabase
    .from('manual_transactions')
    .select('*')
    .eq('organisation_id', orgId)
    .eq('requires_bank_match', true)
    .is('posted_journal_id', null)
    .in('status', ['approved', 'awaiting_bank_match', 'matched'])
    .gte('transaction_date', from)
    .lte('transaction_date', to)
    .limit(50);

  if (error) return { data: [], error: error.message };

  return {
    data: ((txs ?? []) as ManualTransactionRow[])
      .map((tx) => buildMatchSuggestion(tx, {
        id: bankLine.id,
        txn_date: bankLine.txn_date,
        description: bankLine.description,
        reference: bankLine.reference,
        amount_pence: Number(bankLine.amount_pence),
        bank_account_id: bankLine.bank_account_id,
      }))
      .filter((suggestion) => suggestion.confidence_score >= 0.35)
      .sort((a, b) => b.confidence_score - a.confidence_score),
    error: null,
  };
}

export async function confirmTransactionMatch(params: { manualTransactionId: string; bankLineId: string }): Promise<ActionResult<{ id: string }>> {
  await assertWriteAllowed();
  let ctx;
  try {
    ctx = await assertTransactionPermission('update');
  } catch (error) {
    return { data: null, error: permissionError(error) };
  }

  const supabase = await createClient();
  const admin = createAdminClient();
  const [txRes, bankRes] = await Promise.all([
    supabase.from('manual_transactions').select('*').eq('id', params.manualTransactionId).eq('organisation_id', ctx.orgId).maybeSingle(),
    supabase.from('bank_lines').select('id, organisation_id, txn_date, description, reference, amount_pence, bank_account_id, allocated, reconciled').eq('id', params.bankLineId).eq('organisation_id', ctx.orgId).maybeSingle(),
  ]);

  if (!txRes.data) return { data: null, error: 'Transaction not found.' };
  if (!bankRes.data) return { data: null, error: 'Bank line not found.' };
  if (bankRes.data.allocated || bankRes.data.reconciled) return { data: null, error: 'This bank line is already allocated or reconciled.' };
  const tx = txRes.data as ManualTransactionRow;
  if (tx.posted_journal_id || tx.matched_bank_transaction_id) return { data: null, error: 'This transaction is already matched or posted.' };

  const existingBankMatch = await supabase
    .from('bank_reconciliation_matches')
    .select('id')
    .eq('bank_line_id', params.bankLineId)
    .maybeSingle();
  if (existingBankMatch.data) return { data: null, error: 'This bank line already has a reconciliation match.' };

  const suggestion = buildMatchSuggestion(tx, {
    id: bankRes.data.id,
    txn_date: bankRes.data.txn_date,
    description: bankRes.data.description,
    reference: bankRes.data.reference,
    amount_pence: Number(bankRes.data.amount_pence),
    bank_account_id: bankRes.data.bank_account_id,
  });

  const { data: match, error } = await admin
    .from('transaction_matches')
    .insert({
      organisation_id: ctx.orgId,
      bank_line_id: params.bankLineId,
      manual_transaction_id: params.manualTransactionId,
      match_status: 'confirmed',
      confidence_score: suggestion.confidence_score,
      confidence_label: suggestion.confidence_label,
      match_reason: suggestion.match_reason,
      confirmed_by: ctx.user.id,
      confirmed_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error || !match) return { data: null, error: error?.message ?? 'Failed to confirm match.' };

  await admin
    .from('manual_transactions')
    .update({
      status: 'matched',
      matched_bank_transaction_id: params.bankLineId,
    })
    .eq('id', params.manualTransactionId)
    .eq('organisation_id', ctx.orgId);

  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'manual_transaction_match_confirm',
    entityType: 'manual_transaction',
    entityId: params.manualTransactionId,
    metadata: { bankLineId: params.bankLineId, matchId: match.id },
  });

  revalidatePath('/transactions');
  revalidatePath(`/transactions/${params.manualTransactionId}`);
  return { data: { id: match.id }, error: null };
}

export async function confirmTransactionMatchAction(formData: FormData) {
  const manualTransactionId = String(formData.get('manual_transaction_id') ?? '');
  const bankLineId = String(formData.get('bank_line_id') ?? '');
  const result = await confirmTransactionMatch({ manualTransactionId, bankLineId });
  if (result.error) redirect(`/transactions/${manualTransactionId}?error=` + encodeURIComponent(result.error));
  redirect(`/transactions/${manualTransactionId}`);
}

export async function uploadTransactionAttachment(formData: FormData): Promise<ActionResult<TransactionAttachmentRow>> {
  await assertWriteAllowed();
  let ctx;
  try {
    ctx = await assertTransactionPermission('update');
  } catch (error) {
    return { data: null, error: permissionError(error) };
  }

  const transactionId = String(formData.get('manual_transaction_id') ?? '');
  const file = formData.get('file');
  if (!(file instanceof File)) return { data: null, error: 'No file provided.' };
  if (file.size === 0) return { data: null, error: 'The selected file is empty.' };
  if (file.size > 10 * 1024 * 1024) return { data: null, error: 'Files must be smaller than 10MB.' };

  const supabase = await createClient();
  const { data: tx } = await supabase
    .from('manual_transactions')
    .select('id,status')
    .eq('id', transactionId)
    .eq('organisation_id', ctx.orgId)
    .maybeSingle();
  if (!tx) return { data: null, error: 'Transaction not found.' };
  if (tx.status === 'posted' || tx.status === 'voided') return { data: null, error: 'Attachments cannot be changed after posting or voiding.' };

  const bytes = Buffer.from(await file.arrayBuffer());
  const hash = createHash('sha256').update(bytes).digest('hex');
  const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
  const safeBase = slugifyFileName(file.name.replace(/\.[^.]+$/, '')) || 'receipt';
  const safeExt = ext ? `.${slugifyFileName(ext)}` : '';
  const path = `${ctx.orgId}/transactions/${transactionId}/${Date.now()}-${safeBase}${safeExt}`;

  const { error: uploadErr } = await supabase.storage.from(FINANCIAL_EVIDENCE_BUCKET).upload(path, bytes, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (uploadErr) {
    await logServerFailure({
      area: 'transactions',
      event: 'upload_attachment_failed',
      error: uploadErr,
      metadata: { orgId: ctx.orgId, transactionId, userId: ctx.user.id },
      capture: false,
    });
    return { data: null, error: uploadErr.message };
  }

  const { data: attachment, error } = await supabase
    .from('transaction_attachments')
    .insert({
      organisation_id: ctx.orgId,
      manual_transaction_id: transactionId,
      file_name: file.name,
      file_path: path,
      file_type: file.type || 'application/octet-stream',
      file_size: file.size,
      file_hash: hash,
      uploaded_by: ctx.user.id,
    })
    .select('*')
    .single();

  if (error || !attachment) return { data: null, error: error?.message ?? 'Attachment metadata could not be saved.' };

  await logAuditEvent({
    orgId: ctx.orgId,
    userId: ctx.user.id,
    action: 'manual_transaction_attachment_upload',
    entityType: 'manual_transaction',
    entityId: transactionId,
    metadata: { fileName: file.name, fileSize: file.size, fileHash: hash },
  });

  revalidatePath(`/transactions/${transactionId}`);
  return { data: attachment as TransactionAttachmentRow, error: null };
}

export async function uploadTransactionAttachmentAction(formData: FormData) {
  const id = String(formData.get('manual_transaction_id') ?? '');
  const result = await uploadTransactionAttachment(formData);
  if (result.error) redirect(`/transactions/${id}?error=` + encodeURIComponent(result.error));
  redirect(`/transactions/${id}`);
}

export async function removeTransactionAttachmentAction(formData: FormData) {
  await assertWriteAllowed();
  const transactionId = String(formData.get('manual_transaction_id') ?? '');
  const attachmentId = String(formData.get('attachment_id') ?? '');
  let ctx;
  try {
    ctx = await assertTransactionPermission('delete');
  } catch (error) {
    redirect(`/transactions/${transactionId}?error=` + encodeURIComponent(permissionError(error)));
  }

  const supabase = await createClient();
  const { data: attachment } = await supabase
    .from('transaction_attachments')
    .select('file_path')
    .eq('id', attachmentId)
    .eq('manual_transaction_id', transactionId)
    .eq('organisation_id', ctx.orgId)
    .maybeSingle();
  if (!attachment) redirect(`/transactions/${transactionId}?error=` + encodeURIComponent('Attachment not found.'));

  await supabase.storage.from(FINANCIAL_EVIDENCE_BUCKET).remove([attachment.file_path]);
  const { error } = await supabase
    .from('transaction_attachments')
    .delete()
    .eq('id', attachmentId)
    .eq('organisation_id', ctx.orgId);
  if (error) redirect(`/transactions/${transactionId}?error=` + encodeURIComponent(error.message));
  redirect(`/transactions/${transactionId}`);
}

export async function attachmentAccessUrl(filePath: string): Promise<string> {
  return buildEvidenceAccessPath(filePath);
}
