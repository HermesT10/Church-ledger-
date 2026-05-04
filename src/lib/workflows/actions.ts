'use server';

import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { assertWriteAllowed } from '@/lib/demo';
import { logAuditEvent } from '@/lib/audit';
import {
  enforcePortalPermissionForContext,
  PortalPermissionError,
  type PortalPermissionContext,
} from '@/lib/portal-permissions';
import { createPortalNotification } from '@/lib/portal/notifications';
import { buildEvidenceAccessPath, FINANCIAL_EVIDENCE_BUCKET } from '@/lib/evidence/config';
import type {
  InvoiceSubmissionRow,
  InvoiceSubmissionStatus,
  PortalInvoiceFormOptions,
  ExpenseRequestRow,
  ApprovalCounts,
} from './types';

/* ================================================================== */
/*  INVOICE SUBMISSIONS                                                */
/* ================================================================== */

const INVOICE_SUBMISSION_STATUSES: readonly InvoiceSubmissionStatus[] = [
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'change_requested',
  'scheduled_for_payment',
  'paid',
  'voided',
];

type InvoiceSubmissionInput = {
  supplierName: string;
  supplierId?: string | null;
  invoiceNumber?: string | null;
  invoiceDate: string;
  amountPence: number;
  budgetId?: string | null;
  fundId?: string | null;
  accountId?: string | null;
  description?: string | null;
  attachmentUrl?: string | null;
};

function isInvoiceStatus(value: string | undefined): value is InvoiceSubmissionStatus {
  return Boolean(value && INVOICE_SUBMISSION_STATUSES.includes(value as InvoiceSubmissionStatus));
}

function portalPermissionMessage(error: unknown) {
  return error instanceof PermissionError || error instanceof PortalPermissionError
    ? error.message
    : 'Permission denied';
}

function validateInvoiceSubmissionInput(params: InvoiceSubmissionInput, requireAttachment = false): string | null {
  if (!params.supplierName?.trim()) return 'Supplier name is required.';
  if (!params.invoiceDate) return 'Invoice date is required.';
  if (!params.amountPence || params.amountPence <= 0) return 'Amount must be positive.';
  if (requireAttachment && !params.attachmentUrl) return 'Please attach the invoice before submitting.';
  return null;
}

async function enforceInvoiceSubmitScope(
  context: PortalPermissionContext,
  params: { budgetId?: string | null; fundId?: string | null; accountId?: string | null },
) {
  await enforcePortalPermissionForContext({ orgId: context.orgId, role: context.role, user: context.user }, 'submit_invoices', 'submit', {
    scope: 'own_records',
    ownerUserId: context.user.id,
    requireSubmit: true,
  });

  if (params.budgetId) {
    await enforcePortalPermissionForContext(context, 'submit_invoices', 'submit', {
      scope: 'assigned_budgets',
      budgetId: params.budgetId,
      requireSubmit: true,
    });
  }
  if (params.fundId) {
    await enforcePortalPermissionForContext(context, 'submit_invoices', 'submit', {
      scope: 'assigned_funds',
      fundId: params.fundId,
      requireSubmit: true,
    });
  }
  if (params.accountId) {
    await enforcePortalPermissionForContext(context, 'submit_invoices', 'submit', {
      scope: 'assigned_categories',
      categoryId: params.accountId,
      requireSubmit: true,
    });
  }
}

function mapInvoiceSubmissionRow(r: Record<string, unknown>): InvoiceSubmissionRow {
  const submitter = r.submitter as { full_name: string | null } | null;
  const reviewer = r.reviewer as { full_name: string | null } | null;
  const fund = r.fund as { name: string } | null;
  const account = r.account as { name: string } | null;
  const budget = r.budget as { name: string } | null;
  return {
    id: r.id as string,
    organisationId: r.organisation_id as string,
    submittedBy: r.submitted_by as string,
    submitterName: submitter?.full_name ?? null,
    supplierName: r.supplier_name as string,
    supplierId: (r.supplier_id as string) ?? null,
    invoiceNumber: (r.invoice_number as string) ?? null,
    invoiceDate: r.invoice_date as string,
    amountPence: Number(r.amount_pence ?? 0),
    budgetId: (r.budget_id as string) ?? null,
    budgetName: budget?.name ?? null,
    fundId: (r.fund_id as string) ?? null,
    fundName: fund?.name ?? null,
    accountId: (r.account_id as string) ?? null,
    accountName: account?.name ?? null,
    description: (r.description as string) ?? null,
    attachmentUrl: (r.attachment_url as string) ?? null,
    attachmentPath: (r.attachment_path as string) ?? null,
    attachmentFileName: (r.attachment_file_name as string) ?? null,
    status: r.status as InvoiceSubmissionStatus,
    reviewedBy: (r.reviewed_by as string) ?? null,
    reviewerName: reviewer?.full_name ?? null,
    reviewedAt: (r.reviewed_at as string) ?? null,
    reviewNote: (r.review_note as string) ?? null,
    billId: (r.bill_id as string) ?? null,
    paymentRunId: (r.payment_run_id as string) ?? null,
    submittedAt: (r.submitted_at as string) ?? null,
    underReviewAt: (r.under_review_at as string) ?? null,
    changeRequestedAt: (r.change_requested_at as string) ?? null,
    voidedAt: (r.voided_at as string) ?? null,
    voidReason: (r.void_reason as string) ?? null,
    paidAt: (r.paid_at as string) ?? null,
    adminNote: (r.admin_note as string) ?? null,
    requestChangesNote: (r.request_changes_note as string) ?? null,
    createdAt: r.created_at as string,
  };
}

