'use server';

import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { assertWriteAllowed } from '@/lib/demo';
import { logAuditEvent } from '@/lib/audit';
import type { SupplierRow, SupplierWithStats, SupplierInvoice, SupplierMatchRule, SupplierOption } from './types';

/* ================================================================== */
/*  READ ACTIONS                                                       */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  getSuppliersWithStats                                              */
/* ------------------------------------------------------------------ */

export async function getSuppliersWithStats(): Promise<{
  data: SupplierWithStats[];
  error: string | null;
}> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  // Fetch all suppliers (including archived)
  const { data: suppliers, error: supErr } = await supabase
    .from('suppliers')
    .select('*')
    .eq('organisation_id', orgId)
    .order('name');

  if (supErr) return { data: [], error: supErr.message };

  const supplierIds = (suppliers ?? []).map((s) => s.id);
  if (supplierIds.length === 0) return { data: [], error: null };

  // Fetch all bills for these suppliers
  const { data: bills } = await supabase
    .from('bills')
    .select('id, supplier_id, total_pence, status, bill_date')
    .in('supplier_id', supplierIds);

  // Compute per-supplier stats
  const currentYear = new Date().getFullYear();
  const yearStart = `${currentYear}-01-01`;

  const statsMap = new Map<
    string,
    { outstanding: number; paidThisYear: number; invoiceCount: number }
  >();

  for (const bill of bills ?? []) {
    const sid = bill.supplier_id;
    if (!statsMap.has(sid)) {
      statsMap.set(sid, { outstanding: 0, paidThisYear: 0, invoiceCount: 0 });
    }
    const entry = statsMap.get(sid)!;
    entry.invoiceCount += 1;

    const amount = Number(bill.total_pence);

    // Outstanding = draft + approved + posted (not yet paid)
    if (bill.status !== 'paid') {
      entry.outstanding += amount;
    }

    // Paid this year
    if (bill.status === 'paid' && bill.bill_date >= yearStart) {
      entry.paidThisYear += amount;
    }
  }

  const result: SupplierWithStats[] = (suppliers ?? []).map((s) => {
    const stats = statsMap.get(s.id);
    return {
      id: s.id,
      organisation_id: s.organisation_id,
      name: s.name,
      email: s.email,
      contact_name: s.contact_name ?? null,
      phone: s.phone ?? null,
      address: s.address ?? null,
      bank_details: s.bank_details,
      default_account_id: s.default_account_id ?? null,
      default_fund_id: s.default_fund_id ?? null,
      is_active: s.is_active,
      created_at: s.created_at,
      outstanding_pence: stats?.outstanding ?? 0,
      paid_this_year_pence: stats?.paidThisYear ?? 0,
      invoice_count: stats?.invoiceCount ?? 0,
    };
  });

  return { data: result, error: null };
}

/* ------------------------------------------------------------------ */
/*  getSupplier                                                        */
/* ------------------------------------------------------------------ */

