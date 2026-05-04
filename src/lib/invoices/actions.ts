'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getActiveOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { assertWriteAllowed } from '@/lib/demo';
import { assertCanPerform, PermissionError } from '@/lib/permissions';
import { logAuditEvent } from '@/lib/audit';
import type {
  CreatePayableBillInput,
  CreateReceivableInvoiceInput,
  InlineAccountInput,
  InlineHirerInput,
  InlineSupplierInput,
  InvoiceFormOptions,
  InvoiceHubItem,
  InvoiceHubTab,
  InvoiceLineDraftInput,
  PayableBillStatus,
  ReceivableInvoiceStatus,
} from './types';
import { receivablePaymentStatus, validateInvoiceLines } from './validation';

type ActionResult<T> = { data: T | null; error: string | null };

function permissionError(error: unknown) {
  return error instanceof PermissionError ? error.message : 'Permission denied.';
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function clean(value: string | null | undefined) {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function assertAccountsAndFunds(params: {
  orgId: string;
  lines: InvoiceLineDraftInput[];
  accountType: 'income' | 'expense';
}): Promise<string | null> {
  const supabase = await createClient();
  const accountIds = [...new Set(params.lines.map((l) => l.accountId))];
  const fundIds = [...new Set(params.lines.map((l) => l.fundId))];

  const [{ data: accounts }, { data: funds }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, type')
      .eq('organisation_id', params.orgId)
      .in('id', accountIds),
    supabase
      .from('funds')
      .select('id')
      .eq('organisation_id', params.orgId)
      .in('id', fundIds),
  ]);

  const validAccounts = new Set((accounts ?? []).filter((a) => a.type === params.accountType).map((a) => a.id as string));
  const validFunds = new Set((funds ?? []).map((f) => f.id as string));
  if (validAccounts.size !== accountIds.length) return `Lines must use ${params.accountType} accounts from this workspace.`;
  if (validFunds.size !== fundIds.length) return 'Lines must use funds from this workspace.';
  return null;
}

export async function getInvoiceFormOptions(): Promise<InvoiceFormOptions> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();
  const [suppliers, hirers, funds, expenseAccounts, incomeAccounts] = await Promise.all([
    supabase
      .from('suppliers')
      .select('id, name, default_account_id, default_fund_id')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('lettings_hirers')
      .select('id, name, email, default_income_account_id, default_fund_id')
      .eq('organisation_id', orgId)
      .neq('status', 'archived')
      .order('name'),
    supabase
      .from('funds')
      .select('id, name')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('accounts')
      .select('id, code, name, type')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .eq('available_in_invoices', true)
      .eq('type', 'expense')
      .order('code'),
    supabase
      .from('accounts')
      .select('id, code, name, type')
      .eq('organisation_id', orgId)
      .eq('is_active', true)
      .eq('available_in_invoices', true)
      .eq('type', 'income')
      .order('code'),
  ]);

  return {
    suppliers: (suppliers.data ?? []) as InvoiceFormOptions['suppliers'],
    hirers: (hirers.data ?? []) as InvoiceFormOptions['hirers'],
    funds: (funds.data ?? []) as InvoiceFormOptions['funds'],
    expenseAccounts: (expenseAccounts.data ?? []) as InvoiceFormOptions['expenseAccounts'],
    incomeAccounts: (incomeAccounts.data ?? []) as InvoiceFormOptions['incomeAccounts'],
  };
}

