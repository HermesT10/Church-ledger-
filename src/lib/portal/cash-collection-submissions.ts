'use server';

import { revalidatePath } from 'next/cache';
import { assertWriteAllowed } from '@/lib/demo';
import { logAuditEvent } from '@/lib/audit';
import { getActiveOrg } from '@/lib/org';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { buildEvidenceAccessPath, FINANCIAL_EVIDENCE_BUCKET } from '@/lib/evidence/config';
import {
  enforcePortalPermissionForContext,
  PortalPermissionError,
  type PortalPermissionContext,
} from '@/lib/portal-permissions';
import { createPortalNotification } from '@/lib/portal/notifications';
import type {
  CashCollectionSubmissionRow,
  CashCollectionSubmissionStatus,
  CashCollectionSubmissionType,
  PortalCashCollectionFormOptions,
} from '@/lib/cash/types';

const SUBMISSION_STATUSES: readonly CashCollectionSubmissionStatus[] = [
  'draft',
  'submitted',
  'reviewed',
  'banked',
  'reconciled',
  'rejected',
];

const COLLECTION_TYPES: readonly CashCollectionSubmissionType[] = [
  'service',
  'event',
  'cafe',
  'offering',
  'other',
];

interface CashCollectionSubmissionInput {
  collectionDate: string;
  amountPence: number;
  detail: string;
  collectionType?: CashCollectionSubmissionType | null;
  fundId?: string | null;
  incomeStreamId?: string | null;
  countedBy?: string | null;
  secondCounter?: string | null;
  notes?: string | null;
}

function permissionMessage(error: unknown) {
  return error instanceof PermissionError || error instanceof PortalPermissionError
    ? error.message
    : 'Permission denied.';
}

function validateSubmissionInput(params: CashCollectionSubmissionInput) {
  if (!params.collectionDate) return 'Collection date is required.';
  if (!params.amountPence || params.amountPence <= 0) return 'Amount must be positive.';
  if (!params.detail?.trim()) return 'Detail is required.';
  if (params.collectionType && !COLLECTION_TYPES.includes(params.collectionType)) return 'Invalid collection type.';
  return null;
}

async function getSignedBy(userId: string) {
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, email')
    .eq('id', userId)
    .maybeSingle();

  return profile?.full_name?.trim() || profile?.email?.trim() || 'Portal user';
}

async function enforceSubmitScope(
  context: PortalPermissionContext,
  params: { fundId?: string | null },
) {
  await enforcePortalPermissionForContext(context, 'cash_collections', 'submit', {
    scope: 'own_records',
    ownerUserId: context.user.id,
    requireSubmit: true,
  });

  if (params.fundId) {
    await enforcePortalPermissionForContext(context, 'cash_collections', 'submit', {
      scope: 'assigned_funds',
      fundId: params.fundId,
      requireSubmit: true,
    });
  }
}