/* ------------------------------------------------------------------ */
/*  createInvoiceSubmission                                            */
/* ------------------------------------------------------------------ */

export async function createInvoiceSubmission(params: InvoiceSubmissionInput): Promise<{ data: { id: string } | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    if (role === 'admin' || role === 'treasurer' || role === 'finance_user') {
      assertCanPerform(role, 'create', 'workflows');
    } else {
      await enforceInvoiceSubmitScope({ orgId, role, user }, params);
    }
  } catch (e) {
    return { data: null, error: portalPermissionMessage(e) };
  }

  const validationError = validateInvoiceSubmissionInput(params);
  if (validationError) return { data: null, error: validationError };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('invoice_submissions')
    .insert({
      organisation_id: orgId,
      submitted_by: user.id,
      supplier_name: params.supplierName.trim(),
      supplier_id: params.supplierId ?? null,
      invoice_number: params.invoiceNumber ?? null,
      invoice_date: params.invoiceDate,
      amount_pence: params.amountPence,
      budget_id: params.budgetId ?? null,
      fund_id: params.fundId ?? null,
      account_id: params.accountId ?? null,
      description: params.description ?? null,
      attachment_url: params.attachmentUrl ?? null,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      last_status_changed_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) return { data: null, error: error.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'create_invoice_submission',
    entityType: 'invoice_submission',
    entityId: data.id,
  });
  await createPortalNotification({
    workspaceId: orgId,
    userId: user.id,
    type: 'invoice_submitted',
    title: 'Invoice submitted',
    body: `${params.supplierName.trim()} has been sent for review.`,
    sourceType: 'invoice_submission',
    sourceId: data.id,
    href: '/portal/invoices',
  });

  return { data: { id: data.id }, error: null };
}

export async function savePortalInvoiceDraft(
  params: InvoiceSubmissionInput,
): Promise<{ data: { id: string } | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    await enforcePortalPermissionForContext({ orgId, role, user }, 'submit_invoices', 'submit', {
      scope: 'own_records',
      ownerUserId: user.id,
    });
  } catch (e) {
    return { data: null, error: portalPermissionMessage(e) };
  }

  const validationError = validateInvoiceSubmissionInput(params);
  if (validationError) return { data: null, error: validationError };

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('invoice_submissions')
    .insert({
      organisation_id: orgId,
      submitted_by: user.id,
      supplier_name: params.supplierName.trim(),
      supplier_id: params.supplierId ?? null,
      invoice_number: params.invoiceNumber ?? null,
      invoice_date: params.invoiceDate,
      amount_pence: params.amountPence,
      budget_id: params.budgetId ?? null,
      fund_id: params.fundId ?? null,
      account_id: params.accountId ?? null,
      description: params.description ?? null,
      attachment_url: params.attachmentUrl ?? null,
      status: 'draft',
      last_status_changed_at: now,
    })
    .select('id')
    .single();

  if (error) return { data: null, error: error.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'save_invoice_submission_draft',
    entityType: 'invoice_submission',
    entityId: data.id,
  });

  return { data: { id: data.id }, error: null };
}

export async function updatePortalInvoiceDraft(
  id: string,
  params: InvoiceSubmissionInput,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    await enforcePortalPermissionForContext({ orgId, role, user }, 'submit_invoices', 'edit_own', {
      scope: 'own_records',
      ownerUserId: user.id,
    });
  } catch (e) {
    return { error: portalPermissionMessage(e) };
  }

  const validationError = validateInvoiceSubmissionInput(params);
  if (validationError) return { error: validationError };

  const supabase = await createClient();
  const { data: sub, error: fetchErr } = await supabase
    .from('invoice_submissions')
    .select('id, organisation_id, submitted_by, status')
    .eq('id', id)
    .single();

  if (fetchErr || !sub) return { error: 'Submission not found.' };
  if (sub.organisation_id !== orgId || sub.submitted_by !== user.id) return { error: 'You can only edit your own submissions.' };
  if (!['draft', 'change_requested'].includes(sub.status)) return { error: 'Only drafts or change-requested invoices can be edited.' };

  const { error } = await supabase
    .from('invoice_submissions')
    .update({
      supplier_name: params.supplierName.trim(),
      supplier_id: params.supplierId ?? null,
      invoice_number: params.invoiceNumber ?? null,
      invoice_date: params.invoiceDate,
      amount_pence: params.amountPence,
      budget_id: params.budgetId ?? null,
      fund_id: params.fundId ?? null,
      account_id: params.accountId ?? null,
      description: params.description ?? null,
      last_status_changed_at: new Date().toISOString(),
    })
    .eq('id', id);

  return { error: error?.message ?? null };
}