export async function listInvoiceHubItems(tab: InvoiceHubTab = 'all'): Promise<ActionResult<InvoiceHubItem[]>> {
  const { orgId } = await getActiveOrg();
  const supabase = await createClient();
  const today = todayIso();

  const [{ data: bills, error: billsError }, { data: receivables, error: receivableError }, { data: scheduled }] =
    await Promise.all([
      supabase
        .from('bills')
        .select('id, bill_number, bill_date, due_date, total_pence, status, suppliers(name)')
        .eq('organisation_id', orgId)
        .order('bill_date', { ascending: false }),
      supabase
        .from('receivable_invoices')
        .select('id, invoice_number, invoice_date, due_date, total_pence, paid_pence, status, generated_pdf_storage_path, lettings_hirers(name)')
        .eq('organisation_id', orgId)
        .order('invoice_date', { ascending: false }),
      supabase
        .from('payment_run_items')
        .select('bill_id, payment_runs!inner(status, organisation_id)')
        .eq('payment_runs.organisation_id', orgId)
        .in('payment_runs.status', ['draft', 'approved']),
    ]);

  if (billsError) return { data: null, error: billsError.message };
  if (receivableError) return { data: null, error: receivableError.message };

  const scheduledBillIds = new Set((scheduled ?? []).map((row) => row.bill_id as string));
  const payableItems: InvoiceHubItem[] = (bills ?? []).map((bill) => {
    const supplier = bill.suppliers as { name: string } | { name: string }[] | null;
    const supplierName = Array.isArray(supplier) ? supplier[0]?.name : supplier?.name;
    const status = bill.status as PayableBillStatus;
    return {
      id: bill.id,
      direction: 'payable',
      counterpartyName: supplierName ?? 'Unknown supplier',
      invoiceNumber: bill.bill_number,
      invoiceDate: bill.bill_date,
      dueDate: bill.due_date,
      totalPence: Number(bill.total_pence ?? 0),
      status,
      paymentStatus: status === 'paid' ? 'paid' : scheduledBillIds.has(bill.id) ? 'scheduled_for_payment' : 'unpaid',
      href: `/bills/${bill.id}`,
    };
  });

  const receivableItems: InvoiceHubItem[] = (receivables ?? []).map((invoice) => {
    const hirer = invoice.lettings_hirers as { name: string } | { name: string }[] | null;
    const hirerName = Array.isArray(hirer) ? hirer[0]?.name : hirer?.name;
    const status = invoice.status as ReceivableInvoiceStatus;
    const paidPence = Number(invoice.paid_pence ?? 0);
    const totalPence = Number(invoice.total_pence ?? 0);
    return {
      id: invoice.id,
      direction: 'receivable',
      counterpartyName: hirerName ?? 'Unknown customer',
      invoiceNumber: invoice.invoice_number,
      invoiceDate: invoice.invoice_date,
      dueDate: invoice.due_date,
      totalPence,
      paidPence,
      status,
      paymentStatus: receivablePaymentStatus(totalPence, paidPence),
      href: `/bills/receivable/${invoice.id}`,
      generatedPdfStoragePath: invoice.generated_pdf_storage_path ?? null,
    };
  });

  const all = [...payableItems, ...receivableItems].sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
  const filtered = all.filter((item) => {
    if (tab === 'bills-to-pay') return item.direction === 'payable';
    if (tab === 'owed-to-us') return item.direction === 'receivable';
    if (tab === 'drafts') return item.status === 'draft';
    if (tab === 'overdue') return item.dueDate != null && item.dueDate < today && item.paymentStatus !== 'paid' && item.status !== 'voided';
    return true;
  });

  return { data: filtered, error: null };
}

export async function createSupplierInline(input: InlineSupplierInput): Promise<ActionResult<{ id: string; name: string }>> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanPerform(role, 'create', 'bills');
  } catch (error) {
    return { data: null, error: permissionError(error) };
  }

  const name = clean(input.name);
  if (!name) return { data: null, error: 'Supplier name is required.' };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('suppliers')
    .select('id, name')
    .eq('organisation_id', orgId)
    .ilike('name', name)
    .maybeSingle();
  if (existing) return { data: { id: existing.id, name: existing.name }, error: null };

  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      organisation_id: orgId,
      name,
      email: clean(input.contactEmail),
      phone: clean(input.phone),
      address: clean(input.address),
      default_account_id: clean(input.defaultExpenseAccountId),
      default_fund_id: clean(input.defaultFundId),
      bank_reference_alias: clean(input.bankReferenceAlias),
      notes: clean(input.notes),
    })
    .select('id, name')
    .single();

  if (error || !data) return { data: null, error: error?.message ?? 'Unable to create supplier.' };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'create_supplier_inline',
    entityType: 'supplier',
    entityId: data.id,
    metadata: { name },
  });
  revalidatePath('/suppliers');
  return { data, error: null };
}

