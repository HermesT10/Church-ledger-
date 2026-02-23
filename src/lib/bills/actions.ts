'use server';

import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { assertWriteAllowed } from '@/lib/demo';
import { invalidateOrgReportCache } from '@/lib/cache';
import { logAuditEvent } from '@/lib/audit';
import { isDateInLockedPeriod } from '@/lib/periods/actions';
import {
  buildJournalLinesFromBill,
  buildPaymentRunJournalLines,
} from './validation';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BillLineInput {
  account_id: string;
  fund_id: string | null;
  description: string;
  amount: string; // pounds string, e.g. "12.50"
}

/** Convert a pounds string to integer pence. */
function toPence(pounds: string): number {
  const n = parseFloat(pounds || '0');
  return Math.round(n * 100);
}

/* ------------------------------------------------------------------ */
/*  Approval event helper                                              */
/* ------------------------------------------------------------------ */

async function logApprovalEvent(params: {
  orgId: string;
  entityType: 'bill' | 'payment_run' | 'payroll_run';
  entityId: string;
  action: string;
  performedBy: string;
  notes?: string;
}) {
  const supabase = await createClient();
  await supabase.from('approval_events').insert({
    organisation_id: params.orgId,
    entity_type: params.entityType,
    entity_id: params.entityId,
    action: params.action,
    performed_by: params.performedBy,
    notes: params.notes ?? null,
  });
}

/* ------------------------------------------------------------------ */
/*  Duplicate invoice detection                                        */
/* ------------------------------------------------------------------ */

export async function checkDuplicateInvoice(
  supplierId: string,
  billNumber: string,
  excludeBillId?: string,
): Promise<{ isDuplicate: boolean; existingBillId?: string }> {
  if (!billNumber.trim()) return { isDuplicate: false };

  const supabase = await createClient();
  let query = supabase
    .from('bills')
    .select('id')
    .eq('supplier_id', supplierId)
    .eq('bill_number', billNumber.trim())
    .limit(1);

  if (excludeBillId) {
    query = query.neq('id', excludeBillId);
  }

  const { data } = await query;
  if (data && data.length > 0) {
    return { isDuplicate: true, existingBillId: data[0].id };
  }
  return { isDuplicate: false };
}

/* ------------------------------------------------------------------ */
/*  Fund balance warning for restricted funds                          */
/* ------------------------------------------------------------------ */

export async function checkBillFundWarning(params: {
  fundId: string;
  amountPence: number;
}): Promise<{ warning: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  // Check if fund is restricted
  const { data: fund } = await supabase
    .from('funds')
    .select('id, name, fund_type')
    .eq('id', params.fundId)
    .single();

  if (!fund || fund.fund_type !== 'restricted') {
    return { warning: null };
  }

  // Compute current balance from posted journal_lines
  const { data: balData } = await supabase
    .from('journal_lines')
    .select('debit_pence, credit_pence, journals!inner(status)')
    .eq('fund_id', params.fundId)
    .eq('journals.status', 'posted');

  let balancePence = 0;
  if (balData) {
    for (const row of balData) {
      balancePence += Number(row.credit_pence) - Number(row.debit_pence);
    }
  }

  const projectedBalance = balancePence - params.amountPence;
  if (projectedBalance < 0) {
    return {
      warning: `Restricted fund "${fund.name}" will be overspent by £${(Math.abs(projectedBalance) / 100).toFixed(2)} after this invoice.`,
    };
  }

  return { warning: null };
}

/* ================================================================== */
/*  SUPPLIER ACTIONS                                                   */
/* ================================================================== */