export async function submitPortalInvoice(
  id: string,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  const supabase = await createClient();
  const { data: sub, error: fetchErr } = await supabase
    .from('invoice_submissions')
    .select('id, organisation_id, submitted_by, status, supplier_name, budget_id, fund_id, account_id, attachment_url')
    .eq('id', id)
    .single();

  if (fetchErr || !sub) return { error: 'Submission not found.' };
  if (sub.organisation_id !== orgId || sub.submitted_by !== user.id) return { error: 'You can only submit your own invoices.' };
  if (!['draft', 'change_requested'].includes(sub.status)) return { error: 'Only drafts or change-requested invoices can be submitted.' };

  try {
    await enforceInvoiceSubmitScope({ orgId, role, user }, {
      budgetId: sub.budget_id,
      fundId: sub.fund_id,
      accountId: sub.account_id,
    });
  } catch (e) {
    return { error: portalPermissionMessage(e) };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('invoice_submissions')
    .update({
      status: 'submitted',
      submitted_at: now,
      last_status_changed_at: now,
      request_changes_note: null,
    })
    .eq('id', id);

  if (!error) {
    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'submit_invoice_submission',
      entityType: 'invoice_submission',
      entityId: id,
    });
    await createPortalNotification({
      workspaceId: orgId,
      userId: user.id,
      type: 'invoice_submitted',
      title: 'Invoice submitted',
      body: `${sub.supplier_name} has been sent for review.`,
      sourceType: 'invoice_submission',
      sourceId: id,
      href: '/portal/invoices',
    });
  }

  return { error: error?.message ?? null };
}

/* ------------------------------------------------------------------ */
/*  updateInvoiceSubmissionAttachment                                   */
/* ------------------------------------------------------------------ */

export async function updateInvoiceSubmissionAttachment(
  id: string,
  attachmentUrl: string,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'create', 'workflows');
    if (role !== 'finance_user') {
      await enforcePortalPermissionForContext({ orgId, role, user }, 'documents', 'upload');
    }
  } catch (e) {
    return { error: portalPermissionMessage(e) };
  }

  const supabase = await createClient();

  const { data: sub, error: fetchErr } = await supabase
    .from('invoice_submissions')
    .select('id, organisation_id, submitted_by')
    .eq('id', id)
    .single();

  if (fetchErr || !sub) return { error: 'Submission not found.' };
  if (sub.organisation_id !== orgId) return { error: 'Not in your organisation.' };
  if (sub.submitted_by !== user.id) return { error: 'You can only update your own submissions.' };

  const admin = createAdminClient();
  const { error } = await admin
    .from('invoice_submissions')
    .update({ attachment_url: attachmentUrl })
    .eq('id', id)
    .eq('organisation_id', orgId);

  return { error: error?.message ?? null };
}

/* ------------------------------------------------------------------ */
/*  listInvoiceSubmissions                                             */
/* ------------------------------------------------------------------ */

export async function listInvoiceSubmissions(
  orgId: string,
  filters?: { status?: string; page?: number; pageSize?: number },
): Promise<{ data: InvoiceSubmissionRow[]; total: number; error: string | null }> {
  const { role, user } = await getActiveOrg();
  const supabase = await createClient();

  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('invoice_submissions')
    .select(
      `*, 
       submitter:profiles!invoice_submissions_submitted_by_fkey(full_name),
       reviewer:profiles!invoice_submissions_reviewed_by_fkey(full_name),
       budget:budgets(name),
       fund:funds(name),
       account:accounts(name)`,
      { count: 'exact' },
    )
    .eq('organisation_id', orgId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (isInvoiceStatus(filters?.status)) {
    query = query.eq('status', filters.status);
  }

  // Non-admin/treasurer only see their own
  if (role !== 'admin' && role !== 'treasurer') {
    query = query.eq('submitted_by', user.id);
  }

  const { data, count, error } = await query;

  if (error) return { data: [], total: 0, error: error.message };

  const rows: InvoiceSubmissionRow[] = (data ?? []).map((r: Record<string, unknown>) => mapInvoiceSubmissionRow(r));

  return { data: rows, total: count ?? 0, error: null };
}

/* ------------------------------------------------------------------ */
/*  reviewInvoiceSubmission                                            */
/* ------------------------------------------------------------------ */

export async function reviewInvoiceSubmission(
  id: string,
  decision: 'approved' | 'rejected',
  note?: string,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'approve', 'workflows');
    await enforcePortalPermissionForContext({ orgId, role, user }, 'submit_invoices', 'approve');
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : 'Permission denied' };
  }

  const supabase = await createClient();

  // Verify the submission exists and is ready for review.
  const { data: sub, error: fetchErr } = await supabase
    .from('invoice_submissions')
    .select('id, status, organisation_id, submitted_by, supplier_name')
    .eq('id', id)
    .single();

  if (fetchErr || !sub) return { error: 'Submission not found.' };
  if (sub.organisation_id !== orgId) return { error: 'Not in your organisation.' };
  if (!['submitted', 'under_review'].includes(sub.status)) return { error: `Cannot review a submission with status "${sub.status}".` };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('invoice_submissions')
    .update({
      status: decision,
      reviewed_by: user.id,
      reviewed_at: now,
      review_note: note ?? null,
      admin_note: note ?? null,
      last_status_changed_at: now,
    })
    .eq('id', id);

  if (!error) {
    await logAuditEvent({
      orgId,
      userId: user.id,
      action: `${decision}_invoice_submission`,
      entityType: 'invoice_submission',
      entityId: id,
      metadata: { note },
    });
    await createPortalNotification({
      workspaceId: orgId,
      userId: sub.submitted_by,
      type: decision === 'approved' ? 'invoice_approved' : 'invoice_rejected',
      title: `Invoice ${decision}`,
      body: `${sub.supplier_name} was ${decision}.`,
      sourceType: 'invoice_submission',
      sourceId: id,
      href: '/portal/invoices',
    });
  }

  return { error: error?.message ?? null };
}