function mapSubmissionRow(row: Record<string, unknown>): CashCollectionSubmissionRow {
  const submitter = row.submitter as { full_name?: string | null } | null;
  const reviewer = row.reviewer as { full_name?: string | null } | null;
  const fund = row.fund as { name?: string | null } | null;
  const incomeStream = row.income_stream as { name?: string | null } | null;

  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    submittedBy: row.submitted_by as string,
    submitterName: submitter?.full_name ?? null,
    collectionDate: row.collection_date as string,
    amountPence: Number(row.amount_pence ?? 0),
    detail: row.detail as string,
    signedBy: row.signed_by as string,
    collectionType: (row.collection_type as CashCollectionSubmissionType | null) ?? null,
    fundId: (row.fund_id as string | null) ?? null,
    fundName: fund?.name ?? null,
    incomeStreamId: (row.income_stream_id as string | null) ?? null,
    incomeStreamName: incomeStream?.name ?? null,
    countedBy: (row.counted_by as string | null) ?? null,
    secondCounter: (row.second_counter as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    attachmentUrl: (row.attachment_url as string | null) ?? null,
    attachmentPath: (row.attachment_path as string | null) ?? null,
    status: row.status as CashCollectionSubmissionStatus,
    reviewedBy: (row.reviewed_by as string | null) ?? null,
    reviewerName: reviewer?.full_name ?? null,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    adminNotes: (row.admin_notes as string | null) ?? null,
    linkedCashBatchId: (row.linked_cash_batch_id as string | null) ?? null,
    linkedBankTransactionId: (row.linked_bank_transaction_id as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listPortalCashCollectionSubmissions(
  filters: { status?: CashCollectionSubmissionStatus | 'all'; admin?: boolean } = {},
): Promise<{ data: CashCollectionSubmissionRow[]; error: string | null }> {
  const { orgId, role, user } = await getActiveOrg();
  const supabase = await createClient();

  let query = supabase
    .from('cash_collection_submissions')
    .select(`
      *,
      submitter:profiles!cash_collection_submissions_submitted_by_fkey(full_name),
      reviewer:profiles!cash_collection_submissions_reviewed_by_fkey(full_name),
      fund:funds(name),
      income_stream:income_streams(name)
    `)
    .eq('workspace_id', orgId)
    .order('created_at', { ascending: false });

  if (filters.status && filters.status !== 'all' && SUBMISSION_STATUSES.includes(filters.status)) {
    query = query.eq('status', filters.status);
  }

  if (!filters.admin || (role !== 'admin' && role !== 'treasurer')) {
    query = query.eq('submitted_by', user.id);
  }

  const { data, error } = await query;
  if (error) return { data: [], error: error.message };

  return {
    data: (data ?? []).map((row) => mapSubmissionRow(row as Record<string, unknown>)),
    error: null,
  };
}

export async function listPortalCashCollectionFormOptions(): Promise<{ data: PortalCashCollectionFormOptions; error: string | null }> {
  const { orgId, role, user } = await getActiveOrg();
  const supabase = await createClient();
  const signedBy = await getSignedBy(user.id);

  const [fundAssignmentsRes, incomeStreamsRes] = await Promise.all([
    supabase
      .from('user_fund_assignments')
      .select('fund_id, funds(id, name)')
      .eq('workspace_id', orgId)
      .eq('user_id', user.id)
      .eq('can_submit_against', true),
    supabase
      .from('income_streams')
      .select('id, code, name, default_fund_id, default_income_account_id')
      .eq('organisation_id', orgId)
      .eq('status', 'active')
      .order('name'),
  ]);

  const funds = (fundAssignmentsRes.data ?? [])
    .map((row) => {
      const fund = Array.isArray(row.funds) ? row.funds[0] : row.funds;
      return fund ? { id: fund.id, name: fund.name } : null;
    })
    .filter((row): row is { id: string; name: string } => Boolean(row));

  if ((role === 'admin' || role === 'treasurer') && funds.length === 0) {
    const { data } = await supabase
      .from('funds')
      .select('id, name')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('name');
    funds.push(...((data ?? []) as { id: string; name: string }[]));
  }

  return {
    data: {
      signedBy,
      funds,
      incomeStreams: (incomeStreamsRes.data ?? []).map((stream) => ({
        id: stream.id,
        code: stream.code,
        name: stream.name,
        defaultFundId: stream.default_fund_id ?? null,
        defaultIncomeAccountId: stream.default_income_account_id ?? null,
      })),
    },
    error: fundAssignmentsRes.error?.message ?? incomeStreamsRes.error?.message ?? null,
  };
}

export async function savePortalCashCollectionDraft(
  params: CashCollectionSubmissionInput,
): Promise<{ data: { id: string } | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    await enforcePortalPermissionForContext({ orgId, role, user }, 'cash_collections', 'submit', {
      scope: 'own_records',
      ownerUserId: user.id,
    });
  } catch (error) {
    return { data: null, error: permissionMessage(error) };
  }

  const validation = validateSubmissionInput(params);
  if (validation) return { data: null, error: validation };

  const signedBy = await getSignedBy(user.id);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('cash_collection_submissions')
    .insert({
      workspace_id: orgId,
      submitted_by: user.id,
      collection_date: params.collectionDate,
      amount_pence: params.amountPence,
      detail: params.detail.trim(),
      signed_by: signedBy,
      collection_type: params.collectionType ?? null,
      fund_id: params.fundId ?? null,
      income_stream_id: params.incomeStreamId ?? null,
      counted_by: params.countedBy?.trim() || null,
      second_counter: params.secondCounter?.trim() || null,
      notes: params.notes?.trim() || null,
      status: 'draft',
    })
    .select('id')
    .single();

  if (error) return { data: null, error: error.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'save_cash_collection_submission_draft',
    entityType: 'cash_collection_submission',
    entityId: data.id,
  });

  return { data: { id: data.id }, error: null };
}

export async function updatePortalCashCollectionDraft(
  id: string,
  params: CashCollectionSubmissionInput,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    await enforcePortalPermissionForContext({ orgId, role, user }, 'cash_collections', 'edit_own', {
      scope: 'own_records',
      ownerUserId: user.id,
    });
  } catch (error) {
    return { error: permissionMessage(error) };
  }

  const validation = validateSubmissionInput(params);
  if (validation) return { error: validation };

  const supabase = await createClient();
  const { data: submission, error: fetchErr } = await supabase
    .from('cash_collection_submissions')
    .select('id, workspace_id, submitted_by, status')
    .eq('id', id)
    .single();

  if (fetchErr || !submission) return { error: 'Submission not found.' };
  if (submission.workspace_id !== orgId || submission.submitted_by !== user.id) return { error: 'You can only edit your own submissions.' };
  if (submission.status !== 'draft') return { error: 'Only draft submissions can be edited.' };

  const { error } = await supabase
    .from('cash_collection_submissions')
    .update({
      collection_date: params.collectionDate,
      amount_pence: params.amountPence,
      detail: params.detail.trim(),
      collection_type: params.collectionType ?? null,
      fund_id: params.fundId ?? null,
      income_stream_id: params.incomeStreamId ?? null,
      counted_by: params.countedBy?.trim() || null,
      second_counter: params.secondCounter?.trim() || null,
      notes: params.notes?.trim() || null,
    })
    .eq('id', id);

  return { error: error?.message ?? null };
}