export async function getSupplier(
  supplierId: string,
): Promise<{ data: SupplierWithStats | null; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const { data: s, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('id', supplierId)
    .eq('organisation_id', orgId)
    .single();

  if (error || !s) return { data: null, error: error?.message ?? 'Supplier not found.' };

  // Fetch bills for this supplier
  const { data: bills } = await supabase
    .from('bills')
    .select('id, total_pence, status, bill_date')
    .eq('supplier_id', supplierId);

  const currentYear = new Date().getFullYear();
  const yearStart = `${currentYear}-01-01`;

  let outstanding = 0;
  let paidThisYear = 0;
  let invoiceCount = 0;

  for (const bill of bills ?? []) {
    invoiceCount += 1;
    const amount = Number(bill.total_pence);
    if (bill.status !== 'paid') outstanding += amount;
    if (bill.status === 'paid' && bill.bill_date >= yearStart) paidThisYear += amount;
  }

  return {
    data: {
      id: s.id,
      organisation_id: s.organisation_id,
      name: s.name,
      email: s.email,
      contact_name: s.contact_name ?? null,
      phone: s.phone ?? null,
      address: s.address ?? null,
      bank_details: s.bank_details,
      default_account_id: s.default_account_id ?? null,
      default_fund_id: s.default_fund_id ?? null,
      is_active: s.is_active,
      created_at: s.created_at,
      outstanding_pence: outstanding,
      paid_this_year_pence: paidThisYear,
      invoice_count: invoiceCount,
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  getSupplierInvoices                                                */
/* ------------------------------------------------------------------ */

export async function getSupplierInvoices(
  supplierId: string,
): Promise<{ data: SupplierInvoice[]; error: string | null }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('bills')
    .select('id, bill_number, bill_date, due_date, total_pence, status, journal_id')
    .eq('supplier_id', supplierId)
    .order('bill_date', { ascending: false });

  if (error) return { data: [], error: error.message };

  const invoices: SupplierInvoice[] = (data ?? []).map((b) => ({
    id: b.id,
    bill_number: b.bill_number,
    bill_date: b.bill_date,
    due_date: b.due_date,
    total_pence: Number(b.total_pence),
    status: b.status,
    journal_id: b.journal_id,
  }));

  return { data: invoices, error: null };
}

/* ------------------------------------------------------------------ */
/*  getSupplierDefaults (for bill form auto-fill)                      */
/* ------------------------------------------------------------------ */

export async function getSupplierDefaults(
  supplierId: string,
): Promise<{ default_account_id: string | null; default_fund_id: string | null }> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('suppliers')
    .select('default_account_id, default_fund_id')
    .eq('id', supplierId)
    .single();

  return {
    default_account_id: data?.default_account_id ?? null,
    default_fund_id: data?.default_fund_id ?? null,
  };
}

/* ================================================================== */
/*  WRITE ACTIONS                                                      */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  createSupplierFull (enhanced create with all fields)               */
/* ------------------------------------------------------------------ */

export async function createSupplierFull(formData: FormData) {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();

  try {
    assertCanPerform(role, 'create', 'bills');
  } catch (e) {
    redirect('/suppliers/new?error=' + encodeURIComponent(e instanceof PermissionError ? e.message : 'Permission denied.'));
  }

  const name = (formData.get('name') as string)?.trim();
  if (!name) {
    redirect('/suppliers/new?error=' + encodeURIComponent('Supplier name is required.'));
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('suppliers')
    .insert({
      organisation_id: orgId,
      name,
      contact_name: (formData.get('contact_name') as string)?.trim() || null,
      email: (formData.get('email') as string)?.trim() || null,
      phone: (formData.get('phone') as string)?.trim() || null,
      address: (formData.get('address') as string)?.trim() || null,
      bank_details: (formData.get('bank_details') as string)?.trim() || null,
      default_account_id: (formData.get('default_account_id') as string) || null,
      default_fund_id: (formData.get('default_fund_id') as string) || null,
    });

  if (error) {
    if (error.message.includes('unique') || error.message.includes('duplicate')) {
      redirect('/suppliers/new?error=' + encodeURIComponent('A supplier with this name already exists.'));
    }
    redirect('/suppliers/new?error=' + encodeURIComponent(error.message));
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'create_supplier',
    entityType: 'supplier',
    metadata: { name },
  });

  redirect('/suppliers');
}

/* ------------------------------------------------------------------ */
/*  updateSupplier                                                     */
/* ------------------------------------------------------------------ */

export async function updateSupplier(formData: FormData) {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  const id = formData.get('id') as string;

  try {
    assertCanPerform(role, 'update', 'bills');
  } catch (e) {
    redirect(`/suppliers/${id}?error=` + encodeURIComponent(e instanceof PermissionError ? e.message : 'Permission denied.'));
  }

  const name = (formData.get('name') as string)?.trim();
  if (!name) {
    redirect(`/suppliers/${id}?error=` + encodeURIComponent('Supplier name is required.'));
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('suppliers')
    .update({
      name,
      contact_name: (formData.get('contact_name') as string)?.trim() || null,
      email: (formData.get('email') as string)?.trim() || null,
      phone: (formData.get('phone') as string)?.trim() || null,
      address: (formData.get('address') as string)?.trim() || null,
      bank_details: (formData.get('bank_details') as string)?.trim() || null,
      default_account_id: (formData.get('default_account_id') as string) || null,
      default_fund_id: (formData.get('default_fund_id') as string) || null,
    })
    .eq('id', id)
    .eq('organisation_id', orgId);

  if (error) {
    if (error.message.includes('unique') || error.message.includes('duplicate')) {
      redirect(`/suppliers/${id}?error=` + encodeURIComponent('A supplier with this name already exists.'));
    }
    redirect(`/suppliers/${id}?error=` + encodeURIComponent(error.message));
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'update_supplier',
    entityType: 'supplier',
    entityId: id,
    metadata: { name },
  });

  redirect(`/suppliers/${id}`);
}

/* ------------------------------------------------------------------ */
/*  archiveSupplier                                                    */
/* ------------------------------------------------------------------ */

export async function archiveSupplier(formData: FormData) {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  const id = formData.get('id') as string;

  try {
    assertCanPerform(role, 'update', 'bills');
  } catch (e) {
    redirect(`/suppliers/${id}?error=` + encodeURIComponent(e instanceof PermissionError ? e.message : 'Permission denied.'));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('suppliers')
    .update({ is_active: false })
    .eq('id', id);

  if (error) {
    redirect(`/suppliers/${id}?error=` + encodeURIComponent(error.message));
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'archive_supplier',
    entityType: 'supplier',
    entityId: id,
  });

  redirect(`/suppliers/${id}`);
}

/* ------------------------------------------------------------------ */
/*  unarchiveSupplier                                                  */
/* ------------------------------------------------------------------ */

export async function unarchiveSupplier(formData: FormData) {
  await assertWriteAllowed();
  const { role } = await getActiveOrg();
  const id = formData.get('id') as string;

  try {
    assertCanPerform(role, 'update', 'bills');
  } catch (e) {
    redirect(`/suppliers/${id}?error=` + encodeURIComponent(e instanceof PermissionError ? e.message : 'Permission denied.'));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('suppliers')
    .update({ is_active: true })
    .eq('id', id);

  if (error) {
    redirect(`/suppliers/${id}?error=` + encodeURIComponent(error.message));
  }

  redirect(`/suppliers/${id}`);
}

/* ================================================================== */
/*  SUPPLIER MATCH RULES (auto-suggest)                               */
/* ================================================================== */

/* ------------------------------------------------------------------ */
/*  getMatchRules — fetch all rules for a supplier                     */
/* ------------------------------------------------------------------ */

export async function getMatchRules(
  supplierId: string,
): Promise<{ data: SupplierMatchRule[]; error: string | null }> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('supplier_match_rules')
    .select('*')
    .eq('organisation_id', orgId)
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false });

  if (error) return { data: [], error: error.message };
  return { data: data ?? [], error: null };
}

