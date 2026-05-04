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
  PortalExpenseBudgetOption,
  PortalExpenseCardOption,
  PortalExpenseMethod,
  PortalExpenseOption,
  PortalExpenseOverspendWarning,
  PortalExpenseSubmissionFormOptions,
  PortalExpenseSubmissionRow,
  PortalExpenseSubmissionStatus,
} from '@/lib/portal/expense-submission-types';

type ActionResult<T = null> = { data: T | null; error: string | null; warning?: PortalExpenseOverspendWarning };

const METHODS: readonly PortalExpenseMethod[] = ['cash', 'card', 'cheque', 'bank_transfer'];
const STATUSES: readonly PortalExpenseSubmissionStatus[] = [
  'draft',
  'submitted',
  'changes_requested',
  'approved',
  'rejected',
  'awaiting_bank_match',
  'paid',
  'reconciled',
  'voided',
];

interface PortalExpenseInput {
  expenseDate: string;
  amountPence: number;
  detail: string;
  method: PortalExpenseMethod;
  supplierId?: string | null;
  supplierName?: string | null;
  budgetId?: string | null;
  budgetCategoryId?: string | null;
  fundId?: string | null;
  accountId?: string | null;
  reimbursementRequired?: boolean;
  cardAssignmentId?: string | null;
}

interface PortalExpenseActionParams {
  id: string;
  note?: string | null;
}

function permissionMessage(error: unknown) {
  return error instanceof PermissionError || error instanceof PortalPermissionError
    ? error.message
    : 'Permission denied.';
}

function cleanText(value?: string | null) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

function validateInput(input: PortalExpenseInput, requireAll: boolean) {
  if (!input.expenseDate) return 'Expense date is required.';
  if (!input.amountPence || input.amountPence <= 0) return 'Amount must be positive.';
  if (!cleanText(input.detail)) return 'Detail is required.';
  if (!METHODS.includes(input.method)) return 'Invalid expense method.';
  if (requireAll && !input.budgetId) return 'Budget is required.';
  if (requireAll && !input.budgetCategoryId) return 'Budget category is required.';
  if (requireAll && !input.fundId) return 'Fund is required.';
  if (requireAll && !input.accountId) return 'Account/category is required.';
  if (requireAll && input.method === 'card' && !input.cardAssignmentId) return 'Card assignment is required for card expenses.';
  return null;
}