export async function submitPortalCashCollection(
  id: string,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  const supabase = await createClient();
  const { data: submission, error: fetchErr } = await supabase
    .from('cash_collection_submissions')
    .select('id, workspace_id, submitted_by, status, fund_id, detail')
    .eq('id', id)
    .single();

  if (fetchErr || !submission) return { error: 'Submission not found.' };
  if (submission.workspace_id !== orgId || submission.submitted_by !== user.id) return { error: 'You can only submit your own records.' };
  if (submission.status !== 'draft') return { error: 'Only draft submissions can be submitted.' };

  try {
    await enforceSubmitScope({ orgId, role, user }, { fundId: submission.fund_id });
  } catch (error) {
    return { error: permissionMessage(error) };
  }

  const { error } = await supabase
    .from('cash_collection_submissions')
    .update({ status: 'submitted' })
    .eq('id', id);

  if (!error) {
    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'submit_cash_collection_submission',
      entityType: 'cash_collection_submission',
      entityId: id,
    });
    await createPortalNotification({
      workspaceId: orgId,
      userId: user.id,
      type: 'cash_collection_submitted',
      title: 'Cash collection submitted',
      body: `${submission.detail} has been sent for review.`,
      sourceType: 'cash_collection_submission',
      sourceId: id,
      href: '/portal/cash-collections',
    });
  }

  revalidatePath('/portal/cash-collections');
  return { error: error?.message ?? null };
}

async function requireCashReviewer() {
  const active = await getActiveOrg();
  try {
    assertCanPerform(active.role, 'update', 'cash');
    await enforcePortalPermissionForContext(active, 'cash_collections', 'approve');
  } catch (error) {
    throw error;
  }
  return active;
}

export async function reviewCashCollectionSubmission(
  id: string,
  adminNotes?: string,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  let active: Awaited<ReturnType<typeof getActiveOrg>>;
  try {
    active = await requireCashReviewer();
  } catch (error) {
    return { error: permissionMessage(error) };
  }

  const supabase = await createClient();
  const { data: submission, error: fetchErr } = await supabase
    .from('cash_collection_submissions')
    .select('id, workspace_id, submitted_by, detail, status')
    .eq('id', id)
    .single();

  if (fetchErr || !submission) return { error: 'Submission not found.' };
  if (submission.workspace_id !== active.orgId) return { error: 'Not in your organisation.' };
  if (submission.status !== 'submitted') return { error: 'Only submitted records can be reviewed.' };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('cash_collection_submissions')
    .update({
      status: 'reviewed',
      reviewed_by: active.user.id,
      reviewed_at: now,
      admin_notes: adminNotes?.trim() || null,
    })
    .eq('id', id);

  if (!error) {
    await createPortalNotification({
      workspaceId: active.orgId,
      userId: submission.submitted_by,
      type: 'cash_collection_reviewed',
      title: 'Cash collection reviewed',
      body: `${submission.detail} has been reviewed.`,
      sourceType: 'cash_collection_submission',
      sourceId: id,
      href: '/portal/cash-collections',
    });
  }

  return { error: error?.message ?? null };
}