/* ------------------------------------------------------------------ */
/*  getAllMatchRules — fetch all rules for org (for auto-suggest)       */
/* ------------------------------------------------------------------ */

export async function getAllMatchRules(): Promise<{
  data: (SupplierMatchRule & { supplier_name: string })[];
  error: string | null;
}> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const { data: rules, error } = await supabase
    .from('supplier_match_rules')
    .select('*')
    .eq('organisation_id', orgId);

  if (error || !rules) return { data: [], error: error?.message ?? null };

  if (rules.length === 0) return { data: [], error: null };

  // Fetch supplier names
  const supplierIds = [...new Set(rules.map((r) => r.supplier_id))];
  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('id, name, is_active')
    .in('id', supplierIds);

  const nameMap = new Map((suppliers ?? []).map((s) => [s.id, s.name]));

  return {
    data: rules
      .filter((r) => {
        const sup = (suppliers ?? []).find((s) => s.id === r.supplier_id);
        return sup?.is_active !== false;
      })
      .map((r) => ({
        ...r,
        supplier_name: nameMap.get(r.supplier_id) ?? 'Unknown',
      })),
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/*  createMatchRule                                                     */
/* ------------------------------------------------------------------ */

export async function createMatchRule(params: {
  supplierId: string;
  pattern: string;
}): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role } = await getActiveOrg();

  try {
    assertCanPerform(role, 'update', 'bills');
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const pattern = params.pattern.trim();
  if (!pattern) return { success: false, error: 'Pattern is required.' };

  const supabase = await createClient();

  const { error } = await supabase.from('supplier_match_rules').insert({
    organisation_id: orgId,
    supplier_id: params.supplierId,
    match_type: 'contains',
    pattern,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, error: null };
}

/* ------------------------------------------------------------------ */
/*  deleteMatchRule                                                     */
/* ------------------------------------------------------------------ */

export async function deleteMatchRule(
  ruleId: string,
): Promise<{ success: boolean; error: string | null }> {
  await assertWriteAllowed();
  const { orgId, role } = await getActiveOrg();

  try {
    assertCanPerform(role, 'update', 'bills');
  } catch (e) {
    return { success: false, error: e instanceof PermissionError ? e.message : 'Permission denied.' };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from('supplier_match_rules')
    .delete()
    .eq('id', ruleId)
    .eq('organisation_id', orgId);

  if (error) return { success: false, error: error.message };
  return { success: true, error: null };
}

/* ------------------------------------------------------------------ */
/*  suggestSupplier — match bank line description against rules         */
/* ------------------------------------------------------------------ */

export async function suggestSupplier(
  description: string,
): Promise<{ supplierId: string | null; supplierName: string | null }> {
  if (!description?.trim()) return { supplierId: null, supplierName: null };

  const { data: rules } = await getAllMatchRules();

  const descLower = description.toLowerCase();
  for (const rule of rules) {
    if (rule.match_type === 'contains') {
      if (descLower.includes(rule.pattern.toLowerCase())) {
        return { supplierId: rule.supplier_id, supplierName: rule.supplier_name };
      }
    }
  }

  return { supplierId: null, supplierName: null };
}

/* ------------------------------------------------------------------ */
/*  getActiveSuppliers — simple list for dropdowns                     */
/* ------------------------------------------------------------------ */

export async function getActiveSuppliers(): Promise<{
  data: SupplierOption[];
  error: string | null;
}> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('suppliers')
    .select('id, name, is_active')
    .eq('organisation_id', orgId)
    .eq('is_active', true)
    .order('name');

  if (error) return { data: [], error: error.message };
  return { data: data ?? [], error: null };
}

/* ------------------------------------------------------------------ */
/*  getSupplierExpenses — all allocated + journal expenses for supplier */
/* ------------------------------------------------------------------ */

export async function getSupplierExpenses(supplierId: string): Promise<{
  allocations: {
    id: string;
    txn_date: string;
    description: string | null;
    amount_pence: number;
    account_name: string;
    fund_name: string;
  }[];
  journalLines: {
    id: string;
    journal_date: string;
    description: string | null;
    debit_pence: number;
    credit_pence: number;
    account_name: string;
    fund_name: string;
  }[];
  error: string | null;
}> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();

  // Fetch allocations tagged to this supplier
  const { data: allocs, error: allocErr } = await supabase
    .from('allocations')
    .select(`
      id,
      amount_pence,
      bank_line_id,
      accounts:account_id ( name ),
      funds:fund_id ( name )
    `)
    .eq('organisation_id', orgId)
    .eq('supplier_id', supplierId);

  if (allocErr) return { allocations: [], journalLines: [], error: allocErr.message };

  // Get bank line dates/descriptions for the allocations
  const blIds = (allocs ?? []).map((a) => a.bank_line_id);
  let blMap = new Map<string, { txn_date: string; description: string | null }>();
  if (blIds.length > 0) {
    const { data: bls } = await supabase
      .from('bank_lines')
      .select('id, txn_date, description')
      .in('id', blIds);
    blMap = new Map((bls ?? []).map((b) => [b.id, { txn_date: b.txn_date, description: b.description }]));
  }

  const allocations = (allocs ?? []).map((a) => {
    const bl = blMap.get(a.bank_line_id);
    return {
      id: a.id,
      txn_date: bl?.txn_date ?? '',
      description: bl?.description ?? null,
      amount_pence: Number(a.amount_pence),
      account_name: (a.accounts as unknown as { name: string })?.name ?? '—',
      fund_name: (a.funds as unknown as { name: string })?.name ?? '—',
    };
  });

  // Fetch journal lines tagged to this supplier
  const { data: jLines, error: jlErr } = await supabase
    .from('journal_lines')
    .select(`
      id,
      description,
      debit_pence,
      credit_pence,
      journal_id,
      accounts:account_id ( name ),
      funds:fund_id ( name )
    `)
    .eq('organisation_id', orgId)
    .eq('supplier_id', supplierId);

  if (jlErr) return { allocations, journalLines: [], error: jlErr.message };

  // Get journal dates
  const jIds = [...new Set((jLines ?? []).map((jl) => jl.journal_id))];
  let jMap = new Map<string, string>();
  if (jIds.length > 0) {
    const { data: journals } = await supabase
      .from('journals')
      .select('id, journal_date')
      .in('id', jIds);
    jMap = new Map((journals ?? []).map((j) => [j.id, j.journal_date]));
  }

  const journalLines = (jLines ?? []).map((jl) => ({
    id: jl.id,
    journal_date: jMap.get(jl.journal_id) ?? '',
    description: jl.description,
    debit_pence: Number(jl.debit_pence),
    credit_pence: Number(jl.credit_pence),
    account_name: (jl.accounts as unknown as { name: string })?.name ?? '—',
    fund_name: (jl.funds as unknown as { name: string })?.name ?? '—',
  }));

  return { allocations, journalLines, error: null };
}