function mapExpenseRow(row: Record<string, unknown>): PortalExpenseSubmissionRow {
  return {
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    submitted_by: row.submitted_by as string,
    expense_date: row.expense_date as string,
    amount_pence: Number(row.amount_pence ?? 0),
    detail: row.detail as string,
    method: row.method as PortalExpenseMethod,
    supplier_id: (row.supplier_id as string | null) ?? null,
    supplier_name: (row.supplier_name as string | null) ?? null,
    budget_id: (row.budget_id as string | null) ?? null,
    budget_category_id: (row.budget_category_id as string | null) ?? null,
    fund_id: (row.fund_id as string | null) ?? null,
    account_id: (row.account_id as string | null) ?? null,
    reimbursement_required: Boolean(row.reimbursement_required),
    card_assignment_id: (row.card_assignment_id as string | null) ?? null,
    receipt_url: (row.receipt_url as string | null) ?? null,
    receipt_path: (row.receipt_path as string | null) ?? null,
    receipt_required: Boolean(row.receipt_required),
    overspend_warning: (row.overspend_warning as string | null) ?? null,
    overspend_allowed: Boolean(row.overspend_allowed),
    admin_notes: (row.admin_notes as string | null) ?? null,
    change_request_note: (row.change_request_note as string | null) ?? null,
    status: row.status as PortalExpenseSubmissionStatus,
    approved_by: (row.approved_by as string | null) ?? null,
    approved_at: (row.approved_at as string | null) ?? null,
    linked_manual_transaction_id: (row.linked_manual_transaction_id as string | null) ?? null,
    linked_bank_transaction_id: (row.linked_bank_transaction_id as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

async function getExpenseSettings(workspaceId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('organisation_settings')
    .select('portal_expense_receipts_required, allow_portal_expense_overspend_submission')
    .eq('organisation_id', workspaceId)
    .maybeSingle();

  return {
    receiptsRequired: data?.portal_expense_receipts_required !== false,
    allowOverspendSubmission: data?.allow_portal_expense_overspend_submission !== false,
  };
}

async function enforcePortalExpenseSubmitScope(context: PortalPermissionContext, input: PortalExpenseInput) {
  await enforcePortalPermissionForContext(context, 'expenses', 'submit', {
    scope: 'own_records',
    ownerUserId: context.user.id,
    requireSubmit: true,
  });

  await enforcePortalPermissionForContext(context, 'expenses', 'submit', {
    scope: 'assigned_budgets',
    budgetId: input.budgetId,
    budgetCategoryId: input.budgetCategoryId,
    requireSubmit: true,
  });
  await enforcePortalPermissionForContext(context, 'expenses', 'submit', {
    scope: 'assigned_funds',
    fundId: input.fundId,
    requireSubmit: true,
  });
  await enforcePortalPermissionForContext(context, 'expenses', 'submit', {
    scope: 'assigned_categories',
    categoryId: input.accountId,
    requireSubmit: true,
  });

  if (input.method === 'card') {
    const admin = createAdminClient();
    const { data } = await admin
      .from('user_card_assignments')
      .select('id')
      .eq('workspace_id', context.orgId)
      .eq('user_id', context.user.id)
      .eq('id', input.cardAssignmentId)
      .eq('status', 'active')
      .maybeSingle();
    if (!data) throw new PortalPermissionError('This card is not assigned to you.');
  }
}

async function getBudgetWarning(
  workspaceId: string,
  input: PortalExpenseInput,
  allowOverspendSubmission: boolean,
): Promise<PortalExpenseOverspendWarning> {
  if (!input.budgetId || !input.accountId) return { blocked: false, message: null, remainingPence: null };

  const admin = createAdminClient();
  const { data: lines } = await admin
    .from('budget_lines')
    .select('account_id, fund_id, m01_pence, m02_pence, m03_pence, m04_pence, m05_pence, m06_pence, m07_pence, m08_pence, m09_pence, m10_pence, m11_pence, m12_pence')
    .eq('budget_id', input.budgetId)
    .eq('account_id', input.accountId);

  const matchingLines = ((lines ?? []) as Record<string, unknown>[])
    .filter((line) => !input.fundId || !line.fund_id || line.fund_id === input.fundId);
  if (matchingLines.length === 0) return { blocked: false, message: null, remainingPence: null };

  const budgetPence = matchingLines.reduce((sum, line) => sum + [
    'm01_pence',
    'm02_pence',
    'm03_pence',
    'm04_pence',
    'm05_pence',
    'm06_pence',
    'm07_pence',
    'm08_pence',
    'm09_pence',
    'm10_pence',
    'm11_pence',
    'm12_pence',
  ].reduce((monthSum, key) => monthSum + Number(line[key] ?? 0), 0), 0);

  const { data: actualLines } = await admin
    .from('journal_lines')
    .select('fund_id, debit_pence, credit_pence, journals!inner(status)')
    .eq('organisation_id', workspaceId)
    .eq('account_id', input.accountId)
    .eq('journals.status', 'posted');

  const usedPence = ((actualLines ?? []) as Record<string, unknown>[])
    .filter((line) => !input.fundId || line.fund_id === input.fundId)
    .reduce((sum, line) => sum + Math.abs(Number(line.debit_pence ?? 0) - Number(line.credit_pence ?? 0)), 0);

  const remainingPence = budgetPence - usedPence;
  if (input.amountPence <= remainingPence) return { blocked: false, message: null, remainingPence };

  return {
    blocked: !allowOverspendSubmission,
    message: `This expense is over the assigned budget by ${new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format((input.amountPence - remainingPence) / 100)}.`,
    remainingPence,
  };
}

async function maybeFindDuplicate(workspaceId: string, input: PortalExpenseInput) {
  const admin = createAdminClient();
  const from = new Date(`${input.expenseDate}T00:00:00Z`);
  const to = new Date(from);
  from.setDate(from.getDate() - 14);
  to.setDate(to.getDate() + 14);
  const { data } = await admin
    .from('manual_transactions')
    .select('id')
    .eq('organisation_id', workspaceId)
    .eq('type', 'expense')
    .eq('amount_pence', input.amountPence)
    .gte('transaction_date', from.toISOString().slice(0, 10))
    .lte('transaction_date', to.toISOString().slice(0, 10))
    .neq('status', 'voided')
    .limit(1)
    .maybeSingle();
  return data?.id as string | undefined;
}

function rowFromInput(workspaceId: string, userId: string, input: PortalExpenseInput, settings: Awaited<ReturnType<typeof getExpenseSettings>>) {
  return {
    workspace_id: workspaceId,
    submitted_by: userId,
    expense_date: input.expenseDate,
    amount_pence: input.amountPence,
    detail: cleanText(input.detail) ?? '',
    method: input.method,
    supplier_id: input.supplierId ?? null,
    supplier_name: cleanText(input.supplierName),
    budget_id: input.budgetId ?? null,
    budget_category_id: input.budgetCategoryId ?? null,
    fund_id: input.fundId ?? null,
    account_id: input.accountId ?? null,
    reimbursement_required: Boolean(input.reimbursementRequired),
    card_assignment_id: input.cardAssignmentId ?? null,
    receipt_required: settings.receiptsRequired,
  };
}

function refreshExpensePaths() {
  revalidatePath('/portal/expenses');
  revalidatePath('/portal/dashboard');
  revalidatePath('/workflows/portal-expenses');
}

export async function listPortalExpenseSubmissions(
  filters: { status?: PortalExpenseSubmissionStatus | 'all'; admin?: boolean } = {},
): Promise<{ data: PortalExpenseSubmissionRow[]; error: string | null }> {
  const { orgId, role, user } = await getActiveOrg();
  const supabase = await createClient();

  let query = supabase
    .from('portal_expense_submissions')
    .select('*')
    .eq('workspace_id', orgId)
    .order('created_at', { ascending: false });

  if (filters.status && filters.status !== 'all' && STATUSES.includes(filters.status)) {
    query = query.eq('status', filters.status);
  }
  if (!filters.admin || (role !== 'admin' && role !== 'treasurer')) {
    query = query.eq('submitted_by', user.id);
  }

  const { data, error } = await query;
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []).map((row) => mapExpenseRow(row as Record<string, unknown>)), error: null };
}

export async function listPortalExpenseFormOptions(): Promise<{ data: PortalExpenseSubmissionFormOptions; error: string | null }> {
  const { orgId, role, user } = await getActiveOrg();
  const admin = createAdminClient();
  const settings = await getExpenseSettings(orgId);

  const [budgetAssignmentsRes, fundAssignmentsRes, categoryAssignmentsRes, cardAssignmentsRes, suppliersRes] = await Promise.all([
    admin
      .from('user_budget_assignments')
      .select('budget_id, budget_category_id, spending_limit, can_submit_against, budgets(id, name, year)')
      .eq('workspace_id', orgId)
      .eq('user_id', user.id)
      .eq('can_submit_against', true),
    admin
      .from('user_fund_assignments')
      .select('fund_id, can_submit_against, funds(id, name)')
      .eq('workspace_id', orgId)
      .eq('user_id', user.id)
      .eq('can_submit_against', true),
    admin
      .from('user_category_assignments')
      .select('category_id, can_submit_against, accounts(id, code, name)')
      .eq('workspace_id', orgId)
      .eq('user_id', user.id)
      .eq('can_submit_against', true),
    admin
      .from('user_card_assignments')
      .select('id, card_name, last_four, spending_limit, bank_account_id')
      .eq('workspace_id', orgId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('card_name'),
    admin
      .from('suppliers')
      .select('id, name')
      .eq('organisation_id', orgId)
      .order('name')
      .limit(100),
  ]);

  let budgets: PortalExpenseBudgetOption[] = (budgetAssignmentsRes.data ?? []).map((row) => {
    const budget = Array.isArray(row.budgets) ? row.budgets[0] : row.budgets;
    return {
      id: row.budget_id,
      name: budget?.name ?? 'Assigned budget',
      secondary: budget?.year ? String(budget.year) : null,
      budgetCategoryId: row.budget_category_id ?? null,
      spendingLimit: row.spending_limit === null ? null : Number(row.spending_limit ?? 0),
      remainingPence: row.spending_limit === null ? null : Number(row.spending_limit ?? 0),
      canSubmitAgainst: Boolean(row.can_submit_against),
    };
  });
  let funds: PortalExpenseOption[] = (fundAssignmentsRes.data ?? []).map((row) => {
    const fund = Array.isArray(row.funds) ? row.funds[0] : row.funds;
    return { id: row.fund_id, name: fund?.name ?? 'Assigned fund', canSubmitAgainst: Boolean(row.can_submit_against) };
  });
  let accounts: PortalExpenseOption[] = (categoryAssignmentsRes.data ?? []).map((row) => {
    const account = Array.isArray(row.accounts) ? row.accounts[0] : row.accounts;
    return {
      id: row.category_id,
      name: account?.name ?? 'Assigned category',
      secondary: account?.code ?? null,
      canSubmitAgainst: Boolean(row.can_submit_against),
    };
  });

  if ((role === 'admin' || role === 'treasurer') && (budgets.length === 0 || funds.length === 0 || accounts.length === 0)) {
    const [allBudgets, allFunds, allAccounts] = await Promise.all([
      admin.from('budgets').select('id, name, year').eq('organisation_id', orgId).order('year', { ascending: false }),
      admin.from('funds').select('id, name').eq('organisation_id', orgId).eq('is_active', true).order('name'),
      admin.from('accounts').select('id, code, name').eq('organisation_id', orgId).eq('is_active', true).order('code'),
    ]);
    if (budgets.length === 0) {
      budgets = (allBudgets.data ?? []).map((budget) => ({
        id: budget.id,
        name: budget.name,
        secondary: String(budget.year ?? ''),
        budgetCategoryId: null,
        spendingLimit: null,
        remainingPence: null,
        canSubmitAgainst: true,
      }));
    }
    if (funds.length === 0) funds = (allFunds.data ?? []).map((fund) => ({ id: fund.id, name: fund.name, canSubmitAgainst: true }));
    if (accounts.length === 0) accounts = (allAccounts.data ?? []).map((account) => ({ id: account.id, name: account.name, secondary: account.code, canSubmitAgainst: true }));
  }

  const cards: PortalExpenseCardOption[] = (cardAssignmentsRes.data ?? []).map((card) => ({
    id: card.id,
    name: card.card_name,
    lastFour: card.last_four ?? null,
    bankAccountId: card.bank_account_id ?? null,
    spendingLimit: card.spending_limit === null ? null : Number(card.spending_limit ?? 0),
    canSubmitAgainst: true,
  }));
  const suppliers: PortalExpenseOption[] = (suppliersRes.data ?? []).map((supplier) => ({ id: supplier.id, name: supplier.name }));

  return {
    data: {
      receiptsRequired: settings.receiptsRequired,
      allowOverspendSubmission: settings.allowOverspendSubmission,
      budgets,
      funds,
      accounts,
      cards,
      suppliers,
    },
    error: budgetAssignmentsRes.error?.message
      ?? fundAssignmentsRes.error?.message
      ?? categoryAssignmentsRes.error?.message
      ?? cardAssignmentsRes.error?.message
      ?? suppliersRes.error?.message
      ?? null,
  };
}

export async function savePortalExpenseDraft(input: PortalExpenseInput): Promise<ActionResult<{ id: string }>> {
  await assertWriteAllowed();
  const ctx = await getActiveOrg();
  const validation = validateInput(input, false);
  if (validation) return { data: null, error: validation };

  try {
    await enforcePortalPermissionForContext(ctx, 'expenses', 'create', { scope: 'own_records', ownerUserId: ctx.user.id });
  } catch (error) {
    return { data: null, error: permissionMessage(error) };
  }

  const settings = await getExpenseSettings(ctx.orgId);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('portal_expense_submissions')
    .insert({ ...rowFromInput(ctx.orgId, ctx.user.id, input, settings), status: 'draft' })
    .select('id')
    .single();

  if (error || !data) return { data: null, error: error?.message ?? 'Failed to save draft.' };
  refreshExpensePaths();
  return { data: { id: data.id }, error: null };
}

export async function updatePortalExpenseDraft(id: string, input: PortalExpenseInput): Promise<ActionResult<{ id: string }>> {
  await assertWriteAllowed();
  const ctx = await getActiveOrg();
  const validation = validateInput(input, false);
  if (validation) return { data: null, error: validation };

  const settings = await getExpenseSettings(ctx.orgId);
  const supabase = await createClient();
  const { error } = await supabase
    .from('portal_expense_submissions')
    .update({ ...rowFromInput(ctx.orgId, ctx.user.id, input, settings), status: 'draft' })
    .eq('workspace_id', ctx.orgId)
    .eq('submitted_by', ctx.user.id)
    .eq('id', id)
    .in('status', ['draft', 'changes_requested']);

  if (error) return { data: null, error: error.message };
  refreshExpensePaths();
  return { data: { id }, error: null };
}

export async function submitPortalExpense(id: string, input: PortalExpenseInput): Promise<ActionResult<{ id: string }>> {
  await assertWriteAllowed();
  const ctx = await getActiveOrg();
  const validation = validateInput(input, true);
  if (validation) return { data: null, error: validation };

  try {
    await enforcePortalExpenseSubmitScope(ctx, input);
  } catch (error) {
    return { data: null, error: permissionMessage(error) };
  }

  const settings = await getExpenseSettings(ctx.orgId);
  const warning = await getBudgetWarning(ctx.orgId, input, settings.allowOverspendSubmission);
  if (warning.blocked) return { data: null, error: warning.message ?? 'This expense exceeds your assigned budget.', warning };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('portal_expense_submissions')
    .select('receipt_path')
    .eq('workspace_id', ctx.orgId)
    .eq('submitted_by', ctx.user.id)
    .eq('id', id)
    .maybeSingle();
  if (settings.receiptsRequired && !existing?.receipt_path) {
    return { data: null, error: 'A receipt is required before this expense can be submitted.' };
  }

  const { error } = await supabase
    .from('portal_expense_submissions')
    .update({
      ...rowFromInput(ctx.orgId, ctx.user.id, input, settings),
      status: 'submitted',
      overspend_warning: warning.message,
      overspend_allowed: Boolean(warning.message && !warning.blocked),
    })
    .eq('workspace_id', ctx.orgId)
    .eq('submitted_by', ctx.user.id)
    .eq('id', id)
    .in('status', ['draft', 'changes_requested']);

  if (error) return { data: null, error: error.message };
  await createPortalNotification({
    workspaceId: ctx.orgId,
    userId: ctx.user.id,
    type: 'expense_submitted',
    title: 'Expense submitted',
    body: 'Your expense has been sent for admin review.',
    sourceType: 'portal_expense_submission',
    sourceId: id,
    href: '/portal/expenses',
  });
  refreshExpensePaths();
  return { data: { id }, error: null, warning };
}

export async function uploadPortalExpenseReceipt(submissionId: string, formData: FormData): Promise<ActionResult<{ path: string; url: string }>> {
  await assertWriteAllowed();
  const ctx = await getActiveOrg();
  try {
    await enforcePortalPermissionForContext(ctx, 'expenses', 'upload', { scope: 'own_records', ownerUserId: ctx.user.id });
  } catch (error) {
    return { data: null, error: permissionMessage(error) };
  }

  const file = formData.get('receipt');
  if (!(file instanceof File) || file.size <= 0) return { data: null, error: 'Receipt file is required.' };
  if (file.size > 10 * 1024 * 1024) return { data: null, error: 'Receipt file must be 10MB or less.' };
  if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
    return { data: null, error: 'Receipts must be a PDF, JPG, or PNG.' };
  }

  const safeName = file.name.toLowerCase().replace(/[^a-z0-9.\-_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'receipt';
  const path = `${ctx.orgId}/portal-expense-submissions/${submissionId}/${Date.now()}-${safeName}`;
  const supabase = await createClient();
  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from(FINANCIAL_EVIDENCE_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploadError) return { data: null, error: uploadError.message };

  const url = buildEvidenceAccessPath(path);
  const { error } = await supabase
    .from('portal_expense_submissions')
    .update({ receipt_path: path, receipt_url: url })
    .eq('workspace_id', ctx.orgId)
    .eq('submitted_by', ctx.user.id)
    .eq('id', submissionId)
    .in('status', ['draft', 'changes_requested']);
  if (error) return { data: null, error: error.message };

  refreshExpensePaths();
  return { data: { path, url }, error: null };
}

async function getAdminSubmission(id: string) {
  const { orgId, role, user } = await getActiveOrg();
  try {
    assertCanPerform(role, 'approve', 'workflows');
    await enforcePortalPermissionForContext({ orgId, role, user }, 'expenses', 'approve');
  } catch (error) {
    return { submission: null, error: permissionMessage(error), context: { orgId, role, user } };
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('portal_expense_submissions')
    .select('*')
    .eq('workspace_id', orgId)
    .eq('id', id)
    .maybeSingle();
  return { submission: data ? mapExpenseRow(data as Record<string, unknown>) : null, error: error?.message ?? null, context: { orgId, role, user } };
}

export async function requestPortalExpenseChanges(params: PortalExpenseActionParams): Promise<ActionResult<{ id: string }>> {
  await assertWriteAllowed();
  const { submission, error, context } = await getAdminSubmission(params.id);
  if (error || !submission) return { data: null, error: error ?? 'Expense submission not found.' };
  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from('portal_expense_submissions')
    .update({ status: 'changes_requested', change_request_note: cleanText(params.note), admin_notes: cleanText(params.note) })
    .eq('workspace_id', context.orgId)
    .eq('id', params.id);
  if (updateError) return { data: null, error: updateError.message };
  await createPortalNotification({ workspaceId: context.orgId, userId: submission.submitted_by, type: 'expense_changes_requested', title: 'Changes requested', body: cleanText(params.note), sourceType: 'portal_expense_submission', sourceId: params.id, href: '/portal/expenses' });
  refreshExpensePaths();
  return { data: { id: params.id }, error: null };
}

export async function approvePortalExpenseSubmission(params: PortalExpenseActionParams): Promise<ActionResult<{ id: string }>> {
  await assertWriteAllowed();
  const { submission, error, context } = await getAdminSubmission(params.id);
  if (error || !submission) return { data: null, error: error ?? 'Expense submission not found.' };
  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from('portal_expense_submissions')
    .update({ status: 'approved', approved_by: context.user.id, approved_at: new Date().toISOString(), admin_notes: cleanText(params.note) })
    .eq('workspace_id', context.orgId)
    .eq('id', params.id)
    .eq('status', 'submitted');
  if (updateError) return { data: null, error: updateError.message };
  await createPortalNotification({ workspaceId: context.orgId, userId: submission.submitted_by, type: 'expense_approved', title: 'Expense approved', body: cleanText(params.note), sourceType: 'portal_expense_submission', sourceId: params.id, href: '/portal/expenses' });
  refreshExpensePaths();
  return { data: { id: params.id }, error: null };
}

export async function rejectPortalExpenseSubmission(params: PortalExpenseActionParams): Promise<ActionResult<{ id: string }>> {
  await assertWriteAllowed();
  const { submission, error, context } = await getAdminSubmission(params.id);
  if (error || !submission) return { data: null, error: error ?? 'Expense submission not found.' };
  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from('portal_expense_submissions')
    .update({ status: 'rejected', admin_notes: cleanText(params.note) })
    .eq('workspace_id', context.orgId)
    .eq('id', params.id);
  if (updateError) return { data: null, error: updateError.message };
  await createPortalNotification({ workspaceId: context.orgId, userId: submission.submitted_by, type: 'expense_rejected', title: 'Expense rejected', body: cleanText(params.note), sourceType: 'portal_expense_submission', sourceId: params.id, href: '/portal/expenses' });
  refreshExpensePaths();
  return { data: { id: params.id }, error: null };
}

export async function voidPortalExpenseSubmission(params: PortalExpenseActionParams): Promise<ActionResult<{ id: string }>> {
  await assertWriteAllowed();
  const { submission, error, context } = await getAdminSubmission(params.id);
  if (error || !submission) return { data: null, error: error ?? 'Expense submission not found.' };
  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from('portal_expense_submissions')
    .update({ status: 'voided', admin_notes: cleanText(params.note) })
    .eq('workspace_id', context.orgId)
    .eq('id', params.id);
  if (updateError) return { data: null, error: updateError.message };
  await createPortalNotification({ workspaceId: context.orgId, userId: submission.submitted_by, type: 'expense_voided', title: 'Expense voided', body: cleanText(params.note), sourceType: 'portal_expense_submission', sourceId: params.id, href: '/portal/expenses' });
  refreshExpensePaths();
  return { data: { id: params.id }, error: null };
}

export async function convertPortalExpenseToManualTransaction(id: string): Promise<ActionResult<{ id: string; manualTransactionId: string }>> {
  await assertWriteAllowed();
  const { submission, error, context } = await getAdminSubmission(id);
  if (error || !submission) return { data: null, error: error ?? 'Expense submission not found.' };
  if (!['approved', 'awaiting_bank_match'].includes(submission.status)) return { data: null, error: 'Only approved expenses can be converted.' };
  if (submission.linked_manual_transaction_id) {
    return { data: null, error: 'This expense has already been converted.' };
  }
  if (!submission.account_id || !submission.fund_id) return { data: null, error: 'Fund and account are required before conversion.' };

  const duplicateId = await maybeFindDuplicate(context.orgId, {
    expenseDate: submission.expense_date,
    amountPence: submission.amount_pence,
    detail: submission.detail,
    method: submission.method,
  });
  if (duplicateId) return { data: null, error: 'A similar manual transaction already exists. Review duplicates before converting.' };

  const admin = createAdminClient();
  const requiresBankMatch = submission.method !== 'cash' || submission.reimbursement_required;
  const { data: tx, error: txError } = await admin
    .from('manual_transactions')
    .insert({
      organisation_id: context.orgId,
      type: 'expense',
      transaction_date: submission.expense_date,
      amount_pence: submission.amount_pence,
      description: submission.detail,
      payee_payer_name: submission.supplier_name,
      reference: `Portal expense ${submission.id.slice(0, 8)}`,
      payment_method: submission.method,
      expected_bank_account_id: null,
      status: requiresBankMatch ? 'awaiting_bank_match' : 'posted',
      approval_status: 'approved',
      requires_bank_match: requiresBankMatch,
      created_by: submission.submitted_by,
      approved_by: context.user.id,
      approved_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (txError || !tx) return { data: null, error: txError?.message ?? 'Failed to create manual transaction.' };

  const { error: lineError } = await admin.from('manual_transaction_lines').insert({
    organisation_id: context.orgId,
    manual_transaction_id: tx.id,
    fund_id: submission.fund_id,
    account_id: submission.account_id,
    amount_pence: submission.amount_pence,
    direction: 'out',
    description: submission.detail,
    line_order: 1,
  });
  if (lineError) {
    await admin.from('manual_transactions').delete().eq('id', tx.id);
    return { data: null, error: lineError.message };
  }

  const nextStatus: PortalExpenseSubmissionStatus = requiresBankMatch ? 'awaiting_bank_match' : 'paid';
  const { error: updateError } = await admin
    .from('portal_expense_submissions')
    .update({ linked_manual_transaction_id: tx.id, status: nextStatus })
    .eq('workspace_id', context.orgId)
    .eq('id', id);
  if (updateError) return { data: null, error: updateError.message };

  await logAuditEvent({ orgId: context.orgId, userId: context.user.id, action: 'portal_expense_convert_manual_transaction', entityType: 'portal_expense_submission', entityId: id, metadata: { manualTransactionId: tx.id } });
  await createPortalNotification({ workspaceId: context.orgId, userId: submission.submitted_by, type: 'expense_awaiting_bank_match', title: requiresBankMatch ? 'Expense awaiting bank match' : 'Expense marked paid', body: 'Your approved expense has been converted into an accounting transaction.', sourceType: 'portal_expense_submission', sourceId: id, href: '/portal/expenses' });
  refreshExpensePaths();
  revalidatePath('/transactions');
  return { data: { id, manualTransactionId: tx.id }, error: null };
}

export async function linkPortalExpenseToBankTransaction(params: { id: string; bankLineId: string }): Promise<ActionResult<{ id: string }>> {
  await assertWriteAllowed();
  const { submission, error, context } = await getAdminSubmission(params.id);
  if (error || !submission) return { data: null, error: error ?? 'Expense submission not found.' };
  const admin = createAdminClient();
  const { data: bankLine } = await admin
    .from('bank_lines')
    .select('id, workspace_id')
    .eq('workspace_id', context.orgId)
    .eq('id', params.bankLineId)
    .maybeSingle();
  if (!bankLine) return { data: null, error: 'Bank transaction not found.' };

  if (submission.linked_manual_transaction_id) {
    await admin
      .from('manual_transactions')
      .update({ matched_bank_transaction_id: params.bankLineId, status: 'reconciled', reconciled_at: new Date().toISOString() })
      .eq('organisation_id', context.orgId)
      .eq('id', submission.linked_manual_transaction_id);
  }
  const { error: updateError } = await admin
    .from('portal_expense_submissions')
    .update({ linked_bank_transaction_id: params.bankLineId, status: 'reconciled' })
    .eq('workspace_id', context.orgId)
    .eq('id', params.id);
  if (updateError) return { data: null, error: updateError.message };

  await createPortalNotification({ workspaceId: context.orgId, userId: submission.submitted_by, type: 'expense_reconciled', title: 'Expense reconciled', body: 'Your expense has been matched to a bank transaction.', sourceType: 'portal_expense_submission', sourceId: params.id, href: '/portal/expenses' });
  refreshExpensePaths();
  return { data: { id: params.id }, error: null };
}