export async function rejectCashCollectionSubmission(
  id: string,
  adminNotes: string,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  let active: Awaited<ReturnType<typeof getActiveOrg>>;
  try {
    active = await requireCashReviewer();
  } catch (error) {
    return { error: permissionMessage(error) };
  }

  if (!adminNotes.trim()) return { error: 'A rejection note is required.' };

  const supabase = await createClient();
  const { data: submission, error: fetchErr } = await supabase
    .from('cash_collection_submissions')
    .select('id, workspace_id, submitted_by, detail, status')
    .eq('id', id)
    .single();

  if (fetchErr || !submission) return { error: 'Submission not found.' };
  if (submission.workspace_id !== active.orgId) return { error: 'Not in your organisation.' };
  if (!['submitted', 'reviewed'].includes(submission.status)) return { error: 'Only submitted or reviewed records can be rejected.' };

  const { error } = await supabase
    .from('cash_collection_submissions')
    .update({
      status: 'rejected',
      reviewed_by: active.user.id,
      reviewed_at: new Date().toISOString(),
      admin_notes: adminNotes.trim(),
    })
    .eq('id', id);

  if (!error) {
    await createPortalNotification({
      workspaceId: active.orgId,
      userId: submission.submitted_by,
      type: 'cash_collection_rejected',
      title: 'Cash collection rejected',
      body: adminNotes.trim(),
      sourceType: 'cash_collection_submission',
      sourceId: id,
      href: '/portal/cash-collections',
    });
  }

  return { error: error?.message ?? null };
}

