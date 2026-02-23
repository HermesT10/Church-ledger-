'use server';

import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { assertWriteAllowed } from '@/lib/demo';
import { logAuditEvent } from '@/lib/audit';
import type {
  InvoiceSubmissionRow,
  ExpenseRequestRow,
  ApprovalCounts,
} from './types';

/* ================================================================== */
/*  INVOICE SUBMISSIONS                                                */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  createInvoiceSubmission                                            */
/* ------------------------------------------------------------------ */

export async function createInvoiceSubmission(params: {
  supplierName: string;
  supplierId?: string | null;
  invoiceNumber?: string | null;
  invoiceDate: string;
  amountPence: number;
  fundId?: string | null;
  accountId?: string | null;
  description?: string | null;
  attachmentUrl?: string | null;
}): Promise<{ data: { id: string } | null; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'create', 'workflows');
  } catch (e) {
    return { data: null, error: e instanceof PermissionError ? e.message : 'Permission denied' };
  }

  if (!params.supplierName?.trim()) return { data: null, error: 'Supplier name is required.' };
  if (!params.invoiceDate) return { data: null, error: 'Invoice date is required.' };
  if (!params.amountPence || params.amountPence <= 0) return { data: null, error: 'Amount must be positive.' };

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
      fund_id: params.fundId ?? null,
      account_id: params.accountId ?? null,
      description: params.description ?? null,
      attachment_url: params.attachmentUrl ?? null,
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

  return { data: { id: data.id }, error: null };
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
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : 'Permission denied' };
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

  const { error } = await supabase
    .from('invoice_submissions')
    .update({ attachment_url: attachmentUrl })
    .eq('id', id);

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

  // Non-admin/treasurer only see their own
  if (role !== 'admin' && role !== 'treasurer') {
    query = query.eq('submitted_by', user.id);
  }

  const { data, count, error } = await query;

  if (error) return { data: [], total: 0, error: error.message };

  const rows: InvoiceSubmissionRow[] = (data ?? []).map((r: Record<string, unknown>) => {
    const submitter = r.submitter as { full_name: string | null } | null;
    const reviewer = r.reviewer as { full_name: string | null } | null;
    const fund = r.fund as { name: string } | null;
    const account = r.account as { name: string } | null;
    return {
      id: r.id as string,
      organisationId: r.organisation_id as string,
      submittedBy: r.submitted_by as string,
      submitterName: submitter?.full_name ?? null,
      supplierName: r.supplier_name as string,
      supplierId: (r.supplier_id as string) ?? null,
      invoiceNumber: (r.invoice_number as string) ?? null,
      invoiceDate: r.invoice_date as string,
      amountPence: r.amount_pence as number,
      fundId: (r.fund_id as string) ?? null,
      fundName: fund?.name ?? null,
      accountId: (r.account_id as string) ?? null,
      accountName: account?.name ?? null,
      description: (r.description as string) ?? null,
      attachmentUrl: (r.attachment_url as string) ?? null,
      status: r.status as InvoiceSubmissionRow['status'],
      reviewedBy: (r.reviewed_by as string) ?? null,
      reviewerName: reviewer?.full_name ?? null,
      reviewedAt: (r.reviewed_at as string) ?? null,
      reviewNote: (r.review_note as string) ?? null,
      billId: (r.bill_id as string) ?? null,
      createdAt: r.created_at as string,
    };
  });

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
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : 'Permission denied' };
  }

  const supabase = await createClient();

  // Verify the submission exists and is pending
  const { data: sub, error: fetchErr } = await supabase
    .from('invoice_submissions')
    .select('id, status, organisation_id')
    .eq('id', id)
    .single();

  if (fetchErr || !sub) return { error: 'Submission not found.' };
  if (sub.organisation_id !== orgId) return { error: 'Not in your organisation.' };
  if (sub.status !== 'pending') return { error: `Cannot review a submission with status "${sub.status}".` };

  const { error } = await supabase
    .from('invoice_submissions')
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
      action: `${decision}_invoice_submission`,
      entityType: 'invoice_submission',
      entityId: id,
      metadata: { note },
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

  // Use supplier_id if available, otherwise try to find or skip
  const supplierId = sub.supplier_id;
  const accountId = overrideAccountId || sub.account_id;

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

  // Create bill line if account is provided
  if (accountId) {
    await admin.from('bill_lines').insert({
      bill_id: bill.id,
      account_id: accountId,
      fund_id: sub.fund_id ?? null,
      description: sub.description || sub.supplier_name,
      amount_pence: sub.amount_pence,
    });
  }

  // Mark submission as converted
  await admin
    .from('invoice_submissions')
    .update({ status: 'converted', bill_id: bill.id })
    .eq('id', id);

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'convert_invoice_to_bill',
    entityType: 'invoice_submission',
    entityId: id,
    metadata: { billId: bill.id },
  });

  return { billId: bill.id, error: null };
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
  } catch (e) {
    return { error: e instanceof PermissionError ? e.message : 'Permission denied' };
  }

  const supabase = await createClient();

  const { data: req, error: fetchErr } = await supabase
    .from('expense_requests')
    .select('id, status, organisation_id')
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
      .eq('status', 'pending'),
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