export async function markInvoiceUnderReview(
  id: string,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'approve', 'workflows');
    await enforcePortalPermissionForContext({ orgId, role, user }, 'submit_invoices', 'approve');
  } catch (e) {
    return { error: portalPermissionMessage(e) };
  }

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data: sub, error: fetchErr } = await supabase
    .from('invoice_submissions')
    .select('id, status, organisation_id, submitted_by, supplier_name')
    .eq('id', id)
    .single();

  if (fetchErr || !sub) return { error: 'Submission not found.' };
  if (sub.organisation_id !== orgId) return { error: 'Not in your organisation.' };
  if (sub.status !== 'submitted') return { error: 'Only submitted invoices can be moved under review.' };

  const { error } = await supabase
    .from('invoice_submissions')
    .update({
      status: 'under_review',
      under_review_at: now,
      last_status_changed_at: now,
    })
    .eq('id', id);

  if (!error) {
    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'mark_invoice_under_review',
      entityType: 'invoice_submission',
      entityId: id,
    });
    await createPortalNotification({
      workspaceId: orgId,
      userId: sub.submitted_by,
      type: 'invoice_under_review',
      title: 'Invoice under review',
      body: `${sub.supplier_name} is now being reviewed.`,
      sourceType: 'invoice_submission',
      sourceId: id,
      href: '/portal/invoices',
    });
  }

  return { error: error?.message ?? null };
}

export async function requestInvoiceChanges(
  id: string,
  note: string,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'approve', 'workflows');
    await enforcePortalPermissionForContext({ orgId, role, user }, 'submit_invoices', 'approve');
  } catch (e) {
    return { error: portalPermissionMessage(e) };
  }

  if (!note.trim()) return { error: 'Tell the submitter what needs changing.' };

  const supabase = await createClient();
  const { data: sub, error: fetchErr } = await supabase
    .from('invoice_submissions')
    .select('id, status, organisation_id, submitted_by, supplier_name')
    .eq('id', id)
    .single();

  if (fetchErr || !sub) return { error: 'Submission not found.' };
  if (sub.organisation_id !== orgId) return { error: 'Not in your organisation.' };
  if (!['submitted', 'under_review'].includes(sub.status)) return { error: 'Only submitted or under-review invoices can be sent back for changes.' };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('invoice_submissions')
    .update({
      status: 'change_requested',
      change_requested_at: now,
      reviewed_by: user.id,
      reviewed_at: now,
      request_changes_note: note.trim(),
      review_note: note.trim(),
      last_status_changed_at: now,
    })
    .eq('id', id);

  if (!error) {
    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'request_invoice_changes',
      entityType: 'invoice_submission',
      entityId: id,
      metadata: { note },
    });
    await createPortalNotification({
      workspaceId: orgId,
      userId: sub.submitted_by,
      type: 'invoice_changes_requested',
      title: 'Invoice changes requested',
      body: note.trim(),
      sourceType: 'invoice_submission',
      sourceId: id,
      href: '/portal/invoices',
    });
  }

  return { error: error?.message ?? null };
}

export async function voidInvoiceSubmission(
  id: string,
  reason: string,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'approve', 'workflows');
    await enforcePortalPermissionForContext({ orgId, role, user }, 'submit_invoices', 'approve');
  } catch (e) {
    return { error: portalPermissionMessage(e) };
  }

  if (!reason.trim()) return { error: 'A void reason is required.' };

  const supabase = await createClient();
  const { data: sub, error: fetchErr } = await supabase
    .from('invoice_submissions')
    .select('id, status, organisation_id, submitted_by, supplier_name, bill_id')
    .eq('id', id)
    .single();

  if (fetchErr || !sub) return { error: 'Submission not found.' };
  if (sub.organisation_id !== orgId) return { error: 'Not in your organisation.' };
  if (['paid', 'voided'].includes(sub.status)) return { error: 'Paid or already voided invoices cannot be voided here.' };
  if (sub.bill_id) return { error: 'Void the linked supplier bill workflow before voiding this submission.' };

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('invoice_submissions')
    .update({
      status: 'voided',
      voided_at: now,
      void_reason: reason.trim(),
      reviewed_by: user.id,
      reviewed_at: now,
      last_status_changed_at: now,
    })
    .eq('id', id);

  if (!error) {
    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'void_invoice_submission',
      entityType: 'invoice_submission',
      entityId: id,
      metadata: { reason },
    });
    await createPortalNotification({
      workspaceId: orgId,
      userId: sub.submitted_by,
      type: 'invoice_voided',
      title: 'Invoice voided',
      body: reason.trim(),
      sourceType: 'invoice_submission',
      sourceId: id,
      href: '/portal/invoices',
    });
  }

  return { error: error?.message ?? null };
}