export async function createHirerInline(input: InlineHirerInput): Promise<ActionResult<{ id: string; name: string }>> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  if (role !== 'admin' && role !== 'treasurer') return { data: null, error: 'Permission denied.' };

  const name = clean(input.name);
  if (!name) return { data: null, error: 'Customer/hirer name is required.' };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('lettings_hirers')
    .select('id, name')
    .eq('organisation_id', orgId)
    .neq('status', 'archived')
    .ilike('name', name)
    .maybeSingle();
  if (existing) return { data: { id: existing.id, name: existing.name }, error: null };

  const { data, error } = await supabase
    .from('lettings_hirers')
    .insert({
      organisation_id: orgId,
      name,
      contact_name: clean(input.contactName),
      email: clean(input.email),
      phone: clean(input.phone),
      address: clean(input.address),
      default_income_account_id: clean(input.defaultIncomeAccountId),
      default_fund_id: clean(input.defaultFundId),
      notes: clean(input.notes),
      created_by: user.id,
    })
    .select('id, name')
    .single();

  if (error || !data) return { data: null, error: error?.message ?? 'Unable to create customer/hirer.' };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'create_hirer_inline',
    entityType: 'lettings_hirer',
    entityId: data.id,
    metadata: { name },
  });
  revalidatePath('/lettings');
  return { data, error: null };
}

export async function createInvoiceAccountInline(input: InlineAccountInput): Promise<ActionResult<{ id: string; code: string; name: string; type: 'income' | 'expense' }>> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanPerform(role, 'create', 'accounts');
  } catch (error) {
    return { data: null, error: permissionError(error) };
  }

  const name = clean(input.name);
  if (!name) return { data: null, error: 'Account name is required.' };
  if (input.type !== 'income' && input.type !== 'expense') return { data: null, error: 'Invoice accounts must be income or expense accounts.' };

  const supabase = await createClient();
  const { data: duplicate } = await supabase
    .from('accounts')
    .select('id, code, name, type')
    .eq('organisation_id', orgId)
    .eq('type', input.type)
    .ilike('name', name)
    .maybeSingle();
  if (duplicate) return { data: duplicate as { id: string; code: string; name: string; type: 'income' | 'expense' }, error: null };

  const prefix = input.type === 'income' ? 'INC' : 'EXP';
  const { count } = await supabase
    .from('accounts')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', orgId)
    .eq('type', input.type);
  const code = `${prefix}-${String((count ?? 0) + 1).padStart(3, '0')}`;

  const { data, error } = await supabase
    .from('accounts')
    .insert({
      organisation_id: orgId,
      code,
      name,
      type: input.type,
      parent_id: clean(input.parentAccountId),
      description: clean(input.description),
      default_fund_id: clean(input.defaultFundId),
      created_by: user.id,
      available_in_invoices: true,
      available_in_reconciliation: true,
      available_in_donations: input.type === 'income',
    })
    .select('id, code, name, type')
    .single();

  if (error || !data) return { data: null, error: error?.message ?? 'Unable to create account.' };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'account_create_inline_invoice',
    entityType: 'account',
    entityId: data.id,
    metadata: { code, name, type: input.type },
  });
  revalidatePath('/accounts');
  return { data: data as { id: string; code: string; name: string; type: 'income' | 'expense' }, error: null };
}

export async function createPayableBillFromInvoiceForm(input: CreatePayableBillInput): Promise<ActionResult<{ id: string }>> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanPerform(role, 'create', 'bills');
  } catch (error) {
    return { data: null, error: permissionError(error) };
  }

  if (!input.supplierId) return { data: null, error: 'Supplier is required.' };
  if (!input.billDate) return { data: null, error: 'Invoice date is required.' };
  if (!Number.isInteger(input.totalPence) || input.totalPence <= 0) return { data: null, error: 'Total must be positive.' };
  const lineError = validateInvoiceLines(input.lines, input.totalPence);
  if (lineError) return { data: null, error: lineError };
  const accountError = await assertAccountsAndFunds({ orgId, lines: input.lines, accountType: 'expense' });
  if (accountError) return { data: null, error: accountError };

  const supabase = await createClient();
  const { data: supplier } = await supabase
    .from('suppliers')
    .select('id')
    .eq('organisation_id', orgId)
    .eq('id', input.supplierId)
    .maybeSingle();
  if (!supplier) return { data: null, error: 'Supplier not found in this workspace.' };

  const { data: bill, error: billError } = await supabase
    .from('bills')
    .insert({
      organisation_id: orgId,
      supplier_id: input.supplierId,
      bill_number: clean(input.billNumber),
      bill_date: input.billDate,
      due_date: clean(input.dueDate),
      attachment_url: clean(input.attachmentUrl),
      total_pence: input.totalPence,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (billError || !bill) return { data: null, error: billError?.message ?? 'Unable to create bill.' };

  const { error: lineInsertError } = await supabase.from('bill_lines').insert(
    input.lines.map((line) => ({
      bill_id: bill.id,
      account_id: line.accountId,
      fund_id: line.fundId,
      description: clean(line.description),
      amount_pence: line.amountPence,
    })),
  );

  if (lineInsertError) {
    await supabase.from('bills').delete().eq('id', bill.id).eq('organisation_id', orgId);
    return { data: null, error: lineInsertError.message };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'create_bill_from_invoice_form',
    entityType: 'bill',
    entityId: bill.id,
  });
  revalidatePath('/bills');
  revalidatePath('/suppliers');
  return { data: { id: bill.id }, error: null };
}