export async function convertSubmissionToCashCollection(
  id: string,
): Promise<{ data: { id: string } | null; error: string | null }> {
  await assertWriteAllowed();
  let active: Awaited<ReturnType<typeof getActiveOrg>>;
  try {
    active = await requireCashReviewer();
  } catch (error) {
    return { data: null, error: permissionMessage(error) };
  }

  const admin = createAdminClient();
  const { data: submission, error: fetchErr } = await admin
    .from('cash_collection_submissions')
    .select('*, income_streams(default_income_account_id), funds(id)')
    .eq('id', id)
    .eq('workspace_id', active.orgId)
    .single();

  if (fetchErr || !submission) return { data: null, error: 'Submission not found.' };
  if (!['submitted', 'reviewed'].includes(submission.status)) return { data: null, error: 'Only submitted or reviewed records can be converted.' };
  if (submission.linked_cash_batch_id) return { data: { id: submission.linked_cash_batch_id }, error: null };
  if (!submission.fund_id) return { data: null, error: 'Choose a fund before converting this submission.' };

  const incomeStream = Array.isArray(submission.income_streams) ? submission.income_streams[0] : submission.income_streams;
  let incomeAccountId = incomeStream?.default_income_account_id ?? null;
  if (!incomeAccountId) {
    const { data: account } = await admin
      .from('accounts')
      .select('id')
      .eq('organisation_id', active.orgId)
      .eq('type', 'income')
      .eq('is_active', true)
      .eq('available_in_donations', true)
      .order('code')
      .limit(1)
      .maybeSingle();
    incomeAccountId = account?.id ?? null;
  }

  if (!incomeAccountId) return { data: null, error: 'No income account is available for this cash collection.' };

  const { data: collection, error: collectionErr } = await admin
    .from('cash_collections')
    .insert({
      organisation_id: active.orgId,
      collected_date: submission.collection_date,
      service_name: submission.detail,
      total_amount_pence: submission.amount_pence,
      counted_by_name_1: submission.counted_by || submission.signed_by,
      counted_by_name_2: submission.second_counter || submission.signed_by,
      counter_1_confirmed: true,
      counter_2_confirmed: Boolean(submission.second_counter),
      notes: submission.notes ?? null,
      created_by: active.user.id,
    })
    .select('id')
    .single();

  if (collectionErr || !collection) return { data: null, error: collectionErr?.message ?? 'Failed to create cash collection.' };

  const { error: lineErr } = await admin.from('cash_collection_lines').insert({
    cash_collection_id: collection.id,
    fund_id: submission.fund_id,
    income_account_id: incomeAccountId,
    amount_pence: submission.amount_pence,
    donor_id: null,
    gift_aid_eligible: false,
  });

  if (lineErr) {
    await admin.from('cash_collections').delete().eq('id', collection.id);
    return { data: null, error: lineErr.message };
  }

  await admin
    .from('cash_collection_submissions')
    .update({
      status: 'reviewed',
      linked_cash_batch_id: collection.id,
      reviewed_by: active.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id);

  await logAuditEvent({
    orgId: active.orgId,
    userId: active.user.id,
    action: 'convert_cash_collection_submission',
    entityType: 'cash_collection_submission',
    entityId: id,
    metadata: { cashCollectionId: collection.id },
  });

  await createPortalNotification({
    workspaceId: active.orgId,
    userId: submission.submitted_by,
    type: 'cash_collection_converted',
    title: 'Cash collection converted',
    body: `${submission.detail} has been converted into a cash collection batch.`,
    sourceType: 'cash_collection_submission',
    sourceId: id,
    href: '/portal/cash-collections',
  });

  return { data: { id: collection.id }, error: null };
}

export async function linkSubmissionToBankTransaction(
  id: string,
  bankTransactionId: string,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  let active: Awaited<ReturnType<typeof getActiveOrg>>;
  try {
    active = await requireCashReviewer();
  } catch (error) {
    return { error: permissionMessage(error) };
  }

  const admin = createAdminClient();
  const { data: bankLine } = await admin
    .from('bank_lines')
    .select('id, workspace_id')
    .eq('id', bankTransactionId)
    .eq('workspace_id', active.orgId)
    .maybeSingle();

  if (!bankLine) return { error: 'Bank transaction not found.' };

  const { data: submission, error } = await admin
    .from('cash_collection_submissions')
    .update({
      status: 'reconciled',
      linked_bank_transaction_id: bankTransactionId,
    })
    .eq('id', id)
    .eq('workspace_id', active.orgId)
    .select('submitted_by, detail')
    .single();

  if (error || !submission) return { error: error?.message ?? 'Submission not found.' };

  await createPortalNotification({
    workspaceId: active.orgId,
    userId: submission.submitted_by,
    type: 'cash_collection_reconciled',
    title: 'Cash collection reconciled',
    body: `${submission.detail} has been linked to a bank transaction.`,
    sourceType: 'cash_collection_submission',
    sourceId: id,
    href: '/portal/cash-collections',
  });

  return { error: null };
}

export async function uploadPortalCashCollectionAttachment(
  formData: FormData,
  submissionId: string,
): Promise<{ url: string | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    await enforcePortalPermissionForContext({ orgId, role, user }, 'documents', 'upload', {
      scope: 'own_records',
      ownerUserId: user.id,
    });
  } catch (error) {
    return { url: null, error: permissionMessage(error) };
  }

  const file = formData.get('file');
  if (!(file instanceof File)) return { url: null, error: 'No file provided.' };
  if (file.size === 0) return { url: null, error: 'The selected file is empty.' };
  if (file.size > 10 * 1024 * 1024) return { url: null, error: 'Files must be smaller than 10MB.' };

  const supabase = await createClient();
  const { data: submission, error: fetchErr } = await supabase
    .from('cash_collection_submissions')
    .select('id, workspace_id, submitted_by, status')
    .eq('id', submissionId)
    .single();

  if (fetchErr || !submission) return { url: null, error: 'Submission not found.' };
  if (submission.workspace_id !== orgId || submission.submitted_by !== user.id) return { url: null, error: 'You can only upload files for your own submissions.' };
  if (submission.status !== 'draft') return { url: null, error: 'Attachments can only be changed while the submission is a draft.' };

  const safeBase = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'cash-collection';
  const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const storagePath = `${orgId}/cash-collection-submissions/${submissionId}/${Date.now()}-${safeBase}${ext ? `.${ext}` : ''}`;
  const bytes = await file.arrayBuffer();
  const admin = createAdminClient();

  const { error: uploadErr } = await admin.storage
    .from(FINANCIAL_EVIDENCE_BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

  if (uploadErr) return { url: null, error: uploadErr.message };

  const url = buildEvidenceAccessPath(storagePath);
  const { error: updateErr } = await admin
    .from('cash_collection_submissions')
    .update({
      attachment_url: url,
      attachment_path: storagePath,
    })
    .eq('id', submissionId)
    .eq('workspace_id', orgId);

  if (updateErr) return { url: null, error: updateErr.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'upload_cash_collection_submission_attachment',
    entityType: 'cash_collection_submission',
    entityId: submissionId,
    metadata: {
      storagePath,
      fileName: file.name,
      fileSize: file.size,
    },
  });

  return { url, error: null };
}