/* ------------------------------------------------------------------ */
/*  convertInvoiceToBill                                               */
/* ------------------------------------------------------------------ */

export async function convertInvoiceToBill(
  id: string,
  overrideAccountId?: string,
): Promise<{ billId: string | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'approve', 'workflows');
    await enforcePortalPermissionForContext({ orgId, role, user }, 'submit_invoices', 'approve');
  } catch (e) {
    return { billId: null, error: e instanceof PermissionError ? e.message : 'Permission denied' };
  }

  const admin = createAdminClient();

  // Fetch the approved submission
  const { data: sub, error: fetchErr } = await admin
    .from('invoice_submissions')
    .select('*')
    .eq('id', id)
    .eq('organisation_id', orgId)
    .single();

  if (fetchErr || !sub) return { billId: null, error: 'Submission not found.' };
  if (sub.status !== 'approved') return { billId: null, error: 'Only approved submissions can be converted to bills.' };

  let supplierId = sub.supplier_id as string | null;
  if (!supplierId) {
    const { data: existingSupplier } = await admin
      .from('suppliers')
      .select('id')
      .eq('organisation_id', orgId)
      .ilike('name', sub.supplier_name)
      .limit(1)
      .maybeSingle();

    supplierId = existingSupplier?.id ?? null;
  }

  if (!supplierId) {
    const { data: supplier, error: supplierErr } = await admin
      .from('suppliers')
      .insert({
        organisation_id: orgId,
        name: sub.supplier_name,
      })
      .select('id')
      .single();
    if (supplierErr || !supplier) return { billId: null, error: supplierErr?.message ?? 'Failed to create supplier.' };
    supplierId = supplier.id;
  }

  const accountId = overrideAccountId || sub.account_id;
  if (!accountId) return { billId: null, error: 'Choose an expense account before converting this invoice.' };

  // Create a bill
  const { data: bill, error: billErr } = await admin
    .from('bills')
    .insert({
      organisation_id: orgId,
      supplier_id: supplierId,
      bill_number: sub.invoice_number || `SUB-${id.slice(0, 8)}`,
      bill_date: sub.invoice_date,
      due_date: sub.invoice_date,
      status: 'draft',
      total_pence: sub.amount_pence,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (billErr || !bill) return { billId: null, error: billErr?.message ?? 'Failed to create bill.' };

  const { error: lineErr } = await admin.from('bill_lines').insert({
    bill_id: bill.id,
    account_id: accountId,
    fund_id: sub.fund_id ?? null,
    description: sub.description || sub.supplier_name,
    amount_pence: sub.amount_pence,
  });
  if (lineErr) return { billId: null, error: lineErr.message };

  await admin
    .from('invoice_submissions')
    .update({ bill_id: bill.id, last_status_changed_at: new Date().toISOString() })
    .eq('id', id);

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'convert_invoice_to_bill',
    entityType: 'invoice_submission',
    entityId: id,
    metadata: { billId: bill.id },
  });
  await createPortalNotification({
    workspaceId: orgId,
    userId: sub.submitted_by,
    type: 'invoice_scheduled',
    title: 'Invoice converted for payment',
    body: `${sub.supplier_name} has been converted into a supplier invoice.`,
    sourceType: 'invoice_submission',
    sourceId: id,
    href: '/portal/invoices',
  });

  return { billId: bill.id, error: null };
}

export async function linkInvoiceSubmissionToPaymentState(
  billId: string,
): Promise<{ error: string | null }> {
  const { orgId, role } = await getActiveOrg();
  try {
    assertCanPerform(role, 'read', 'workflows');
  } catch (e) {
    return { error: portalPermissionMessage(e) };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc('sync_invoice_submission_payment_state', {
    p_bill_id: billId,
  });

  if (error) return { error: error.message };

  const { data: sub } = await admin
    .from('invoice_submissions')
    .select('id')
    .eq('organisation_id', orgId)
    .eq('bill_id', billId)
    .maybeSingle();

  return { error: sub ? null : 'No invoice submission is linked to this bill.' };
}

/* ================================================================== */
/*  EXPENSE REQUESTS                                                   */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  createExpenseRequest                                               */
/* ------------------------------------------------------------------ */

export async function createExpenseRequest(params: {
  spendDate: string;
  amountPence: number;
  fundId?: string | null;
  accountId: string;
  description: string;
  receiptUrl?: string | null;
}): Promise<{ data: { id: string } | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'create', 'workflows');
    await enforcePortalPermissionForContext({ orgId, role, user }, 'expenses', 'submit');
  } catch (e) {
    return { data: null, error: e instanceof PermissionError ? e.message : 'Permission denied' };
  }

  if (!params.spendDate) return { data: null, error: 'Spend date is required.' };
  if (!params.amountPence || params.amountPence <= 0) return { data: null, error: 'Amount must be positive.' };
  if (!params.accountId) return { data: null, error: 'Expense account is required.' };
  if (!params.description?.trim()) return { data: null, error: 'Description is required.' };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('expense_requests')
    .insert({
      organisation_id: orgId,
      submitted_by: user.id,
      spend_date: params.spendDate,
      amount_pence: params.amountPence,
      fund_id: params.fundId ?? null,
      account_id: params.accountId,
      description: params.description.trim(),
      receipt_url: params.receiptUrl ?? null,
    })
    .select('id')
    .single();

  if (error) return { data: null, error: error.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'create_expense_request',
    entityType: 'expense_request',
    entityId: data.id,
  });

  return { data: { id: data.id }, error: null };
}