export async function listSuppliers(orgId: string, includeArchived = false) {
  const supabase = await createClient();
  let query = supabase
    .from('suppliers')
    .select('*')
    .eq('organisation_id', orgId);

  if (!includeArchived) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query.order('name');

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function archiveSupplier(
  supplierId: string,
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'bills'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();
  const { error } = await supabase
    .from('suppliers')
    .update({ is_active: false })
    .eq('id', supplierId);

  if (!error) {
    await logAuditEvent({
      orgId,
      userId: user.id,
      action: 'archive_supplier',
      entityType: 'supplier',
      entityId: supplierId,
    });
  }

  return { success: !error, error: error?.message ?? null };
}

export async function unarchiveSupplier(
  supplierId: string,
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { role } = await getActiveOrg();
  try { assertCanPerform(role, 'update', 'bills'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();
  const { error } = await supabase
    .from('suppliers')
    .update({ is_active: true })
    .eq('id', supplierId);

  return { success: !error, error: error?.message ?? null };
}

export async function createSupplier(
  orgId: string,
  payload: { name: string; email?: string; bank_details?: string }
) {
  await assertWriteAllowed();
  const { role } = await getActiveOrg();
  try { assertCanPerform(role, 'create', 'bills'); }
  catch (e) { return { data: null, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      organisation_id: orgId,
      name: payload.name.trim(),
      email: payload.email?.trim() || null,
      bank_details: payload.bank_details?.trim() || null,
    })
    .select()
    .single();

  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

/* ================================================================== */
/*  BILL ACTIONS                                                       */
/* ================================================================== */

export async function listBills(orgId: string, status?: string) {
  const supabase = await createClient();

  let query = supabase
    .from('bills')
    .select('*, suppliers(name)')
    .eq('organisation_id', orgId)
    .order('bill_date', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) return { data: null, error: error.message };
  return { data, error: null };
}

export async function getBill(billId: string) {
  const supabase = await createClient();

  const [{ data: bill, error: billErr }, { data: lines, error: linesErr }] =
    await Promise.all([
      supabase
        .from('bills')
        .select('*, suppliers(id, name)')
        .eq('id', billId)
        .single(),
      supabase
        .from('bill_lines')
        .select('*')
        .eq('bill_id', billId)
        .order('id'),
    ]);

  if (billErr) return { bill: null, lines: null, error: billErr.message };
  if (linesErr) return { bill, lines: null, error: linesErr.message };
  return { bill, lines, error: null };
}

/* ------------------------------------------------------------------ */
/*  Create Bill                                                        */
/* ------------------------------------------------------------------ */

export async function createBill(formData: FormData) {
  await assertWriteAllowed();
  const { orgId, user } = await getActiveOrg();

  const supplierId = formData.get('supplier_id') as string;
  const billNumber = (formData.get('bill_number') as string)?.trim() || null;
  const billDate = formData.get('bill_date') as string;
  const dueDate = (formData.get('due_date') as string) || null;
  const totalStr = formData.get('total') as string;
  const linesJson = formData.get('lines') as string;

  if (!supplierId || !billDate || !totalStr) {
    redirect('/bills/new?error=' + encodeURIComponent('Supplier, date and total are required.'));
  }

  const totalPence = toPence(totalStr);
  if (totalPence <= 0) {
    redirect('/bills/new?error=' + encodeURIComponent('Total must be greater than zero.'));
  }

  let lines: BillLineInput[];
  try {
    lines = JSON.parse(linesJson || '[]');
  } catch {
    redirect('/bills/new?error=' + encodeURIComponent('Invalid line data.'));
  }

  if (lines.length === 0) {
    redirect('/bills/new?error=' + encodeURIComponent('At least one bill line is required.'));
  }

  // Validate line totals
  const lineSum = lines.reduce((s, l) => s + toPence(l.amount), 0);
  if (lineSum !== totalPence) {
    redirect(
      '/bills/new?error=' +
        encodeURIComponent(
          `Line totals (${(lineSum / 100).toFixed(2)}) do not match bill total (${(totalPence / 100).toFixed(2)}).`
        )
    );
  }

  const supabase = await createClient();

  // 1. Insert bill
  const { data: bill, error: billErr } = await supabase
    .from('bills')
    .insert({
      organisation_id: orgId,
      supplier_id: supplierId,
      bill_number: billNumber,
      bill_date: billDate,
      due_date: dueDate,
      total_pence: totalPence,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (billErr || !bill) {
    redirect(
      '/bills/new?error=' +
        encodeURIComponent(billErr?.message ?? 'Failed to create bill.')
    );
  }

  // 2. Insert lines
  const rows = lines.map((line) => ({
    bill_id: bill.id,
    account_id: line.account_id,
    fund_id: line.fund_id || null,
    description: line.description?.trim() || null,
    amount_pence: toPence(line.amount),
  }));

  const { error: linesErr } = await supabase.from('bill_lines').insert(rows);

  if (linesErr) {
    // Clean up the bill if lines failed
    await supabase.from('bills').delete().eq('id', bill.id);
    redirect('/bills/new?error=' + encodeURIComponent(linesErr.message));
  }

  // Log creation event
  await logApprovalEvent({
    orgId,
    entityType: 'bill',
    entityId: bill.id,
    action: 'created',
    performedBy: user.id,
  });

  redirect(`/bills/${bill.id}`);
}

/* ------------------------------------------------------------------ */
/*  Update Bill (draft only)                                           */
/* ------------------------------------------------------------------ */

export async function updateBill(formData: FormData) {
  await assertWriteAllowed();
  const { orgId } = await getActiveOrg();
  const id = formData.get('id') as string;
  const supplierId = formData.get('supplier_id') as string;
  const billNumber = (formData.get('bill_number') as string)?.trim() || null;
  const billDate = formData.get('bill_date') as string;
  const dueDate = (formData.get('due_date') as string) || null;
  const totalStr = formData.get('total') as string;
  const linesJson = formData.get('lines') as string;

  if (!id || !supplierId || !billDate || !totalStr) {
    redirect(`/bills/${id ?? ''}?error=` + encodeURIComponent('Required fields missing.'));
  }

  const totalPence = toPence(totalStr);

  let lines: BillLineInput[];
  try {
    lines = JSON.parse(linesJson || '[]');
  } catch {
    redirect(`/bills/${id}?error=` + encodeURIComponent('Invalid line data.'));
  }

  const lineSum = lines.reduce((s, l) => s + toPence(l.amount), 0);
  if (lineSum !== totalPence) {
    redirect(
      `/bills/${id}?error=` +
        encodeURIComponent(
          `Line totals (${(lineSum / 100).toFixed(2)}) do not match bill total (${(totalPence / 100).toFixed(2)}).`
        )
    );
  }

  const supabase = await createClient();

  // 1. Update bill header
  const { error: billErr } = await supabase
    .from('bills')
    .update({
      supplier_id: supplierId,
      bill_number: billNumber,
      bill_date: billDate,
      due_date: dueDate,
      total_pence: totalPence,
    })
    .eq('id', id);

  if (billErr) {
    redirect(`/bills/${id}?error=` + encodeURIComponent(billErr.message));
  }

  // 2. Replace lines: delete old, insert new
  await supabase.from('bill_lines').delete().eq('bill_id', id);

  const rows = lines.map((line) => ({
    bill_id: id,
    account_id: line.account_id,
    fund_id: line.fund_id || null,
    description: line.description?.trim() || null,
    amount_pence: toPence(line.amount),
  }));

  const { error: insErr } = await supabase.from('bill_lines').insert(rows);

  if (insErr) {
    redirect(`/bills/${id}?error=` + encodeURIComponent(insErr.message));
  }

  redirect(`/bills/${id}`);
}

/* ------------------------------------------------------------------ */
/*  Approve Bill (draft → approved)                                    */
/* ------------------------------------------------------------------ */

export async function approveBill(formData: FormData) {
  await assertWriteAllowed();
  const { orgId, user } = await getActiveOrg();
  const id = formData.get('id') as string;
  if (!id) redirect('/bills');

  const supabase = await createClient();

  // Fetch the bill to check date for period lock
  const { data: bill } = await supabase
    .from('bills')
    .select('bill_date, status')
    .eq('id', id)
    .single();

  if (!bill) {
    redirect(`/bills/${id}?error=` + encodeURIComponent('Bill not found.'));
  }

  if (bill.status !== 'draft') {
    redirect(`/bills/${id}?error=` + encodeURIComponent('Only draft invoices can be approved.'));
  }

  // Period lock check
  const locked = await isDateInLockedPeriod(bill.bill_date);
  if (locked) {
    redirect(`/bills/${id}?error=` + encodeURIComponent('Cannot approve: invoice date falls in a locked financial period.'));
  }

  const { error } = await supabase
    .from('bills')
    .update({ status: 'approved' })
    .eq('id', id);

  if (error) {
    redirect(`/bills/${id}?error=` + encodeURIComponent(error.message));
  }

  // Log approval event
  await logApprovalEvent({
    orgId,
    entityType: 'bill',
    entityId: id,
    action: 'approved',
    performedBy: user.id,
  });

  redirect(`/bills/${id}`);
}

/* ------------------------------------------------------------------ */
/*  Post Bill → creates journal and posts it                           */
/* ------------------------------------------------------------------ */

export async function postBill(formData: FormData) {
  await assertWriteAllowed();
  const { orgId, user } = await getActiveOrg();
  const id = formData.get('id') as string;
  if (!id) redirect('/bills');

  const supabase = await createClient();
  const admin = createAdminClient();

  // 1. Fetch bill + lines
  const { data: bill, error: billErr } = await supabase
    .from('bills')
    .select('*, suppliers(name)')
    .eq('id', id)
    .single();

  if (billErr || !bill) {
    redirect(`/bills/${id}?error=` + encodeURIComponent(billErr?.message ?? 'Bill not found.'));
  }

  if (bill.status !== 'approved') {
    redirect(`/bills/${id}?error=` + encodeURIComponent('Invoice must be approved before posting.'));
  }

  // Period lock check
  const locked = await isDateInLockedPeriod(bill.bill_date);
  if (locked) {
    redirect(`/bills/${id}?error=` + encodeURIComponent('Cannot post: invoice date falls in a locked financial period.'));
  }

  const { data: billLines, error: linesErr } = await supabase
    .from('bill_lines')
    .select('*')
    .eq('bill_id', id);

  if (linesErr || !billLines || billLines.length === 0) {
    redirect(`/bills/${id}?error=` + encodeURIComponent('No bill lines found.'));
  }

  // 2. Look up default creditors account
  const { data: settings } = await supabase
    .from('organisation_settings')
    .select('default_creditors_account_id')
    .eq('organisation_id', orgId)
    .single();

  const creditorsAccountId = settings?.default_creditors_account_id;
  if (!creditorsAccountId) {
    redirect(
      `/bills/${id}?error=` +
        encodeURIComponent(
          'No default creditors account configured. Set it in Settings → Accounting.'
        )
    );
  }

  // 3. Build journal lines
  const supplierName =
    (bill.suppliers as { name: string } | null)?.name ?? 'Unknown supplier';
  const memo = `Bill ${bill.bill_number ?? id.slice(0, 8)} – ${supplierName}`;

  const journalLineInputs = buildJournalLinesFromBill(
    billLines.map((bl) => ({
      account_id: bl.account_id,
      fund_id: bl.fund_id ?? null,
      description: bl.description ?? null,
      amount_pence: Number(bl.amount_pence),
    })),
    creditorsAccountId,
    Number(bill.total_pence)
  );

  // 4. Create journal with source_type + source_id
  const { data: journal, error: journalErr } = await admin
    .from('journals')
    .insert({
      organisation_id: orgId,
      journal_date: bill.bill_date,
      memo,
      status: 'draft',
      source_type: 'bill',
      source_id: id,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (journalErr || !journal) {
    redirect(
      `/bills/${id}?error=` +
        encodeURIComponent(journalErr?.message ?? 'Failed to create journal.')
    );
  }

  // 5. Insert journal lines (with supplier_id from bill)
  const jRows = journalLineInputs.map((jl) => ({
    journal_id: journal.id,
    organisation_id: orgId,
    account_id: jl.account_id,
    fund_id: jl.fund_id || null,
    supplier_id: bill.supplier_id || null,
    description: jl.description,
    debit_pence: jl.debit_pence,
    credit_pence: jl.credit_pence,
  }));

  const { error: jLinesErr } = await admin.from('journal_lines').insert(jRows);

  if (jLinesErr) {
    await admin.from('journals').delete().eq('id', journal.id);
    redirect(`/bills/${id}?error=` + encodeURIComponent(jLinesErr.message));
  }

  // 6. Post the journal
  const { error: postErr } = await admin
    .from('journals')
    .update({ status: 'posted', posted_at: new Date().toISOString() })
    .eq('id', journal.id);

  if (postErr) {
    await admin.from('journals').delete().eq('id', journal.id);
    redirect(`/bills/${id}?error=` + encodeURIComponent(postErr.message));
  }

  // 7. Update bill status and link journal
  const { error: billUpdateErr } = await admin
    .from('bills')
    .update({ status: 'posted', journal_id: journal.id })
    .eq('id', id);

  if (billUpdateErr) {
    redirect(`/bills/${id}?error=` + encodeURIComponent(billUpdateErr.message));
  }

  invalidateOrgReportCache(orgId);

  // Log approval event
  await logApprovalEvent({
    orgId,
    entityType: 'bill',
    entityId: id,
    action: 'posted',
    performedBy: user.id,
  });

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'post_bill',
    entityType: 'bill',
    entityId: id,
    metadata: { journalId: journal.id },
  });

  redirect(`/bills/${id}`);
}

/* ------------------------------------------------------------------ */
/*  Delete Bill (draft only; cascade deletes lines)                    */
/* ------------------------------------------------------------------ */

export async function deleteBill(formData: FormData) {
  await assertWriteAllowed();
  const { orgId, user } = await getActiveOrg();
  const id = formData.get('id') as string;
  if (!id) redirect('/bills');

  const supabase = await createClient();

  // Check status – prevent deletion after posting
  const { data: bill } = await supabase
    .from('bills')
    .select('status')
    .eq('id', id)
    .single();

  if (bill && (bill.status === 'posted' || bill.status === 'paid')) {
    redirect(`/bills/${id}?error=` + encodeURIComponent('Cannot delete a posted or paid invoice.'));
  }

  const { error } = await supabase.from('bills').delete().eq('id', id);

  if (error) {
    redirect(`/bills/${id}?error=` + encodeURIComponent(error.message));
  }

  await logApprovalEvent({
    orgId,
    entityType: 'bill',
    entityId: id,
    action: 'deleted',
    performedBy: user.id,
  });

  redirect('/bills');
}

/* ================================================================== */
/*  PAYMENT RUN ACTIONS                                                */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  List Payment Runs                                                  */
/* ------------------------------------------------------------------ */

export async function listPaymentRuns(orgId: string, status?: string) {
  const supabase = await createClient();

  let query = supabase
    .from('payment_runs')
    .select('*, bank_accounts(name)')
    .eq('organisation_id', orgId)
    .order('run_date', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data: runs, error } = await query;
  if (error) return { data: null, error: error.message };

  // Fetch item counts per run
  const runIds = (runs ?? []).map((r) => r.id);
  let itemCounts: Record<string, number> = {};

  if (runIds.length > 0) {
    const { data: items } = await supabase
      .from('payment_run_items')
      .select('payment_run_id')
      .in('payment_run_id', runIds);

    if (items) {
      for (const item of items) {
        itemCounts[item.payment_run_id] = (itemCounts[item.payment_run_id] || 0) + 1;
      }
    }
  }

  const enriched = (runs ?? []).map((r) => ({
    ...r,
    item_count: itemCounts[r.id] || 0,
    bank_account_name: (r.bank_accounts as { name: string } | null)?.name ?? null,
  }));

  return { data: enriched, error: null };
}

/* ------------------------------------------------------------------ */
/*  Get Payment Run (detail)                                           */
/* ------------------------------------------------------------------ */

export async function getPaymentRun(paymentRunId: string) {
  const supabase = await createClient();

  const [{ data: run, error: runErr }, { data: items, error: itemsErr }] =
    await Promise.all([
      supabase
        .from('payment_runs')
        .select('*')
        .eq('id', paymentRunId)
        .single(),
      supabase
        .from('payment_run_items')
        .select('*, bills(id, bill_number, bill_date, total_pence, status, suppliers(name))')
        .eq('payment_run_id', paymentRunId),
    ]);

  if (runErr) return { run: null, items: null, error: runErr.message };
  if (itemsErr) return { run, items: null, error: itemsErr.message };
  return { run, items: items ?? [], error: null };
}

/* ------------------------------------------------------------------ */
/*  Delete Payment Run (draft only)                                    */
/* ------------------------------------------------------------------ */

export async function deletePaymentRun(
  paymentRunId: string
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { role } = await getActiveOrg();

  try { assertCanPerform(role, 'delete', 'payment_runs'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  const supabase = await createClient();

  // Prevent deletion after posting
  const { data: run } = await supabase
    .from('payment_runs')
    .select('status')
    .eq('id', paymentRunId)
    .single();

  if (run && run.status === 'posted') {
    return { success: false, error: 'Cannot delete a posted payment run.' };
  }

  const { error } = await supabase
    .from('payment_runs')
    .delete()
    .eq('id', paymentRunId);

  if (error) return { success: false, error: error.message };
  return { success: true, error: null };
}

/* ------------------------------------------------------------------ */
/*  Create Payment Run                                                 */
/* ------------------------------------------------------------------ */

export async function createPaymentRun(
  orgId: string,
  billIds: string[],
  bankAccountId?: string,
): Promise<{ data: { id: string; total_pence: number } | null; error: string | null }> {
  await assertWriteAllowed();
  const { user, role } = await getActiveOrg();

  try { assertCanPerform(role, 'create', 'payment_runs'); }
  catch (e) { return { data: null, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  if (billIds.length === 0) {
    return { data: null, error: 'At least one invoice must be selected.' };
  }

  const supabase = await createClient();

  // Fetch the selected bills
  const { data: bills, error: billsErr } = await supabase
    .from('bills')
    .select('id, status, total_pence')
    .in('id', billIds);

  if (billsErr || !bills) {
    return { data: null, error: billsErr?.message ?? 'Failed to fetch invoices.' };
  }

  if (bills.length !== billIds.length) {
    return { data: null, error: 'One or more invoices not found.' };
  }

  // Verify all bills are in 'posted' status (only posted invoices can be paid)
  const nonPosted = bills.filter((b) => b.status !== 'posted');
  if (nonPosted.length > 0) {
    return {
      data: null,
      error: `${nonPosted.length} invoice(s) are not in posted status. Only posted invoices can be included in a payment run.`,
    };
  }

  // Calculate total
  const totalPence = bills.reduce((sum, b) => sum + Number(b.total_pence), 0);

  // Insert payment run with bank_account_id
  const { data: run, error: runErr } = await supabase
    .from('payment_runs')
    .insert({
      organisation_id: orgId,
      run_date: new Date().toISOString().slice(0, 10),
      total_pence: totalPence,
      bank_account_id: bankAccountId ?? null,
      created_by: user.id,
    })
    .select('id, total_pence')
    .single();

  if (runErr || !run) {
    return { data: null, error: runErr?.message ?? 'Failed to create payment run.' };
  }

  // Insert items
  const items = bills.map((b) => ({
    payment_run_id: run.id,
    bill_id: b.id,
    amount_pence: Number(b.total_pence),
  }));

  const { error: itemsErr } = await supabase
    .from('payment_run_items')
    .insert(items);

  if (itemsErr) {
    await supabase.from('payment_runs').delete().eq('id', run.id);
    return { data: null, error: itemsErr.message };
  }

  // Log creation event
  await logApprovalEvent({
    orgId,
    entityType: 'payment_run',
    entityId: run.id,
    action: 'created',
    performedBy: user.id,
  });

  return { data: { id: run.id, total_pence: totalPence }, error: null };
}

/* ------------------------------------------------------------------ */
/*  Post Payment Run                                                   */
/* ------------------------------------------------------------------ */

export async function postPaymentRun(
  paymentRunId: string,
  bankAccountId: string
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, user, role } = await getActiveOrg();

  try { assertCanPerform(role, 'post', 'payment_runs'); }
  catch (e) { return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' }; }

  if (!bankAccountId) {
    return { success: false, error: 'A bank account must be selected for the payment.' };
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  // 1. Fetch payment run
  const { data: run, error: runErr } = await supabase
    .from('payment_runs')
    .select('*')
    .eq('id', paymentRunId)
    .single();

  if (runErr || !run) {
    return { success: false, error: runErr?.message ?? 'Payment run not found.' };
  }

  // Idempotency: if already posted, return success
  if (run.status === 'posted') {
    return { success: true, error: null };
  }

  // Period lock check
  const locked = await isDateInLockedPeriod(run.run_date);
  if (locked) {
    return { success: false, error: 'Cannot post: payment run date falls in a locked financial period.' };
  }

  // 2. Fetch items + bill info
  const { data: items, error: itemsErr } = await supabase
    .from('payment_run_items')
    .select('*, bills(id, bill_number, status, suppliers(name))')
    .eq('payment_run_id', paymentRunId);

  if (itemsErr || !items || items.length === 0) {
    return { success: false, error: 'No items found in payment run.' };
  }

  // 3. Look up default creditors account
  const { data: settings } = await supabase
    .from('organisation_settings')
    .select('default_creditors_account_id')
    .eq('organisation_id', orgId)
    .single();

  const creditorsAccountId = settings?.default_creditors_account_id;
  if (!creditorsAccountId) {
    return {
      success: false,
      error: 'No default creditors account configured. Set it in Settings → Accounting.',
    };
  }

  // 3b. Resolve bank account's linked GL account
  const { data: bankAcct } = await supabase
    .from('bank_accounts')
    .select('linked_account_id')
    .eq('id', bankAccountId)
    .single();

  const bankGlAccountId = bankAcct?.linked_account_id ?? bankAccountId;

  // 4. Build journal lines
  const totalPence = Number(run.total_pence);
  const journalLineInputs = buildPaymentRunJournalLines(
    items.map((item) => {
      const bill = item.bills as { id: string; bill_number: string | null; suppliers: { name: string } | null } | null;
      const supplierName = bill?.suppliers?.name ?? 'Unknown';
      const billNum = bill?.bill_number ?? bill?.id?.slice(0, 8) ?? '';
      return {
        bill_id: item.bill_id,
        amount_pence: Number(item.amount_pence),
        description: `Payment – Invoice ${billNum} (${supplierName})`,
      };
    }),
    creditorsAccountId,
    bankGlAccountId,
    totalPence
  );

  // 5. Create journal with source_type + source_id
  const memo = `Payment Run ${paymentRunId.slice(0, 8)} – ${items.length} invoice(s)`;

  const { data: journal, error: journalErr } = await admin
    .from('journals')
    .insert({
      organisation_id: orgId,
      journal_date: run.run_date,
      memo,
      status: 'draft',
      source_type: 'payment',
      source_id: paymentRunId,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (journalErr || !journal) {
    return {
      success: false,
      error: journalErr?.message ?? 'Failed to create journal.',
    };
  }

  // 6. Insert journal lines
  const jRows = journalLineInputs.map((jl) => ({
    journal_id: journal.id,
    organisation_id: orgId,
    account_id: jl.account_id,
    fund_id: jl.fund_id || null,
    description: jl.description,
    debit_pence: jl.debit_pence,
    credit_pence: jl.credit_pence,
  }));

  const { error: jLinesErr } = await admin.from('journal_lines').insert(jRows);

  if (jLinesErr) {
    await admin.from('journals').delete().eq('id', journal.id);
    return { success: false, error: jLinesErr.message };
  }

  // 7. Post the journal
  const { error: postErr } = await admin
    .from('journals')
    .update({ status: 'posted', posted_at: new Date().toISOString() })
    .eq('id', journal.id);

  if (postErr) {
    await admin.from('journals').delete().eq('id', journal.id);
    return { success: false, error: postErr.message };
  }

  // 8. Update payment run status + link journal + bank_account_id
  const { error: prUpdateErr } = await admin
    .from('payment_runs')
    .update({ status: 'posted', journal_id: journal.id, bank_account_id: bankAccountId })
    .eq('id', paymentRunId);

  if (prUpdateErr) {
    return { success: false, error: prUpdateErr.message };
  }

  // 9. Mark all bills as 'paid'
  const billIds = items.map((item) => item.bill_id);
  const { error: billsUpdateErr } = await admin
    .from('bills')
    .update({ status: 'paid' })
    .in('id', billIds);

  if (billsUpdateErr) {
    return { success: false, error: billsUpdateErr.message };
  }

  // Invalidate report caches since a payment run journal was posted
  invalidateOrgReportCache(orgId);

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'post_payment_run',
    entityType: 'payment_run',
    entityId: paymentRunId,
    metadata: { journalId: journal.id, billCount: items.length },
  });

  // Log approval events for payment run and each paid bill
  await logApprovalEvent({
    orgId,
    entityType: 'payment_run',
    entityId: paymentRunId,
    action: 'posted',
    performedBy: user.id,
  });

  for (const bId of billIds) {
    await logApprovalEvent({
      orgId,
      entityType: 'bill',
      entityId: bId,
      action: 'paid',
      performedBy: user.id,
    });
  }

  return { success: true, error: null };
}

/* ================================================================== */
/*  PAYMENT RUN CSV EXPORT                                              */
/* ================================================================== */

export async function exportPaymentRunCsv(
  paymentRunId: string,
): Promise<{ data: string | null; error: string | null }> {
  const supabase = await createClient();

  const { data: run } = await supabase
    .from('payment_runs')
    .select('id, run_date, total_pence, status')
    .eq('id', paymentRunId)
    .single();

  if (!run) return { data: null, error: 'Payment run not found.' };

  const { data: items } = await supabase
    .from('payment_run_items')
    .select('amount_pence, bills(bill_number, suppliers(name, bank_details))')
    .eq('payment_run_id', paymentRunId);

  if (!items || items.length === 0) return { data: null, error: 'No items found.' };

  // Build CSV
  const header = 'Supplier,Invoice Number,Amount (£),Bank Details';
  const rows = items.map((item) => {
    const bill = item.bills as unknown as { bill_number: string | null; suppliers: { name: string; bank_details: string | null } | null } | null;
    const supplierName = bill?.suppliers?.name ?? 'Unknown';
    const billNumber = bill?.bill_number ?? '';
    const amount = (Number(item.amount_pence) / 100).toFixed(2);
    const bankDetails = bill?.suppliers?.bank_details ?? '';
    return `"${supplierName}","${billNumber}","${amount}","${bankDetails}"`;
  });

  const totalRow = `"TOTAL","","${(Number(run.total_pence) / 100).toFixed(2)}",""`;
  const csv = [header, ...rows, totalRow].join('\n');

  return { data: csv, error: null };
}

/* ================================================================== */
/*  APPROVAL HISTORY                                                    */
/* ================================================================== */

export async function getApprovalHistory(
  entityType: 'bill' | 'payment_run' | 'payroll_run',
  entityId: string,
): Promise<{ data: Array<{ id: string; action: string; performed_by: string | null; notes: string | null; created_at: string; performer_email?: string }>; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('approval_events')
    .select('id, action, performed_by, notes, created_at, profiles(email)')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: true });

  if (error) return { data: [], error: error.message };

  const mapped = (data ?? []).map((row) => ({
    id: row.id,
    action: row.action,
    performed_by: row.performed_by,
    notes: row.notes,
    created_at: row.created_at,
    performer_email: (row.profiles as unknown as { email: string } | null)?.email ?? undefined,
  }));

  return { data: mapped, error: null };
}