export async function createReceivableInvoice(input: CreateReceivableInvoiceInput): Promise<ActionResult<{ id: string }>> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanPerform(role, 'create', 'bills');
  } catch (error) {
    return { data: null, error: permissionError(error) };
  }

  if (!input.hirerId) return { data: null, error: 'Customer/hirer is required.' };
  if (!input.invoiceDate) return { data: null, error: 'Invoice date is required.' };
  if (!Number.isInteger(input.totalPence) || input.totalPence <= 0) return { data: null, error: 'Total must be positive.' };
  const lineError = validateInvoiceLines(input.lines, input.totalPence);
  if (lineError) return { data: null, error: lineError };
  const accountError = await assertAccountsAndFunds({ orgId, lines: input.lines, accountType: 'income' });
  if (accountError) return { data: null, error: accountError };

  const supabase = await createClient();
  const { data: hirer } = await supabase
    .from('lettings_hirers')
    .select('id')
    .eq('organisation_id', orgId)
    .eq('id', input.hirerId)
    .maybeSingle();
  if (!hirer) return { data: null, error: 'Customer/hirer not found in this workspace.' };

  const { data: invoice, error: invoiceError } = await supabase
    .from('receivable_invoices')
    .insert({
      organisation_id: orgId,
      hirer_id: input.hirerId,
      linked_letting_charge_id: clean(input.linkedLettingChargeId),
      invoice_number: clean(input.invoiceNumber),
      invoice_date: input.invoiceDate,
      due_date: clean(input.dueDate),
      total_pence: input.totalPence,
      notes: clean(input.notes),
      message: clean(input.message),
      created_by: user.id,
    })
    .select('id')
    .single();
  if (invoiceError || !invoice) return { data: null, error: invoiceError?.message ?? 'Unable to create receivable invoice.' };

  const { error: lineInsertError } = await supabase.from('receivable_invoice_lines').insert(
    input.lines.map((line) => ({
      invoice_id: invoice.id,
      account_id: line.accountId,
      fund_id: line.fundId,
      description: clean(line.description),
      amount_pence: line.amountPence,
    })),
  );

  if (lineInsertError) {
    await supabase.from('receivable_invoices').delete().eq('id', invoice.id).eq('organisation_id', orgId);
    return { data: null, error: lineInsertError.message };
  }

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'create_receivable_invoice',
    entityType: 'receivable_invoice',
    entityId: invoice.id,
  });
  revalidatePath('/bills');
  return { data: { id: invoice.id }, error: null };
}

export async function markReceivableInvoiceSent(invoiceId: string): Promise<ActionResult<{ id: string }>> {
  await assertWriteAllowed();
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanPerform(role, 'update', 'bills');
  } catch (error) {
    return { data: null, error: permissionError(error) };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('receivable_invoices')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', invoiceId)
    .eq('organisation_id', orgId);

  if (error) return { data: null, error: error.message };

  await logAuditEvent({
    orgId,
    userId: user.id,
    action: 'mark_receivable_invoice_sent',
    entityType: 'receivable_invoice',
    entityId: invoiceId,
  });
  revalidatePath('/bills');
  revalidatePath(`/bills/receivable/${invoiceId}`);
  return { data: { id: invoiceId }, error: null };
}

export async function openReceivableInvoicePdf(invoiceId: string) {
  redirect(`/api/receivable-invoices/${invoiceId}/pdf`);
}