/* ------------------------------------------------------------------ */
/*  listExpenseRequests                                                */
/* ------------------------------------------------------------------ */

export async function listExpenseRequests(
  orgId: string,
  filters?: { status?: string; page?: number; pageSize?: number },
): Promise<{ data: ExpenseRequestRow[]; total: number; error: string | null }> {
  const { role, user } = await getActiveOrg();
  const supabase = await createClient();

  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 25;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('expense_requests')
    .select(
      `*, 
       submitter:profiles!expense_requests_submitted_by_fkey(full_name),
       reviewer:profiles!expense_requests_reviewed_by_fkey(full_name),
       fund:funds(name),
       account:accounts(name)`,
      { count: 'exact' },
    )
    .eq('organisation_id', orgId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  if (role !== 'admin' && role !== 'treasurer') {
    query = query.eq('submitted_by', user.id);
  }

  const { data, count, error } = await query;

  if (error) return { data: [], total: 0, error: error.message };

  // Fetch receipt compliance days from settings
  const { data: settings } = await supabase
    .from('organisation_settings')
    .select('receipt_compliance_days')
    .eq('organisation_id', orgId)
    .single();

  const complianceDays = settings?.receipt_compliance_days ?? 7;
  const now = Date.now();

  const rows: ExpenseRequestRow[] = (data ?? []).map((r: Record<string, unknown>) => {
    const submitter = r.submitter as { full_name: string | null } | null;
    const reviewer = r.reviewer as { full_name: string | null } | null;
    const fund = r.fund as { name: string } | null;
    const account = r.account as { name: string } | null;

    const receiptUrl = (r.receipt_url as string) ?? null;
    const createdAt = r.created_at as string;
    const receiptLate = !receiptUrl && (now - new Date(createdAt).getTime()) > complianceDays * 24 * 60 * 60 * 1000;

    return {
      id: r.id as string,
      organisationId: r.organisation_id as string,
      submittedBy: r.submitted_by as string,
      submitterName: submitter?.full_name ?? null,
      spendDate: r.spend_date as string,
      amountPence: r.amount_pence as number,
      fundId: (r.fund_id as string) ?? null,
      fundName: fund?.name ?? null,
      accountId: r.account_id as string,
      accountName: account?.name ?? null,
      description: r.description as string,
      receiptUrl,
      receiptLate,
      status: r.status as ExpenseRequestRow['status'],
      reviewedBy: (r.reviewed_by as string) ?? null,
      reviewerName: reviewer?.full_name ?? null,
      reviewedAt: (r.reviewed_at as string) ?? null,
      reviewNote: (r.review_note as string) ?? null,
      cashSpendId: (r.cash_spend_id as string) ?? null,
      createdAt,
    };
  });

  return { data: rows, total: count ?? 0, error: null };
}

/* ------------------------------------------------------------------ */
/*  reviewExpenseRequest                                               */
/* ------------------------------------------------------------------ */

export async function reviewExpenseRequest(
  id: string,
  decision: 'approved' | 'rejected',
  note?: string,
): Promise<{ error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'approve', 'workflows');
    await enforcePortalPermissionForContext({ orgId, role, user }, 'expenses', 'approve');
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : 'Permission denied' };
  }

  const supabase = await createClient();

  const { data: req, error: fetchErr } = await supabase
    .from('expense_requests')
    .select('id, status, organisation_id, submitted_by, description')
    .eq('id', id)
    .single();

  if (fetchErr || !req) return { error: 'Expense request not found.' };
  if (req.organisation_id !== orgId) return { error: 'Not in your organisation.' };
  if (req.status !== 'pending') return { error: `Cannot review a request with status "${req.status}".` };

  const { error } = await supabase
    .from('expense_requests')
    .update({
      status: decision,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_note: note ?? null,
    })
    .eq('id', id);

  if (!error) {
    await logAuditEvent({
      orgId,
      userId: user.id,
      action: `${decision}_expense_request`,
      entityType: 'expense_request',
      entityId: id,
      metadata: { note },
    });
    await createPortalNotification({
      workspaceId: orgId,
      userId: req.submitted_by,
      type: decision === 'approved' ? 'expense_approved' : 'expense_rejected',
      title: `Expense ${decision}`,
      body: `${req.description} was ${decision}.`,
      sourceType: 'expense_request',
      sourceId: id,
      href: '/portal/expenses',
    });
  }

  return { error: error?.message ?? null };
}

/* ------------------------------------------------------------------ */
/*  convertExpenseToCashSpend                                          */
/* ------------------------------------------------------------------ */

export async function convertExpenseToCashSpend(
  id: string,
): Promise<{ cashSpendId: string | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'approve', 'workflows');
    await enforcePortalPermissionForContext({ orgId, role, user }, 'expenses', 'approve');
  } catch (e) {
    return { cashSpendId: null, error: e instanceof PermissionError ? e.message : 'Permission denied' };
  }

  const admin = createAdminClient();

  const { data: req, error: fetchErr } = await admin
    .from('expense_requests')
    .select('*')
    .eq('id', id)
    .eq('organisation_id', orgId)
    .single();

  if (fetchErr || !req) return { cashSpendId: null, error: 'Expense request not found.' };
  if (req.status !== 'approved') return { cashSpendId: null, error: 'Only approved requests can be converted.' };

  // Create cash spend
  const { data: spend, error: spendErr } = await admin
    .from('cash_spends')
    .insert({
      organisation_id: orgId,
      spend_date: req.spend_date,
      paid_to: req.description,
      spent_by: req.submitted_by,
      description: req.description,
      receipt_url: req.receipt_url ?? null,
      fund_id: req.fund_id ?? null,
      expense_account_id: req.account_id,
      amount_pence: req.amount_pence,
      status: 'draft',
    })
    .select('id')
    .single();

  if (spendErr || !spend) return { cashSpendId: null, error: spendErr?.message ?? 'Failed to create cash spend.' };

  // Mark request as converted
  await admin
    .from('expense_requests')
    .update({ status: 'converted', cash_spend_id: spend.id })
    .eq('id', id);

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'convert_expense_to_cash_spend',
    entityType: 'expense_request',
    entityId: id,
    metadata: { cashSpendId: spend.id },
  });
  await createPortalNotification({
    workspaceId: orgId,
    userId: req.submitted_by,
    type: 'expense_approved',
    title: 'Expense converted to cash spend',
    body: `${req.description} is ready in cash management.`,
    sourceType: 'expense_request',
    sourceId: id,
    href: '/portal/expenses',
  });

  return { cashSpendId: spend.id, error: null };
}

/* ================================================================== */
/*  APPROVAL COUNTS                                                    */
/* ================================================================== */

export async function getApprovalCounts(
  orgId: string,
): Promise<ApprovalCounts> {
  const { user } = await getActiveOrg();
  const supabase = await createClient();

  const [invRes, expRes, expAllRes, msgRes] = await Promise.all([
    supabase
      .from('invoice_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', orgId)
      .in('status', ['submitted', 'under_review']),
    supabase
      .from('expense_requests')
      .select('id', { count: 'exact', head: true })
      .eq('organisation_id', orgId)
      .eq('status', 'pending'),
    supabase
      .from('expense_requests')
      .select('id, receipt_url, created_at')
      .eq('organisation_id', orgId)
      .is('receipt_url', null),
    supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', user.id),
  ]);

  // Compute late receipts dynamically
  const { data: settings } = await supabase
    .from('organisation_settings')
    .select('receipt_compliance_days')
    .eq('organisation_id', orgId)
    .single();
  const complianceDays = settings?.receipt_compliance_days ?? 7;
  const now = Date.now();
  const lateReceipts = (expAllRes.data ?? []).filter(
    (r) => (now - new Date(r.created_at).getTime()) > complianceDays * 24 * 60 * 60 * 1000,
  ).length;

  // Count unread messages across all conversations the user participates in
  const conversationIds = (msgRes.data ?? []).map((p) => p.conversation_id);
  let unreadMessages = 0;
  if (conversationIds.length > 0) {
    // Get read positions
    const { data: reads } = await supabase
      .from('message_reads')
      .select('conversation_id, last_read_at')
      .eq('user_id', user.id)
      .in('conversation_id', conversationIds);

    const readMap = new Map((reads ?? []).map((r) => [r.conversation_id, r.last_read_at]));

    for (const cId of conversationIds) {
      const lastRead = readMap.get(cId);
      let msgQuery = supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', cId)
        .neq('sender_id', user.id);

      if (lastRead) {
        msgQuery = msgQuery.gt('created_at', lastRead);
      }

      const { count } = await msgQuery;
      unreadMessages += count ?? 0;
    }
  }

  return {
    pendingInvoices: invRes.count ?? 0,
    pendingExpenses: expRes.count ?? 0,
    lateReceipts,
    unreadMessages,
  };
}

export async function listPortalInvoiceFormOptions(): Promise<{ data: PortalInvoiceFormOptions; error: string | null }> {
  const { orgId, role, user } = await getActiveOrg();
  const supabase = await createClient();

  const [suppliersRes, fundsRes, budgetAssignmentsRes, categoryAssignmentsRes] = await Promise.all([
    supabase.from('suppliers').select('id, name').eq('organisation_id', orgId).eq('is_active', true).order('name'),
    supabase.from('user_fund_assignments').select('fund_id, funds(id, name)').eq('workspace_id', orgId).eq('user_id', user.id).eq('can_submit_against', true),
    supabase.from('user_budget_assignments').select('budget_id, can_submit_against, budgets(id, name, year)').eq('workspace_id', orgId).eq('user_id', user.id).eq('can_submit_against', true),
    supabase.from('user_category_assignments').select('category_id, accounts(id, code, name)').eq('workspace_id', orgId).eq('user_id', user.id).eq('can_submit_against', true),
  ]);

  const funds = (fundsRes.data ?? [])
    .map((row) => {
      const fund = Array.isArray(row.funds) ? row.funds[0] : row.funds;
      return fund ? { id: fund.id, name: fund.name } : null;
    })
    .filter((row): row is { id: string; name: string } => Boolean(row));

  const budgets = (budgetAssignmentsRes.data ?? [])
    .map((row) => {
      const budget = Array.isArray(row.budgets) ? row.budgets[0] : row.budgets;
      return budget ? { id: budget.id, name: budget.name, year: budget.year ?? null, canSubmitAgainst: Boolean(row.can_submit_against) } : null;
    })
    .filter((row): row is { id: string; name: string; year: number | null; canSubmitAgainst: boolean } => Boolean(row));

  const expenseAccounts = (categoryAssignmentsRes.data ?? [])
    .map((row) => {
      const account = Array.isArray(row.accounts) ? row.accounts[0] : row.accounts;
      return account ? { id: account.id, code: account.code, name: account.name } : null;
    })
    .filter((row): row is { id: string; code: string; name: string } => Boolean(row));

  if ((role === 'admin' || role === 'treasurer') && funds.length === 0) {
    const { data } = await supabase.from('funds').select('id, name').eq('organisation_id', orgId).eq('is_active', true).order('name');
    funds.push(...((data ?? []) as { id: string; name: string }[]));
  }

  if ((role === 'admin' || role === 'treasurer') && expenseAccounts.length === 0) {
    const { data } = await supabase
      .from('accounts')
      .select('id, code, name')
      .eq('organisation_id', orgId)
      .eq('type', 'expense')
      .eq('is_active', true)
      .eq('available_in_invoices', true)
      .order('code');
    expenseAccounts.push(...((data ?? []) as { id: string; code: string; name: string }[]));
  }

  return {
    data: {
      suppliers: (suppliersRes.data ?? []) as { id: string; name: string }[],
      funds,
      budgets,
      expenseAccounts,
    },
    error: suppliersRes.error?.message
      ?? fundsRes.error?.message
      ?? budgetAssignmentsRes.error?.message
      ?? categoryAssignmentsRes.error?.message
      ?? null,
  };
}

export async function uploadPortalInvoiceAttachment(
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
  } catch (e) {
    return { url: null, error: portalPermissionMessage(e) };
  }

  const file = formData.get('file');
  if (!(file instanceof File)) return { url: null, error: 'No file provided.' };
  if (file.size === 0) return { url: null, error: 'The selected file is empty.' };
  if (file.size > 10 * 1024 * 1024) return { url: null, error: 'Files must be smaller than 10MB.' };

  const supabase = await createClient();
  const { data: sub, error: fetchErr } = await supabase
    .from('invoice_submissions')
    .select('id, organisation_id, submitted_by, status')
    .eq('id', submissionId)
    .single();

  if (fetchErr || !sub) return { url: null, error: 'Submission not found.' };
  if (sub.organisation_id !== orgId || sub.submitted_by !== user.id) return { url: null, error: 'You can only upload files for your own invoices.' };
  if (!['draft', 'change_requested'].includes(sub.status)) return { url: null, error: 'Attachments can only be changed before submission.' };

  const safeBase = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'invoice';
  const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const storagePath = `${orgId}/invoice-submissions/${submissionId}/${Date.now()}-${safeBase}${ext ? `.${ext}` : ''}`;
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
  const { error: attachmentErr } = await admin.from('invoice_submission_attachments').insert({
    organisation_id: orgId,
    submission_id: submissionId,
    storage_path: storagePath,
    file_name: file.name,
    content_type: file.type || 'application/octet-stream',
    size_bytes: file.size,
    uploaded_by: user.id,
  });

  if (attachmentErr) return { url: null, error: attachmentErr.message };

  const { error: updateErr } = await admin
    .from('invoice_submissions')
    .update({
      attachment_url: url,
      attachment_path: storagePath,
      attachment_file_name: file.name,
      attachment_content_type: file.type || 'application/octet-stream',
      attachment_size_bytes: file.size,
      attachment_uploaded_by: user.id,
      attachment_uploaded_at: new Date().toISOString(),
    })
    .eq('id', submissionId)
    .eq('organisation_id', orgId);

  if (updateErr) return { url: null, error: updateErr.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'upload_invoice_submission_attachment',
    entityType: 'invoice_submission',
    entityId: submissionId,
    metadata: {
      storagePath,
      fileName: file.name,
      fileSize: file.size,
    },
  });

  return { url, error: null };
}

/* ================================================================== */
/*  FILE UPLOADS                                                       */
/* ================================================================== */

export async function uploadWorkflowFile(
  formData: FormData,
  bucket: 'invoice-submissions' | 'expense-receipts' | 'internal-messages',
  entityId: string,
): Promise<{ url: string | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId } = await getActiveOrg();

  const file = formData.get('file') as File | null;
  if (!file) return { url: null, error: 'No file provided.' };

  const supabase = await createClient();
  const ext = file.name.split('.').pop() ?? 'pdf';
  const path = `${orgId}/${entityId}/${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: false });

  if (uploadErr) return { url: null, error: uploadErr.message };

  const { data: urlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  return { url: urlData?.publicUrl ?? null, error: null };
}
